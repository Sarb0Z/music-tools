import 'dotenv/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';

import { GitHubMusicClient } from './github.js';
import { MusicPlayer } from './player.js';

import { data as playData, execute as playExecute, autocomplete as playAutocomplete } from './commands/play.js';
import {
  listData, listExecute,
  queueData, queueExecute,
  skipData, skipExecute,
  stopData, stopExecute,
  pauseData, pauseExecute,
  npData, npExecute,
  shuffleData, shuffleExecute,
  volumeData, volumeExecute,
  disconnectData, disconnectExecute,
  playAllData, playAllExecute,
} from './commands/commands.js';
import {
  addSongData, addSongExecute,
  removeSongData, removeSongExecute,
  manageAutocomplete,
} from './commands/manage.js';

// ─── Validate env ────────────────────────────────────────────────────────────

const REQUIRED_ENV = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌  Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// ─── Shared state ────────────────────────────────────────────────────────────

/** One GitHubMusicClient shared across all guilds */
const github = new GitHubMusicClient();

/** Per-guild MusicPlayer instances: Map<guildId, MusicPlayer> */
const players = new Map();

// ─── Command registry ────────────────────────────────────────────────────────

const commands = new Map([
  [playData.name,       (i) => playExecute(i, players, github)],
  [listData.name,       (i) => listExecute(i, players, github)],
  [queueData.name,      (i) => queueExecute(i, players)],
  [skipData.name,       (i) => skipExecute(i, players)],
  [stopData.name,       (i) => stopExecute(i, players)],
  [pauseData.name,      (i) => pauseExecute(i, players)],
  [npData.name,         (i) => npExecute(i, players)],
  [shuffleData.name,    (i) => shuffleExecute(i, players)],
  [volumeData.name,     (i) => volumeExecute(i, players)],
  [disconnectData.name, (i) => disconnectExecute(i, players)],
  [playAllData.name,    (i) => playAllExecute(i, players, github)],
  [addSongData.name,    (i) => addSongExecute(i, players, github)],
  [removeSongData.name, (i) => removeSongExecute(i, players, github)],
]);

const autocompletes = new Map([
  [playData.name,       (i) => playAutocomplete(i, github)],
  [removeSongData.name, (i) => manageAutocomplete(i, github)],
]);

// ─── Discord client ───────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅  Logged in as ${c.user.tag}`);
  console.log(`📂  Serving from: ${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/${process.env.GITHUB_MUSIC_PATH ?? 'music'}`);
  // Pre-warm the file list cache
  github.listTracks().then((t) => console.log(`🎵  Found ${t.length} tracks`)).catch(console.error);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const handler = autocompletes.get(interaction.commandName);
    if (!handler) return;
    try {
      await handler(interaction);
    } catch (err) {
      console.error(`[Autocomplete:${interaction.commandName}]`, err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const handler = commands.get(interaction.commandName);
  if (!handler) return;

  console.log(`[Command:${interaction.commandName}] guild=${interaction.guildId} user=${interaction.user.tag}`);
  try {
    await handler(interaction);
  } catch (err) {
    console.error(`[Command:${interaction.commandName}]`, err);
    if (err.code === 50035 && err.requestBody) {
      console.error('[Command:InvalidBody]', JSON.stringify(err.requestBody, null, 2));
    }
    const msg = { content: `❌ An unexpected error occurred: \`${err.message}\``, ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

// Clean up players when the bot leaves a voice channel
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const botId = client.user?.id;

  // Bot left a channel entirely
  if (oldState.member?.id === botId && oldState.channelId && !newState.channelId) {
    console.log(`[VoiceState] Bot left channel ${oldState.channelId}, destroying player`);
    const player = players.get(oldState.guild.id);
    if (player) {
      player.destroy('voice-state-update');
      players.delete(oldState.guild.id);
    }
    return;
  }

  // Check alone status for any voice state change in a guild where we have a player
  const player = players.get(oldState.guild.id);
  if (player) {
    player.checkAloneStatus();
  }
});

client.login(process.env.DISCORD_TOKEN);

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down…`);
  for (const player of players.values()) player.destroy('shutdown');
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
