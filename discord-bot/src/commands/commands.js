import {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ComponentType,
} from 'discord.js';
import { formatBytes } from '../player.js';

// ─── /list ──────────────────────────────────────────────────────────────────

export const listData = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Browse all audio tracks in the GitHub repo')
  .addIntegerOption((opt) =>
    opt.setName('page').setDescription('Page number').setRequired(false).setMinValue(1),
  )
  .addBooleanOption((opt) =>
    opt.setName('refresh').setDescription('Force-refresh the file list from GitHub').setRequired(false),
  );

export async function listExecute(interaction, _players, github) {
  await interaction.deferReply();
  const forceRefresh = interaction.options.getBoolean('refresh') ?? false;
  let page = interaction.options.getInteger('page') ?? 1;

  let tracks;
  try {
    tracks = await github.listTracks(forceRefresh);
  } catch (err) {
    return interaction.editReply(`❌ Failed to fetch track list: \`${err.message}\``);
  }

  if (tracks.length === 0) {
    return interaction.editReply('📂 No audio files found in the configured GitHub path.');
  }

  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));

  function buildPayload(p) {
    p = Math.min(Math.max(p, 1), totalPages);
    const slice = tracks.slice((p - 1) * pageSize, p * pageSize);
    const lines = slice.map(
      (t, i) => `\`${(p - 1) * pageSize + i + 1}.\` **${t.displayName}**  \`${t.name.split('.').pop()}\``,
    );
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🎵  Music Library — ${tracks.length} track(s)`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Page ${p}/${totalPages} · Use /play <name> to queue a track` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`list_prev_${p}`)
        .setLabel('◀️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(p === 1),
      new ButtonBuilder()
        .setCustomId(`list_next_${p}`)
        .setLabel('▶️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(p === totalPages),
    );
    return { embeds: [embed], components: [row] };
  }

  await interaction.editReply(buildPayload(page));

  const message = await interaction.fetchReply();
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
  });

  collector.on('collect', async (btn) => {
    if (btn.user.id !== interaction.user.id) {
      return btn.reply({ content: '❌ Only the command user can browse pages.', flags: 64 });
    }
    if (btn.customId.startsWith('list_prev_')) page -= 1;
    else if (btn.customId.startsWith('list_next_')) page += 1;
    await btn.update(buildPayload(page));
  });

  collector.on('end', () => {
    message.edit({ components: [] }).catch(() => {});
  });
}

// ─── /queue ─────────────────────────────────────────────────────────────────

export const queueData = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Show the current playback queue')
  .addIntegerOption((opt) =>
    opt.setName('page').setDescription('Page number').setRequired(false).setMinValue(1),
  );

export async function queueExecute(interaction, players) {
  const player = players.get(interaction.guildId);
  if (!player || (!player.current && player.queue.length === 0)) {
    return interaction.reply({ content: '📭 The queue is empty.', ephemeral: true });
  }
  const page = interaction.options.getInteger('page') ?? 1;
  return interaction.reply({ embeds: [player.queueEmbed(page)] });
}

// ─── /skip ──────────────────────────────────────────────────────────────────

export const skipData = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Skip the current track');

export async function skipExecute(interaction, players) {
  const player = players.get(interaction.guildId);
  if (!player?.isPlaying) {
    return interaction.reply({ content: '❌ Nothing is playing right now.', ephemeral: true });
  }
  const skipped = player.current?.displayName ?? 'current track';
  console.log(`[Command:/skip] guild=${interaction.guildId} user=${interaction.user.tag} skipped="${skipped}" queue=${player.queue.length}`);
  player.skip();
  return interaction.reply(`⏭️  Skipped **${skipped}**.`);
}

// ─── /stop ──────────────────────────────────────────────────────────────────

export const stopData = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop playback, clear the queue, and leave the voice channel');

export async function stopExecute(interaction, players) {
  const player = players.get(interaction.guildId);
  if (!player) {
    return interaction.reply({ content: '❌ Not connected to any voice channel.', ephemeral: true });
  }
  console.log(`[Command:/stop] guild=${interaction.guildId} user=${interaction.user.tag}`);
  player.destroy('/stop');
  players.delete(interaction.guildId);
  return interaction.reply('⏹️  Stopped and left the voice channel.');
}

// ─── /pause ─────────────────────────────────────────────────────────────────

export const pauseData = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Pause or resume playback');

export async function pauseExecute(interaction, players) {
  const player = players.get(interaction.guildId);
  if (!player) {
    return interaction.reply({ content: '❌ Nothing is playing.', ephemeral: true });
  }
  if (player.isPlaying) {
    player.pause();
    return interaction.reply('⏸️  Paused.');
  }
  if (player.isPaused) {
    player.resume();
    return interaction.reply('▶️  Resumed.');
  }
  return interaction.reply({ content: '❌ Nothing is playing.', ephemeral: true });
}

// ─── /nowplaying ─────────────────────────────────────────────────────────────

export const npData = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('Show the currently playing track');

export async function npExecute(interaction, players) {
  const player = players.get(interaction.guildId);
  const embed = player?.nowPlayingEmbed();
  if (!embed) {
    return interaction.reply({ content: '❌ Nothing is playing right now.', ephemeral: true });
  }
  return interaction.reply({ embeds: [embed] });
}

// ─── /shuffle ────────────────────────────────────────────────────────────────

export const shuffleData = new SlashCommandBuilder()
  .setName('shuffle')
  .setDescription('Shuffle the current queue');

export async function shuffleExecute(interaction, players) {
  const player = players.get(interaction.guildId);
  if (!player || player.queue.length < 2) {
    return interaction.reply({ content: '❌ Need at least 2 tracks in the queue to shuffle.', ephemeral: true });
  }
  player.shuffleQueue();
  return interaction.reply(`🔀  Queue shuffled (${player.queue.length} tracks).`);
}

// ─── /volume ─────────────────────────────────────────────────────────────────

export const volumeData = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('Set the playback volume')
  .addIntegerOption((opt) =>
    opt
      .setName('level')
      .setDescription('Volume 1–100')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100),
  );

export async function volumeExecute(interaction, players) {
  const player = players.get(interaction.guildId);
  if (!player) {
    return interaction.reply({ content: '❌ Not connected.', ephemeral: true });
  }
  const level = interaction.options.getInteger('level');
  player.setVolume(level / 100);
  const bar = '█'.repeat(Math.round(level / 10)) + '░'.repeat(10 - Math.round(level / 10));
  return interaction.reply(`🔊  Volume: \`${bar}\` **${level}%**`);
}

// ─── /disconnect ─────────────────────────────────────────────────────────────

export const disconnectData = new SlashCommandBuilder()
  .setName('disconnect')
  .setDescription('Kick the bot from the voice channel');

export async function disconnectExecute(interaction, players) {
  const player = players.get(interaction.guildId);
  if (!player) {
    return interaction.reply({ content: '❌ Not connected to any voice channel.', ephemeral: true });
  }
  console.log(`[Command:/disconnect] guild=${interaction.guildId} user=${interaction.user.tag}`);
  player.destroy('/disconnect');
  players.delete(interaction.guildId);
  return interaction.reply('👋  Disconnected from the voice channel.');
}

// ─── /playall ────────────────────────────────────────────────────────────────

export const playAllData = new SlashCommandBuilder()
  .setName('playall')
  .setDescription('Queue every track in the library and start playing')
  .addBooleanOption((opt) =>
    opt.setName('shuffle').setDescription('Shuffle the order').setRequired(false),
  );

export async function playAllExecute(interaction, players, github) {
  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    return interaction.reply({ content: '❌ You need to be in a voice channel.', ephemeral: true });
  }

  await interaction.deferReply();

  let tracks;
  try {
    tracks = await github.listTracks();
  } catch (err) {
    return interaction.editReply(`❌ Could not fetch tracks: \`${err.message}\``);
  }

  if (!tracks.length) {
    return interaction.editReply('📂 No audio files found in the repo.');
  }

  const guildId = interaction.guildId;
  let player = players.get(guildId);
  console.log(`[Command:/playall] guild=${guildId} user=${interaction.user.tag} existingPlayer=${!!player} connected=${player?.isConnected() ?? false} tracks=${tracks.length}`);

  if (!player) {
    const { MusicPlayer } = await import('../player.js');
    player = new MusicPlayer(guildId, github);
    players.set(guildId, player);
  }
  player.textChannel = interaction.channel;

  if (!player.isConnected()) {
    try {
      await player.connect(voiceChannel);
    } catch (err) {
      console.error(`[Command:/playall] connect failed:`, err.message);
      players.delete(guildId);
      return interaction.editReply(`❌ ${err.message}`);
    }
  }

  const shouldShuffle = interaction.options.getBoolean('shuffle') ?? false;
  const list = shouldShuffle ? [...tracks].sort(() => Math.random() - 0.5) : [...tracks];

  const [first, ...rest] = list;
  player.enqueue(rest);

  if (!player.isPlaying && !player.isPaused) {
    console.log(`[Command:/playall] starting first track="${first.displayName}" queue=${player.queue.length}`);
    await player.play(first);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('▶  Now Playing')
      .setDescription(`**${first.displayName}**`)
      .addFields(
        { name: 'Size', value: formatBytes(first.size), inline: true },
        { name: 'Queue', value: `${player.queue.length} track(s) remaining`, inline: true },
      )
      .setFooter({ text: first.path });
    return interaction.editReply({
      content: `${shouldShuffle ? '🔀' : '▶️'}  Queued **${list.length}** tracks.`,
      embeds: [embed],
    });
  }

  player.enqueue(first);
  console.log(`[Command:/playall] appended to existing queue queue=${player.queue.length}`);
  return interaction.editReply(`✅ Added **${list.length}** tracks to the queue.`);
}
