# music-tools

A Node.js monorepo for managing a GitHub-backed personal music library: a Discord bot that streams audio directly from a private repo, and standalone CLI scripts for downloading and uploading tracks.

## What it does

The Discord bot connects to a voice channel and streams MP3s fetched on-demand from a private GitHub repository — no local storage required on the host. Tracks are transcoded in real time through ffmpeg before being piped to Discord's voice subsystem. The CLI scripts let you manage the same library outside Discord: download audio from YouTube via yt-dlp, upload files, or list what is stored.

## Modules

### `discord-bot/`

Discord music bot built with discord.js v14 and `@discordjs/voice`.

**Playback commands:** `/play`, `/playall`, `/queue`, `/skip`, `/pause`, `/stop`, `/volume`, `/shuffle`, `/nowplaying`, `/disconnect`

**Library management:** `/addsong <youtube-url>` — downloads audio with yt-dlp and commits it to your music repo; `/removesong <track>` — removes a track via the GitHub Contents API.

Key implementation details:
- Streams audio directly from GitHub raw content URLs using the Octokit REST client
- Pre-loads the next queued track into memory while the current one plays to avoid dropouts
- Transcodes any input format to 16-bit PCM at 48 kHz via `ffmpeg-static`
- Auto-disconnects after 3 minutes idle or 3 minutes alone in a voice channel
- Handles voice server migrations (Discord reconnect recovery)

### `scripts/`

Standalone CLI utilities — no Discord required.

| Script | What it does |
|--------|-------------|
| `download.js` | Download audio from a YouTube URL via yt-dlp |
| `upload.js` | Upload a local audio file to your GitHub music repo |
| `list.js` | List all tracks in your GitHub music repo |

### `player/` *(planned)*

Placeholder for a future local Rust music player that reads from the same GitHub-backed library. Not yet implemented.

## Tech stack

- Node.js 18+ (ES modules)
- discord.js v14, @discordjs/voice
- @octokit/rest — GitHub Contents API
- yt-dlp — audio download
- ffmpeg-static — in-process transcoding

## Setup

Each module has its own `.env.example`. Copy it to `.env` and fill in your values.

**discord-bot:**
```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
GITHUB_MUSIC_PATH=music
```

**scripts:**
```
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
GITHUB_MUSIC_PATH=music
```

Register slash commands once before running the bot:
```bash
cd discord-bot
npm install
node deploy-commands.js   # global registration
# or: GUILD_ID=your_guild_id node deploy-commands.js  (instant, for dev)
npm start
```

**Note:** `.env` files and `cookies.txt` are gitignored. Never commit real tokens.

## Status

Active. The Discord bot and scripts are complete. The Rust player module is a design placeholder only.
