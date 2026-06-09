import { SlashCommandBuilder } from 'discord.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ─── yt-dlp helpers ──────────────────────────────────────────────────────────

const YT_DLP = process.env.YT_DLP_PATH || 'yt-dlp';

function execYtDlp(args) {
  return new Promise((resolve, reject) => {
    console.log(`[yt-dlp] spawning: ${YT_DLP} ${args.join(' ')}`);
    const proc = spawn(YT_DLP, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => {
      const line = d.toString().trim();
      if (line) console.log(`[yt-dlp] ${line}`);
      stderr += d;
    });
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('yt-dlp timed out after 5 minutes'));
    }, 5 * 60 * 1000);
    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`yt-dlp exited ${code}: ${stderr.trim()}`));
      else resolve(stdout.trim());
    });
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function downloadAudio(url, outDir, preferredName = null) {
  const outputTemplate = preferredName
    ? join(outDir, `${preferredName}.%(ext)s`)
    : join(outDir, '%(title)s.%(ext)s');

  const args = [
    '-i', '-x', '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '160k',
    '-o', outputTemplate,
    '--no-playlist',
    url,
  ];
  if (process.env.YT_DLP_COOKIES_PATH) {
    args.push('--cookies', process.env.YT_DLP_COOKIES_PATH);
  }
  await execYtDlp(args);

  const files = await fs.readdir(outDir);
  const audioFile = files.find((f) => f.endsWith('.mp3'));
  if (!audioFile) throw new Error('No audio file produced by yt-dlp');
  return join(outDir, audioFile);
}

// ─── /addsong ────────────────────────────────────────────────────────────────

export const addSongData = new SlashCommandBuilder()
  .setName('addsong')
  .setDescription('Download a song from YouTube and add it to the music repo')
  .addStringOption((opt) =>
    opt.setName('url').setDescription('YouTube URL').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('name').setDescription('Custom filename (optional, no extension)').setRequired(false),
  );

export async function addSongExecute(interaction, _players, github) {
  console.log(`[Command:/addsong] start url="${interaction.options.getString('url')}" name="${interaction.options.getString('name') ?? ''}"`);
  await interaction.deferReply();
  const url = interaction.options.getString('url');
  const customName = interaction.options.getString('name');

  if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
    return interaction.editReply('❌ Only YouTube URLs are supported.');
  }

  const tmpDir = await fs.mkdtemp(join(tmpdir(), 'musicbot-'));
  console.log(`[Command:/addsong] tmpDir=${tmpDir}`);
  try {
    await interaction.editReply('⏳ Downloading audio with yt-dlp…');
    console.log('[Command:/addsong] calling downloadAudio…');

    const filePath = await downloadAudio(url, tmpDir, customName);
    console.log(`[Command:/addsong] downloadAudio returned: ${filePath}`);
    const fileBuffer = await fs.readFile(filePath);
    const fileName = customName ? `${customName}.mp3` : filePath.split('/').pop();
    console.log(`[Command:/addsong] fileName=${fileName} size=${fileBuffer.length}`);

    await interaction.editReply('⏳ Uploading to GitHub…');
    console.log('[Command:/addsong] uploading to GitHub…');

    const destPath = github.basePath === '.' ? fileName : `${github.basePath}/${fileName}`;
    await github.uploadFile(destPath, fileBuffer, `Add ${fileName} via Discord bot`);
    console.log('[Command:/addsong] upload complete');

    github.invalidateCache();

    return interaction.editReply(`✅ Added **${fileName}** to the music repo.`);
  } catch (err) {
    console.error('[Command:/addsong] ERROR:', err);
    return interaction.editReply(`❌ Failed to add song: \`${err.message}\``);
  } finally {
    console.log(`[Command:/addsong] cleaning up ${tmpDir}`);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── /removesong ─────────────────────────────────────────────────────────────

export const removeSongData = new SlashCommandBuilder()
  .setName('removesong')
  .setDescription('Remove a track from the music repo')
  .addStringOption((opt) =>
    opt.setName('track').setDescription('Track name').setRequired(true).setAutocomplete(true),
  );

export async function removeSongExecute(interaction, _players, github) {
  await interaction.deferReply();
  const query = interaction.options.getString('track');

  const track = await github.findTrack(query);
  if (!track) {
    return interaction.editReply(`❌ No track found matching **${query}**.`);
  }

  try {
    const sha = await github.getFileSha(track.path);
    await github.deleteFile(track.path, `Remove ${track.name} via Discord bot`, sha);
    github.invalidateCache();
    return interaction.editReply(`🗑️ Removed **${track.name}** from the music repo.`);
  } catch (err) {
    console.error('[Command:/removesong]', err);
    return interaction.editReply(`❌ Failed to remove song: \`${err.message}\``);
  }
}

// ─── Autocomplete (shared for /removesong) ───────────────────────────────────

export async function manageAutocomplete(interaction, github) {
  const focused = interaction.options.getFocused();
  const tracks = await github.listTracks();
  const q = focused.toLowerCase();
  const choices = tracks
    .filter((t) => t.displayName.toLowerCase().includes(q))
    .slice(0, 25)
    .map((t) => ({ name: t.displayName, value: t.displayName }));
  await interaction.respond(choices);
}
