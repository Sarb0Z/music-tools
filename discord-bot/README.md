# Discord Music Bot

A Discord bot that streams audio files directly from a private GitHub repository into voice channels.

## Features

| Command | Description |
|---|---|
| `/play <name>` | Play a track by name (partial match). If something's already playing, queues it. |
| `/playall` | Queue the entire library. Pass `shuffle: true` to randomise. |
| `/list` | Browse all available tracks (paginated). |
| `/queue` | Show the current playback queue. |
| `/skip` | Skip the current track. |
| `/pause` | Toggle pause/resume. |
| `/stop` | Stop playback and leave the voice channel. |
| `/nowplaying` | Show info on the current track. |
| `/shuffle` | Shuffle the queued tracks. |
| `/volume <1-100>` | Set the playback volume. |
| `/addsong <url> [name]` | Download a YouTube track and commit it to the music repo. |
| `/removesong <track>` | Remove a track from the music repo (autocomplete). |

## Requirements

- **Node.js 18+**
- **FFmpeg** — installed automatically via `ffmpeg-static` (no system install needed)
- **yt-dlp** — must be installed and available in `$PATH` (used by `/addsong`)
- A **Discord application** with a bot token
- A **GitHub Personal Access Token** (classic) with `repo` scope (for private repos)

## Setup

### 1. Install dependencies

```bash
cd discord-bot
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your real values.

### 3. Register slash commands

For fast registration during development (guild-scoped, instant):

```bash
GUILD_ID=your_server_id node deploy-commands.js
```

For production (global, propagates in ~1 hour):

```bash
node deploy-commands.js
```

### 4. Run the bot

```bash
npm start
# or with auto-reload during development:
npm run dev
```

## Supported audio formats

`.mp3` `.wav` `.ogg` `.flac` `.aac` `.m4a` `.opus` `.webm`

All formats are transcoded through FFmpeg to 48 kHz stereo PCM before being sent to Discord, so any codec FFmpeg understands will work.

## Notes

- **Private repos**: The bot uses your GitHub PAT to authenticate every request — files never need to be public.
- **File size**: Large files are streamed rather than buffered in memory, so RAM usage stays low regardless of file size.
- **Rate limits**: The GitHub Contents API allows 5,000 authenticated requests/hour. The file list is cached for 5 minutes to minimise API calls; use `/list refresh:true` to force an immediate refresh.
- **Multi-server**: Each guild gets its own independent player and queue — the bot can be in multiple servers simultaneously.
