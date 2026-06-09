# Music Scripts

Standalone utilities for managing your GitHub-backed music library without opening Discord.

## Setup

```bash
cd scripts
npm install
cp .env.example .env
# edit .env with your real values
```

## Scripts

### `download.js`

Download audio from YouTube and save it locally (or auto-upload to GitHub).

```bash
# Download to current directory
node download.js "https://www.youtube.com/watch?v=..."

# Download with a custom filename
node download.js "https://www.youtube.com/watch?v=..." --name "My Song"

# Download and immediately upload to the GitHub repo
node download.js "https://www.youtube.com/watch?v=..." --upload
```

### `upload.js`

Upload a local audio file to your GitHub music repo.

```bash
node upload.js ./my-song.mp3

# With a custom destination name
node upload.js ./my-song.mp3 --name "artists/my-song.mp3"
```

### `list.js`

List all tracks in your GitHub music repo.

```bash
node list.js

# Force refresh (bust cache)
node list.js --refresh

# Output as JSON
node list.js --json
```
