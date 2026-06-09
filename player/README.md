# Music Player (Rust)

Planned local music player that reads from the same GitHub-backed music library used by the Discord bot.

## Goals

- **Offline-first**: Cache tracks locally and play without an internet connection once downloaded.
- **Gapless playback**: Seamless transitions between tracks.
- **Library sync**: Pull the track list from GitHub and sync metadata.
- **Cross-platform**: Windows, macOS, Linux.

## Architecture Ideas

- Use `symphonia` or `rodio` for audio decoding/playback.
- Use `tokio` + `reqwest` for async GitHub API calls and streaming.
- Local SQLite database for track metadata and offline cache index.
- TUI (e.g., `ratatui`) or minimal GUI (e.g., `egui`) for the interface.

## Repo Structure (Future)

```
player/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── github.rs    # GitHub API client
│   ├── audio.rs     # Playback engine
│   ├── cache.rs     # Local file cache
│   └── ui.rs        # Interface
└── README.md
```

## Status

Not yet implemented. This is a placeholder for future development.
