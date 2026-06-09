/**
 * Run once (or whenever commands change):
 *   node deploy-commands.js
 *
 * To register for a specific guild only (instant, good for dev):
 *   GUILD_ID=123456789 node deploy-commands.js
 */
import 'dotenv/config';
import { REST, Routes } from 'discord.js';

import { data as playData } from './src/commands/play.js';
import {
  listData, queueData, skipData, stopData,
  pauseData, npData, shuffleData, volumeData, disconnectData, playAllData,
} from './src/commands/commands.js';
import {
  addSongData, removeSongData,
} from './src/commands/manage.js';

const commandBodies = [
  playData,
  playAllData,
  listData,
  queueData,
  skipData,
  stopData,
  pauseData,
  npData,
  shuffleData,
  volumeData,
  disconnectData,
  addSongData,
  removeSongData,
].map((c) => c.toJSON());

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

const guildId = process.env.GUILD_ID;

try {
  console.log(`Registering ${commandBodies.length} slash commands…`);

  let route;
  if (guildId) {
    route = Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId);
    console.log(`  Scope: guild ${guildId} (instant)`);
  } else {
    route = Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);
    console.log('  Scope: global (may take up to 1 hour)');
  }

  const data = await rest.put(route, { body: commandBodies });
  console.log(`✅  Successfully registered ${data.length} commands.`);
} catch (err) {
  console.error('❌  Deploy failed:', err);
  process.exit(1);
}
