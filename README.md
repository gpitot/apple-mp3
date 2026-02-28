# apple-mp3

A CLI pipeline to download your Apple Music library as MP3 files.

```
Apple Music → YouTube search → yt-dlp → MP3
```

Each step outputs a JSON file so you can re-run any step independently
without repeating previous work.

## Pipeline Overview

| Step | Command | Input | Output |
|------|---------|-------|--------|
| 1. Fetch | `fetch` | Apple Music API / XML | `output/songs.json` |
| 2. Search | `search` | `output/songs.json` | `output/songs-with-urls.json` |
| 3. Download | `download` | `output/songs-with-urls.json` | `downloads/*.mp3` |

## Setup

```bash
bun install
cp .env.example .env   # fill in your credentials
```

Install **yt-dlp** (required for Step 3):
```bash
pip install yt-dlp
# or: brew install yt-dlp
```

## Credentials

### Option A: iTunes Library XML (easiest)
Export your library from the macOS Music app:
**File → Library → Export Library...**

Then use `--from-xml`:
```bash
bun run src/cli.ts fetch --from-xml ~/Music/Library.xml
```

### Option B: Apple Music API

You need two tokens — set them in `.env`:

**`APPLE_DEVELOPER_TOKEN`** — a signed JWT from Apple:
1. Go to [Apple Developer → Keys](https://developer.apple.com/account/resources/authkeys/list)
2. Create a key with **MusicKit** enabled, download the `.p8` file
3. Generate the JWT — use [apple-music-token-generator](https://github.com/nickvdyck/apple-music-token-generator) or follow [Apple's docs](https://developer.apple.com/documentation/applemusicapi/generating_developer_tokens)

**`APPLE_MUSIC_USER_TOKEN`** — your personal library token:
1. Open [music.apple.com](https://music.apple.com) in Chrome/Firefox
2. Open DevTools → Network tab
3. Play any song
4. Filter requests by `api.music.apple.com`
5. Copy the `Music-User-Token` request header value

### Option C: YouTube API Key (optional, improves search reliability)

Set `YOUTUBE_API_KEY` in `.env`. Without it, the search step scrapes YouTube,
which works but may be rate-limited.

Get a key at [Google Cloud Console](https://console.cloud.google.com) →
Enable "YouTube Data API v3" → Create credentials.

## Usage

### Full pipeline (one command)

```bash
# From iTunes XML export
bun run src/cli.ts all --from-xml ~/Music/Library.xml

# Specific playlist only
bun run src/cli.ts all --from-xml ~/Music/Library.xml --playlist "My Favorites"

# Via Apple Music API
bun run src/cli.ts all --playlist pl.abc123
```

### Step by step

```bash
# Step 1: Fetch your songs
bun run src/cli.ts fetch --from-xml ~/Music/Library.xml
bun run src/cli.ts fetch                     # Uses Apple Music API
bun run src/cli.ts fetch --playlist "Chill"  # Filter by playlist name

# List your playlists (API only)
bun run src/cli.ts playlists

# Step 2: Find YouTube URLs
bun run src/cli.ts search
bun run src/cli.ts search --delay 1000       # Slower (less likely to be rate-limited)
bun run src/cli.ts search --limit 10         # Test with 10 songs first

# Step 3: Download MP3s
bun run src/cli.ts download
bun run src/cli.ts download --output-dir ~/Music/Downloads
bun run src/cli.ts download --embed-thumbnail
```

### Or use the npm scripts

```bash
bun run fetch
bun run search
bun run download
bun run all
```

## Output files

```
output/
  songs.json              # Step 1 output: Song list with metadata
  songs-with-urls.json    # Step 2 output: Songs + YouTube URLs
  download-status.json    # Step 3 output: Download results per song

downloads/
  Artist - Title.mp3      # Downloaded MP3 files
```

### Resuming interrupted runs

All steps are resumable:
- **fetch**: Re-fetches from source (fast)
- **search**: Skips songs already with a result (uses cached results)
- **download**: Skips songs where the `.mp3` file already exists

To force a re-search: `bun run src/cli.ts search --no-resume`

## All options

```
fetch
  --from-xml <file>      iTunes Library XML export file
  --from-json <file>     JSON file (Song[] or previous fetch output)
  --playlist <id|name>   Filter to a specific playlist
  --output <file>        Output file (default: output/songs.json)

search
  --input <file>         Input file (default: output/songs.json)
  --output <file>        Output file (default: output/songs-with-urls.json)
  --delay <ms>           Delay between requests (default: 800)
  --limit <n>            Only process first N songs
  --no-resume            Re-search all songs

download
  --input <file>         Input file (default: output/songs-with-urls.json)
  --output-dir <dir>     MP3 output directory (default: downloads/)
  --status-file <file>   Status file (default: output/download-status.json)
  --quality <0|2|5>      Audio quality: 0=best (default)
  --embed-thumbnail      Embed YouTube thumbnail as album art
  --limit <n>            Only download first N songs
  --playlist <name>      Only download songs from this playlist

all
  Accepts all options from fetch + search + download
```
