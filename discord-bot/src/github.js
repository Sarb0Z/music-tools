import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';

const AUDIO_EXTENSIONS = new Set([
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus', 'webm',
]);

export class GitHubMusicClient {
  constructor() {
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.owner = process.env.GITHUB_OWNER;
    this.repo = process.env.GITHUB_REPO;
    this.basePath = process.env.GITHUB_MUSIC_PATH || 'music';
    this._cache = null;
    this._cacheTime = 0;
    this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    this._streamCache = new Map(); // path -> { buffer, fetchedAt }
  }

  /** Returns true if the filename is a supported audio file */
  isAudioFile(name) {
    const ext = name.split('.').pop()?.toLowerCase();
    return ext ? AUDIO_EXTENSIONS.has(ext) : false;
  }

  /**
   * Recursively list all audio files under basePath.
   * Results are cached for CACHE_TTL_MS to avoid hammering the API.
   * @returns {Promise<Array<{ name: string, path: string, size: number, sha: string }>>}
   */
  async listTracks(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this._cache && now - this._cacheTime < this.CACHE_TTL_MS) {
      return this._cache;
    }

    const tracks = await this._walk(this.basePath);
    this._cache = tracks;
    this._cacheTime = now;
    return tracks;
  }

  async _walk(path) {
    const { data } = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
    });

    const files = Array.isArray(data) ? data : [data];
    const results = [];

    for (const item of files) {
      if (item.type === 'dir') {
        const nested = await this._walk(item.path);
        results.push(...nested);
      } else if (item.type === 'file' && this.isAudioFile(item.name)) {
        results.push({
          name: item.name,
          displayName: item.name.replace(/\.[^.]+$/, ''), // strip extension
          path: item.path,
          size: item.size,
          sha: item.sha,
        });
      }
    }

    return results;
  }

  /**
   * Find a track by partial name match (case-insensitive).
   * @param {string} query
   * @returns {Promise<object|null>}
   */
  async findTrack(query) {
    const tracks = await this.listTracks();
    const q = query.toLowerCase();
    return (
      tracks.find((t) => t.displayName.toLowerCase() === q) ??
      tracks.find((t) => t.displayName.toLowerCase().includes(q)) ??
      null
    );
  }

  /**
   * Returns a readable Node.js stream for the given track path.
   * Uses the raw content endpoint with Bearer auth so private repos work.
   * @param {string} filePath  — e.g. "music/song.mp3"
   * @returns {Promise<import('stream').Readable>}
   */
  async streamTrack(filePath) {
    const cached = this._streamCache.get(filePath);
    if (cached) {
      const { Readable } = await import('stream');
      return Readable.from([cached.buffer]);
    }

    // Get the authenticated download URL via Octokit
    const { data } = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path: filePath,
    });

    if (Array.isArray(data)) throw new Error(`${filePath} is a directory, not a file`);

    // download_url is a short-lived, pre-signed URL that works for private repos
    const url = data.download_url;
    if (!url) throw new Error(`No download URL for ${filePath}`);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
    });

    if (!response.ok) {
      throw new Error(`GitHub fetch failed: ${response.status} ${response.statusText}`);
    }

    return response.body;
  }

  /** Download a track into memory so the next play() is instant and dropout-free */
  async preloadTrack(filePath) {
    if (this._streamCache.has(filePath)) return;
    console.log(`[GitHub] Preloading ${filePath}...`);
    const stream = await this.streamTrack(filePath);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    this._streamCache.set(filePath, { buffer });
    console.log(`[GitHub] Preloaded ${filePath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
  }

  /** Upload a file to the repo via the Contents API */
  async uploadFile(path, content, message) {
    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path,
      message,
      content: Buffer.from(content).toString('base64'),
    });
  }

  /** Delete a file from the repo via the Contents API */
  async deleteFile(path, message, sha) {
    await this.octokit.repos.deleteFile({
      owner: this.owner,
      repo: this.repo,
      path,
      message,
      sha,
    });
  }

  /** Fetch the current SHA for a single file */
  async getFileSha(path) {
    const { data } = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
    });
    if (Array.isArray(data)) throw new Error(`${path} is a directory`);
    return data.sha;
  }

  /** Invalidate the local file list cache */
  invalidateCache() {
    this._cache = null;
    this._cacheTime = 0;
  }
}
