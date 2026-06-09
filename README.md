# Music Tools

A monorepo for all music-related projects: Discord bot, download/management scripts, and a future Rust music player.

## Structure

```
music-tools/
├── discord-bot/          # Discord music bot (Node.js)
├── scripts/              # Standalone music utilities (Node.js)
└── player/               # Future local music player (Rust)
```

## Modules

### `discord-bot/`

A Discord bot that streams audio from a private GitHub repository into voice channels.

- Supports `/play`, `/queue`, `/skip`, `/pause`, `/stop`, `/volume`, `/shuffle`, `/nowplaying`
- `/addsong <youtube-url>` downloads audio and commits it to your music repo
- `/removesong <track>` removes a track from the repo
- Streams directly from GitHub — no local storage needed during playback

See [`discord-bot/README.md`](discord-bot/README.md) for setup and configuration.

### `scripts/`

Standalone utilities for managing your music library without Discord:

| Script | Purpose |
|---|---|
| `download.js` | Download audio from YouTube via yt-dlp |
| `upload.js` | Upload a local audio file to your GitHub music repo |
| `list.js` | List all tracks in your GitHub music repo |

See [`scripts/README.md`](scripts/README.md) for usage.

### `player/`

Placeholder for a future Rust-based local music player. See [`player/README.md`](player/README.md) for the planned design.

## Secrets

**Never commit secrets.** Each module has its own `.env.example` with the required variables. Copy to `.env` and fill in your real values locally.

- `.env` and `cookies.txt` are gitignored globally at the repo root.
