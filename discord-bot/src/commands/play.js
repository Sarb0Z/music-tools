import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { formatBytes } from '../player.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play a track from the GitHub music repo')
  .addStringOption((opt) =>
    opt
      .setName('track')
      .setDescription('Track name (partial match) or leave blank to resume')
      .setRequired(false)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction, github) {
  const focused = interaction.options.getFocused();
  const tracks = await github.listTracks();
  const q = focused.toLowerCase();
  const choices = tracks
    .filter((t) => t.displayName.toLowerCase().includes(q))
    .slice(0, 25)
    .map((t) => ({ name: t.displayName, value: t.displayName }));
  await interaction.respond(choices);
}

export async function execute(interaction, players, github) {
  const query = interaction.options.getString('track');
  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    return interaction.reply({ content: '❌ You need to be in a voice channel.', ephemeral: true });
  }

  await interaction.deferReply();

  const guildId = interaction.guildId;
  let player = players.get(guildId);
  console.log(`[Command:/play] guild=${guildId} user=${interaction.user.tag} query="${query ?? ''}" existingPlayer=${!!player} connected=${player?.isConnected() ?? false}`);

  // If no query and player is paused, just resume
  if (!query) {
    if (player?.isPaused) {
      player.resume();
      return interaction.editReply('▶️  Resumed.');
    }
    return interaction.editReply({ content: '❓ Provide a track name to play, or use `/list` to browse.' });
  }

  // Find the track on GitHub
  let track;
  try {
    track = await github.findTrack(query);
  } catch (err) {
    console.error('[/play] GitHub error:', err.message);
    return interaction.editReply(`❌ Could not reach GitHub: \`${err.message}\``);
  }

  if (!track) {
    return interaction.editReply(`❌ No track found matching **${query}**. Try \`/list\` to see available tracks.`);
  }
  console.log(`[Command:/play] found track="${track.displayName}" size=${track.size}`);

  // Create or reuse the guild's player
  if (!player) {
    const { MusicPlayer } = await import('../player.js');
    player = new MusicPlayer(guildId, github);
    players.set(guildId, player);
    console.log(`[Command:/play] created new player`);
  }
  player.textChannel = interaction.channel;

  // Connect to voice if not already there
  if (!player.isConnected()) {
    try {
      await player.connect(voiceChannel);
    } catch (err) {
      console.error(`[Command:/play] connect failed:`, err.message);
      return interaction.editReply(`❌ Could not join voice channel: ${err.message}`);
    }
  }

  // If something is already playing, queue it instead
  if (player.isPlaying || player.isPaused) {
    player.enqueue(track);
    return interaction.editReply(`✅ Added **${track.displayName}** to the queue (position ${player.queue.length}).`);
  }

  // Start playing immediately
  try {
    await player.play(track);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('▶  Now Playing')
      .setDescription(`**${track.displayName}**`)
      .addFields(
        { name: 'Size', value: formatBytes(track.size), inline: true },
        { name: 'Queue', value: `${player.queue.length} track(s) remaining`, inline: true },
      )
      .setFooter({ text: track.path });
    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[/play] Playback error:', err.message);
    return interaction.editReply(`❌ Playback failed: \`${err.message}\``);
  }
}
