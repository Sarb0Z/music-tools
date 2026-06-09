import {
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  getVoiceConnection,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
} from '@discordjs/voice';
import { EmbedBuilder } from 'discord.js';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';
import { PassThrough } from 'stream';

export class MusicPlayer {
  constructor(guildId, githubClient) {
    this.guildId = guildId;
    this.github = githubClient;
    this.queue = [];           // Array of track objects
    this.current = null;
    this.connection = null;
    this.voiceChannel = null;
    this.textChannel = null;
    this.audioPlayer = createAudioPlayer();
    this.volume = 0.8;         // 0.0 – 1.0
    this._destroyed = false;
    this._idleTimeout = null;
    this._aloneTimeout = null;
    this._timeoutMs = 3 * 60 * 1000; // 3 minutes

    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      console.log(`[Player:${guildId}] Idle | current=${this.current?.displayName ?? 'null'} queue=${this.queue.length}`);
      if (!this._destroyed) this._playNext();
    });

    this.audioPlayer.on('error', (err) => {
      console.error(`[Player:${guildId}] AudioPlayer error | current=${this.current?.displayName ?? 'null'} queue=${this.queue.length} |`, err.message);
      if (!this._destroyed) this._playNext();
    });
  }

  // ─── Timeouts ────────────────────────────────────────────────────────────────

  _startIdleTimeout() {
    this._clearIdleTimeout();
    console.log(`[Player:${this.guildId}] Starting idle timeout (${this._timeoutMs}ms)`);
    this._idleTimeout = setTimeout(() => {
      console.log(`[Player:${this.guildId}] Idle timeout expired, destroying player`);
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription('👋  Left the voice channel because nothing has been playing for 3 minutes.');
      this.textChannel?.send({ embeds: [embed] }).catch(() => {});
      this.destroy('idle-timeout');
    }, this._timeoutMs);
  }

  _clearIdleTimeout() {
    if (this._idleTimeout) {
      clearTimeout(this._idleTimeout);
      this._idleTimeout = null;
    }
  }

  _startAloneTimeout() {
    this._clearAloneTimeout();
    console.log(`[Player:${this.guildId}] Starting alone timeout (${this._timeoutMs}ms)`);
    this._aloneTimeout = setTimeout(() => {
      console.log(`[Player:${this.guildId}] Alone timeout expired, destroying player`);
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription('👋  Left the voice channel because it\'s been empty for 3 minutes.');
      this.textChannel?.send({ embeds: [embed] }).catch(() => {});
      this.destroy('alone-timeout');
    }, this._timeoutMs);
  }

  _clearAloneTimeout() {
    if (this._aloneTimeout) {
      clearTimeout(this._aloneTimeout);
      this._aloneTimeout = null;
    }
  }

  checkAloneStatus() {
    if (!this.isConnected() || !this.voiceChannel) {
      this._clearAloneTimeout();
      return;
    }
    const humanCount = this.voiceChannel.members.filter((m) => !m.user.bot).size;
    if (humanCount === 0) {
      this._startAloneTimeout();
    } else {
      this._clearAloneTimeout();
    }
  }

  // ─── Connection ────────────────────────────────────────────────────────────

  async connect(voiceChannel) {
    console.log(`[Player:${this.guildId}] connect() → ${voiceChannel.name} (${voiceChannel.id})`);
    this.voiceChannel = voiceChannel;
    this._clearIdleTimeout();
    // Destroy any stale connection cached by @discordjs/voice before creating a new one
    getVoiceConnection(voiceChannel.guild.id)?.destroy();

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);
      console.log(`[Player:${this.guildId}] connect() → Ready`);
    } catch {
      console.error(`[Player:${this.guildId}] connect() → timeout`);
      if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        this.connection.destroy();
      }
      throw new Error('Could not connect to voice channel within 15 seconds.');
    }

    this.connection.subscribe(this.audioPlayer);
    // Give Discord a moment to populate the voice channel member cache before checking alone status
    setTimeout(() => this.checkAloneStatus(), 2_000);

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log(`[Player:${this.guildId}] VoiceConnection Disconnected`);
      try {
        // Give Discord up to 30s to recover from a voice-server migration
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 30_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 30_000),
        ]);
        console.log(`[Player:${this.guildId}] VoiceConnection recovered`);
      } catch {
        console.error(`[Player:${this.guildId}] VoiceConnection lost (no recovery)`);
        // Preserve queue — just tear down the connection
        this.connection?.destroy();
        this.connection = null;
      }
    });
  }

  isConnected() {
    return (
      this.connection &&
      this.connection.state.status !== VoiceConnectionStatus.Destroyed
    );
  }

  // ─── Queue management ──────────────────────────────────────────────────────

  /** Add a track (or array of tracks) to the queue */
  enqueue(tracks) {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    this.queue.push(...list);
    console.log(`[Player:${this.guildId}] enqueue(${list.length}) → queue=${this.queue.length}`);
    return list.length;
  }

  /** Clear the queue (does not stop the current track) */
  clearQueue() {
    this.queue = [];
  }

  /** Shuffle the queue in place (Fisher-Yates) */
  shuffleQueue() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  // ─── Playback ──────────────────────────────────────────────────────────────

  /** Start playing immediately (enqueue first if needed) */
  async play(track) {
    this._clearIdleTimeout();
    console.log(`[Player:${this.guildId}] play() → ${track.displayName}`);
    this.current = track;
    let stream;
    try {
      stream = await this.github.streamTrack(track.path);
    } catch (err) {
      console.error(`[Player:${this.guildId}] streamTrack failed:`, err.message);
      throw err;
    }

    // Start buffering the next track in the background while this one plays
    if (this.queue.length > 0) {
      const next = this.queue[0];
      this.github.preloadTrack(next.path).catch((err) =>
        console.error(`[Player:${this.guildId}] preload failed:`, err.message),
      );
    }

    const pcm = this._transcode(stream);
    const resource = createAudioResource(pcm, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });
    resource.volume?.setVolume(this.volume);
    this.audioPlayer.play(resource);
    console.log(`[Player:${this.guildId}] audioPlayer.play() called`);
  }

  /**
   * Pipe the raw GitHub stream through ffmpeg → 16-bit PCM at 48 kHz
   * so @discordjs/voice can consume it without caring about the source codec.
   */
  _transcode(inputStream) {
    const passthrough = new PassThrough({ highWaterMark: 512 * 1024 });

    const ffmpeg = spawn(
      ffmpegPath,
      [
        '-fflags', '+discardcorrupt', // drop corrupt input packets
        '-i', 'pipe:0',               // read from stdin
        '-f', 's16le',                // raw PCM
        '-ar', '48000',               // Discord expects 48 kHz
        '-ac', '2',                   // stereo
        'pipe:1',                     // write to stdout
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    inputStream.pipe(ffmpeg.stdin);
    ffmpeg.stdout.pipe(passthrough);

    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on('error', (err) => {
      console.error(`[Player:${this.guildId}] ffmpeg error:`, err.message);
      passthrough.destroy(err);
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0 && stderr) {
        console.error(`[Player:${this.guildId}] ffmpeg stderr:`, stderr.trim());
      }
      console.log(`[Player:${this.guildId}] ffmpeg exited code=${code}`);
    });

    ffmpeg.stdin.on('error', () => {});   // swallow broken-pipe noise

    return passthrough;
  }

  async _playNext() {
    console.log(`[Player:${this.guildId}] _playNext() | queue=${this.queue.length} connected=${this.isConnected()} destroyed=${this._destroyed}`);
    if (this.queue.length === 0) {
      console.log(`[Player:${this.guildId}] _playNext() → queue empty, clearing current`);
      this.current = null;
      this._startIdleTimeout();
      return;
    }
    if (!this.isConnected() && this.voiceChannel) {
      console.log(`[Player:${this.guildId}] _playNext() → attempting auto-reconnect`);
      try {
        await this.connect(this.voiceChannel);
      } catch (err) {
        console.error(`[Player:${this.guildId}] Auto-reconnect failed:`, err.message);
        return;
      }
    }
    if (!this.isConnected()) {
      console.log(`[Player:${this.guildId}] _playNext() → not connected, bailing`);
      return;
    }
    const next = this.queue.shift();
    console.log(`[Player:${this.guildId}] _playNext() → playing ${next.displayName}`);
    try {
      await this.play(next);
    } catch (err) {
      console.error(`[Player:${this.guildId}] Failed to play ${next.displayName}:`, err.message);
      await this._playNext();
      return;
    }
    // Auto-announce the newly started track
    if (this.textChannel) {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('▶  Now Playing')
        .setDescription(`**${next.displayName}**`)
        .addFields(
          { name: 'Size', value: formatBytes(next.size), inline: true },
          { name: 'Queue', value: `${this.queue.length} track(s) remaining`, inline: true },
        )
        .setFooter({ text: next.path });
      this.textChannel.send({ embeds: [embed] }).catch((err) =>
        console.error(`[Player:${this.guildId}] textChannel.send failed:`, err.message),
      );
    }
  }

  /** Skip the current track */
  skip() {
    console.log(`[Player:${this.guildId}] skip() | current=${this.current?.displayName ?? 'null'}`);
    this.audioPlayer.stop(true); // triggers Idle → _playNext
  }

  /** Pause playback */
  pause() {
    console.log(`[Player:${this.guildId}] pause()`);
    return this.audioPlayer.pause(true);
  }

  /** Resume playback */
  resume() {
    console.log(`[Player:${this.guildId}] resume()`);
    return this.audioPlayer.unpause();
  }

  setVolume(level) {
    this.volume = Math.max(0, Math.min(1, level));
    // Apply to the currently playing resource if any
    const state = this.audioPlayer.state;
    if (state.status !== AudioPlayerStatus.Idle) {
      state.resource?.volume?.setVolume(this.volume);
    }
  }

  get status() {
    return this.audioPlayer.state.status;
  }

  get isPlaying() {
    return this.status === AudioPlayerStatus.Playing;
  }

  get isPaused() {
    return this.status === AudioPlayerStatus.Paused;
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  destroy(reason = 'unknown') {
    console.log(`[Player:${this.guildId}] destroy(reason=${reason}) | current=${this.current?.displayName ?? 'null'} queue=${this.queue.length}`);
    this._destroyed = true;
    this._clearIdleTimeout();
    this._clearAloneTimeout();
    this.audioPlayer.stop(true);
    this.connection?.destroy();
    this.queue = [];
    this.current = null;
  }

  // ─── Embeds ────────────────────────────────────────────────────────────────

  nowPlayingEmbed() {
    if (!this.current) return null;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('▶  Now Playing')
      .setDescription(`**${this.current.displayName}**`)
      .addFields(
        { name: 'Size', value: formatBytes(this.current.size), inline: true },
        { name: 'Queue', value: `${this.queue.length} track(s) remaining`, inline: true },
      )
      .setFooter({ text: this.current.path });
    console.log('[Embed:nowPlaying]', JSON.stringify(embed.toJSON()));
    return embed;
  }

  queueEmbed(page = 1) {
    const pageSize = 10;
    const total = this.queue.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(Math.max(page, 1), totalPages);
    const slice = this.queue.slice((page - 1) * pageSize, page * pageSize);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📋  Queue')
      .setFooter({ text: `Page ${page}/${totalPages} · ${total} track(s) total` });

    if (this.current) {
      embed.addFields({ name: '▶  Now Playing', value: `**${this.current.displayName}**` });
    }

    if (slice.length === 0) {
      embed.setDescription('The queue is empty.');
    } else {
      const lines = slice.map(
        (t, i) => `\`${(page - 1) * pageSize + i + 1}.\` ${t.displayName}`,
      );
      embed.setDescription(lines.join('\n'));
    }

    console.log('[Embed:queue]', JSON.stringify(embed.toJSON()));
    return embed;
  }
}

export function formatBytes(bytes) {
  if (!bytes) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
