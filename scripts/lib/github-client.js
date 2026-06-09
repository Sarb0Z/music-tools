import { Octokit } from '@octokit/rest';

const AUDIO_EXTENSIONS = new Set([
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus', 'webm',
]);

function isAudioFile(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? AUDIO_EXTENSIONS.has(ext) : false;
}

export class GitHubMusicClient {
  constructor() {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    if (!token || !owner || !repo) {
      throw new Error('Missing required env: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
    }
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.basePath = process.env.GITHUB_MUSIC_PATH || 'music';
  }

  async listTracks() {
    return this._walk(this.basePath);
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
      } else if (item.type === 'file' && isAudioFile(item.name)) {
        results.push({
          name: item.name,
          displayName: item.name.replace(/\.[^.]+$/, ''),
          path: item.path,
          size: item.size,
          sha: item.sha,
        });
      }
    }

    return results;
  }

  async uploadFile(localPath, content, message) {
    const destPath = this.basePath === '.' ? localPath : `${this.basePath}/${localPath}`;
    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path: destPath,
      message,
      content: Buffer.from(content).toString('base64'),
    });
    return destPath;
  }

  async deleteFile(path, message) {
    const { data } = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
    });
    if (Array.isArray(data)) throw new Error(`${path} is a directory`);
    await this.octokit.repos.deleteFile({
      owner: this.owner,
      repo: this.repo,
      path,
      message,
      sha: data.sha,
    });
  }
}
