#!/usr/bin/env node
import 'dotenv/config';
import { promises as fs } from 'fs';
import { basename } from 'path';
import { GitHubMusicClient } from './lib/github-client.js';

function usage() {
  console.log('Usage: node upload.js <local-file> [--name <dest-name>]');
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath || filePath.startsWith('--')) usage();

const args = process.argv.slice(3);
const nameFlag = args.indexOf('--name');
const destName = nameFlag !== -1 ? args[nameFlag + 1] : basename(filePath);

try {
  const content = await fs.readFile(filePath);
  const github = new GitHubMusicClient();
  const uploadedPath = await github.uploadFile(destName, content, `Add ${destName} via music-scripts`);
  console.log(`✅ Uploaded to ${uploadedPath}`);
} catch (err) {
  console.error('❌ Failed:', err.message);
  process.exit(1);
}
