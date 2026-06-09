#!/usr/bin/env node
import 'dotenv/config';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join, basename } from 'path';
import { downloadAudio } from './lib/ytdlp.js';
import { GitHubMusicClient } from './lib/github-client.js';

function usage() {
  console.log('Usage: node download.js <youtube-url> [--name <filename>] [--upload]');
  process.exit(1);
}

const url = process.argv[2];
if (!url || url.startsWith('--')) usage();

const args = process.argv.slice(3);
const nameFlag = args.indexOf('--name');
const customName = nameFlag !== -1 ? args[nameFlag + 1] : null;
const shouldUpload = args.includes('--upload');

if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
  console.error('❌ Only YouTube URLs are supported.');
  process.exit(1);
}

const tmpDir = await fs.mkdtemp(join(tmpdir(), 'music-download-'));
try {
  console.log('⏳ Downloading audio with yt-dlp…');
  const filePath = await downloadAudio(url, tmpDir, customName);
  const fileName = basename(filePath);
  console.log(`✅ Downloaded: ${filePath}`);

  if (!shouldUpload) {
    // Move to current working directory
    const dest = join(process.cwd(), fileName);
    await fs.rename(filePath, dest);
    console.log(`📁 Saved to: ${dest}`);
    process.exit(0);
  }

  console.log('⏳ Uploading to GitHub…');
  const github = new GitHubMusicClient();
  const fileBuffer = await fs.readFile(filePath);
  const destPath = await github.uploadFile(fileName, fileBuffer, `Add ${fileName} via music-scripts`);
  console.log(`✅ Uploaded to ${destPath}`);
} catch (err) {
  console.error('❌ Failed:', err.message);
  process.exit(1);
} finally {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}
