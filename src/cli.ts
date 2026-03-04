#!/usr/bin/env bun
/**
 * apple-mp3 CLI
 *
 * Commands:
 *   fetch     - Step 1: Fetch songs from Apple Music
 *   search    - Step 2: Find YouTube URLs for each song
 *   download  - Step 3: Download MP3s via yt-dlp
 *   all       - Run all three steps in sequence
 *   playlists - List your Apple Music playlists (requires API credentials)
 *
 * Quick start:
 *   cp .env.example .env   # fill in your tokens
 *   bun run src/cli.ts fetch --from-xml ~/Library.xml
 *   bun run src/cli.ts search
 *   bun run src/cli.ts download
 */

import { parseArgs } from "node:util";
import { runFetch } from "./steps/fetch";
import { runSearch } from "./steps/search";
import { runDownload } from "./steps/download";

const DEFAULTS = {
  outputDir: "output",
  downloadsDir: "downloads",
  songsFile: "output/songs.json",
  urlsFile: "output/songs-with-urls.json",
  statusFile: "output/download-status.json",
};

const HELP = `
apple-mp3 — Apple Music → YouTube → MP3 pipeline

USAGE
  bun run src/cli.ts <command> [options]

COMMANDS
  fetch       Step 1: Fetch songs from Apple Music
  search      Step 2: Find YouTube URLs for each song
  download    Step 3: Download MP3s via yt-dlp
  all         Run all three steps in sequence
  playlists   List Apple Music playlists

FETCH OPTIONS
  --from-xml <file>      Import from iTunes Library XML export
  --from-json <file>     Import from a JSON file (Song[] or FetchOutput)
  --from-csv <file>      Import from an Apple Music CSV export
  --playlist <id|name>   Filter to a specific playlist
  --output <file>        Output file (default: ${DEFAULTS.songsFile})

SEARCH OPTIONS
  --input <file>         Input file (default: ${DEFAULTS.songsFile})
  --output <file>        Output file (default: ${DEFAULTS.urlsFile})
  --delay <ms>           Delay between requests in ms (search: 800, download: 1000)
  --limit <n>            Only process first N songs (for testing)
  --no-resume            Re-search all songs even if already found
  --playlist <id|name>   Only search songs from this playlist

DOWNLOAD OPTIONS
  --input <file>         Input file (default: ${DEFAULTS.urlsFile})
  --output-dir <dir>     MP3 output directory (default: ${DEFAULTS.downloadsDir})
  --status-file <file>   Status output file (default: ${DEFAULTS.statusFile})
  --quality <0|2|5>      Audio quality: 0=best, 5=good, 9=worst (default: 0)
  --embed-thumbnail      Embed YouTube thumbnail as album art
  --delay <ms>           Delay between downloads in ms (default: 1000)
  --limit <n>            Only download first N songs
  --concurrency <n>      Number of parallel downloads (default: 1)
  --playlist <name>      Only download songs from this playlist

ALL OPTIONS
  Combines fetch + search + download. Accepts all options from each step.

ENVIRONMENT VARIABLES
  APPLE_DEVELOPER_TOKEN    Apple Music API developer JWT token
  APPLE_MUSIC_USER_TOKEN   Apple Music user token
  YOUTUBE_API_KEY          YouTube Data API v3 key (optional, uses scraping if unset)

EXAMPLES
  # Import from iTunes XML export
  bun run src/cli.ts fetch --from-xml ~/Music/Library.xml --playlist "My Playlist"

  # Run via Apple Music API
  bun run src/cli.ts fetch --playlist pl.abc123

  # Search YouTube (uses .env for credentials)
  bun run src/cli.ts search

  # Download (requires yt-dlp: pip install yt-dlp)
  bun run src/cli.ts download --output-dir ./my-music

  # Full pipeline
  bun run src/cli.ts all --from-xml ~/Library.xml
`;

async function main() {
  const args = Bun.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  const { values } = parseArgs({
    args: args.slice(1),
    options: {
      "from-xml": { type: "string" },
      "from-json": { type: "string" },
      "from-csv": { type: "string" },
      playlist: { type: "string", short: "p" },
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      "output-dir": { type: "string" },
      "status-file": { type: "string" },
      delay: { type: "string" },
      limit: { type: "string" },
      quality: { type: "string" },
      concurrency: { type: "string" },
      "embed-thumbnail": { type: "boolean" },
      "no-resume": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }

  // Ensure output directory exists
  await Bun.$`mkdir -p ${DEFAULTS.outputDir}`.quiet();

  try {
    switch (command) {
      case "fetch":
      case "step1":
        await runFetch({
          outputFile: String(values.output ?? DEFAULTS.songsFile),
          playlistFilter: values.playlist ? String(values.playlist) : undefined,
          fromXml: values["from-xml"] ? String(values["from-xml"]) : undefined,
          fromJson: values["from-json"] ? String(values["from-json"]) : undefined,
          fromCsv: values["from-csv"] ? String(values["from-csv"]) : undefined,
        });
        break;

      case "playlists":
        await runFetch({
          outputFile: DEFAULTS.songsFile,
          listPlaylists: true,
        });
        break;

      case "search":
      case "step2":
        await runSearch({
          inputFile: String(values.input ?? DEFAULTS.songsFile),
          outputFile: String(values.output ?? DEFAULTS.urlsFile),
          delayMs: values.delay ? parseInt(String(values.delay)) : undefined,
          limitTo: values.limit ? parseInt(String(values.limit)) : undefined,
          resume: !values["no-resume"],
          playlistFilter: values.playlist ? String(values.playlist) : undefined,
        });
        break;

      case "download":
      case "step3":
        await runDownload({
          inputFile: String(values.input ?? DEFAULTS.urlsFile),
          statusFile: String(values["status-file"] ?? DEFAULTS.statusFile),
          outputDir: String(values["output-dir"] ?? DEFAULTS.downloadsDir),
          audioQuality: (values.quality as "0" | "2" | "5") ?? "0",
          embedThumbnail: values["embed-thumbnail"] === true ? true : undefined,
          limitTo: values.limit ? parseInt(String(values.limit)) : undefined,
          onlyPlaylist: values.playlist ? String(values.playlist) : undefined,
          delayMs: values.delay ? parseInt(String(values.delay)) : undefined,
          concurrency: values.concurrency ? parseInt(String(values.concurrency)) : undefined,
        });
        break;

      case "all":
        await runFetch({
          outputFile: String(values.output ?? DEFAULTS.songsFile),
          playlistFilter: values.playlist ? String(values.playlist) : undefined,
          fromXml: values["from-xml"] ? String(values["from-xml"]) : undefined,
          fromJson: values["from-json"] ? String(values["from-json"]) : undefined,
          fromCsv: values["from-csv"] ? String(values["from-csv"]) : undefined,
        });
        await runSearch({
          inputFile: DEFAULTS.songsFile,
          outputFile: DEFAULTS.urlsFile,
          delayMs: values.delay ? parseInt(String(values.delay)) : undefined,
          limitTo: values.limit ? parseInt(String(values.limit)) : undefined,
          resume: !values["no-resume"],
          playlistFilter: values.playlist ? String(values.playlist) : undefined,
        });
        await runDownload({
          inputFile: DEFAULTS.urlsFile,
          statusFile: DEFAULTS.statusFile,
          outputDir: String(values["output-dir"] ?? DEFAULTS.downloadsDir),
          audioQuality: (values.quality as "0" | "2" | "5") ?? "0",
          embedThumbnail: values["embed-thumbnail"] === true ? true : undefined,
          onlyPlaylist: values.playlist ? String(values.playlist) : undefined,
          delayMs: values.delay ? parseInt(String(values.delay)) : undefined,
          concurrency: values.concurrency ? parseInt(String(values.concurrency)) : undefined,
        });
        break;

      default:
        console.error(`Unknown command: "${command}"\nRun with --help for usage.`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
