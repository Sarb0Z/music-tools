#!/usr/bin/env node
import 'dotenv/config';
import { GitHubMusicClient } from './lib/github-client.js';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const forceRefresh = args.includes('--refresh');

try {
  const github = new GitHubMusicClient();
  const tracks = await github.listTracks();

  if (asJson) {
    console.log(JSON.stringify(tracks, null, 2));
    process.exit(0);
  }

  if (tracks.length === 0) {
    console.log('📂 No audio files found.');
    process.exit(0);
  }

  console.log(`🎵  ${tracks.length} track(s) in ${github.owner}/${github.repo}/${github.basePath}\n`);
  for (const t of tracks) {
    const sizeMB = t.size ? (t.size / 1024 / 1024).toFixed(1) + ' MB' : 'unknown';
    console.log(`  • ${t.displayName}  (${sizeMB})`);
  }
} catch (err) {
  console.error('❌ Failed:', err.message);
  process.exit(1);
}
