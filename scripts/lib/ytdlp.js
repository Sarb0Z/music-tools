import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const YT_DLP = process.env.YT_DLP_PATH || 'yt-dlp';

export function execYtDlp(args) {
  return new Promise((resolve, reject) => {
    console.log(`[yt-dlp] ${YT_DLP} ${args.join(' ')}`);
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

export async function downloadAudio(url, outDir, preferredName = null) {
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
