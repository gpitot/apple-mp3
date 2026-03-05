/**
 * Step 2: Search YouTube for each song
 *
 * Reads:  output/songs.json        (from Step 1)
 * Writes: output/songs-with-urls.json
 *
 * Resumable: songs already with status "found" or "not_found" are skipped.
 * Uses youtube-sr scraping to find videos.
 */
import { log } from "../lib/logger";
import type { FetchOutput, Playlist, SearchOutput, SongWithUrl } from "../lib/types";
import { searchYouTube, sleep } from "../lib/youtube";

export interface SearchOptions {
  inputFile: string;
  outputFile: string;
  delayMs?: number;   // Delay between searches (default: 800ms)
  limitTo?: number;   // Only process first N songs (for testing)
  resume?: boolean;   // Skip already-searched songs (default: true)
  playlistFilter?: string; // Only search songs from this playlist (name or ID)
  songIds?: string[]; // Only search these specific song IDs
}

export async function runSearch(opts: SearchOptions): Promise<SearchOutput> {
  log.header("Step 2: Search YouTube for Songs");

  const inputRaw = await Bun.file(opts.inputFile).text().catch(() => {
    throw new Error(`Input file not found: ${opts.inputFile}\nRun 'fetch' step first.`);
  });
  const input: FetchOutput = JSON.parse(inputRaw);
  log.info(`Loaded ${input.totalSongs} songs from ${opts.inputFile}`);

  // Load existing output if resuming
  let existingSongs: Map<string, SongWithUrl> = new Map();
  if (opts.resume !== false) {
    const existingRaw = await Bun.file(opts.outputFile).text().catch(() => "");
    if (existingRaw) {
      const existing: SearchOutput = JSON.parse(existingRaw);
      for (const s of existing.songs) {
        if (s.searchStatus === "found" || s.searchStatus === "not_found") {
          existingSongs.set(s.id, s);
        }
      }
      log.info(`Resuming: ${existingSongs.size} songs already searched`);
    }
  }

  let filteredSongs = input.songs;

  if (opts.songIds) {
    const idSet = new Set(opts.songIds);
    const before = filteredSongs.length;
    filteredSongs = filteredSongs.filter((s) => idSet.has(s.id));
    log.info(`Filtered to ${filteredSongs.length}/${before} selected songs`);
  }

  if (opts.playlistFilter) {
    const before = filteredSongs.length;
    filteredSongs = filteredSongs.filter(
      (s) =>
        s.playlistName === opts.playlistFilter ||
        s.playlistId === opts.playlistFilter,
    );
    log.info(
      `Filtered to playlist "${opts.playlistFilter}": ${filteredSongs.length}/${before} songs`,
    );
  }

  const delay = opts.delayMs ?? 800;
  const songs = opts.limitTo ? filteredSongs.slice(0, opts.limitTo) : filteredSongs;
  const total = songs.length;

  const results: SongWithUrl[] = [];
  let found = 0, notFound = 0, errors = 0, skipped = 0;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i]!;

    // Check if already searched
    const existing = existingSongs.get(song.id);
    if (existing) {
      results.push(existing);
      skipped++;
      if (existing.searchStatus === "found") found++;
      else notFound++;
      log.step(i + 1, total, `[skip] ${song.artist} - ${song.title}`);
      continue;
    }

    log.step(i + 1, total, `${song.artist} - ${song.title}`);

    const result = await searchYouTube(song);
    const songWithUrl: SongWithUrl = { ...song, ...result };
    results.push(songWithUrl);

    if (result.searchStatus === "found") {
      found++;
    } else if (result.searchStatus === "not_found") {
      notFound++;
      log.warn(`Not found: ${song.artist} - ${song.title}`);
    } else {
      errors++;
      log.error(`Error for ${song.artist} - ${song.title}: ${result.searchError}`);
    }

    // Save progress every 10 songs
    if ((i + 1) % 10 === 0) {
      await saveOutput(opts.outputFile, results, total, found, notFound, errors, input.playlists);
    }

    // Rate limiting delay (skip for last song)
    if (i < songs.length - 1 && !existing) {
      await sleep(delay);
    }
  }

  const output = await saveOutput(opts.outputFile, results, total, found, notFound, errors, input.playlists);

  log.summary([
    ["Total songs", total],
    ["Found", `${found} (${pct(found, total)}%)`],
    ["Not found", `${notFound} (${pct(notFound, total)}%)`],
    ["Errors", errors],
    ["Skipped (cached)", skipped],
    ["Delay between searches", `${delay}ms`],
    ["Output", opts.outputFile],
  ]);
  log.success(`Search complete → ${opts.outputFile}`);

  return output;
}

async function saveOutput(
  outputFile: string,
  songs: SongWithUrl[],
  total: number,
  found: number,
  notFound: number,
  errors: number,
  playlists?: Playlist[]
): Promise<SearchOutput> {
  const output: SearchOutput = {
    searchedAt: new Date().toISOString(),
    totalSongs: total,
    foundCount: found,
    notFoundCount: notFound,
    errorCount: errors,
    songs,
    playlists,
  };
  await Bun.write(outputFile, JSON.stringify(output, null, 2));
  return output;
}

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}
