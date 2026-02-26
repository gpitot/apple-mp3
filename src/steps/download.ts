/**
 * Step 3: Download MP3s via yt-dlp
 *
 * Reads:  output/songs-with-urls.json  (from Step 2)
 * Writes: output/download-status.json  (status tracking)
 *         downloads/<Artist> - <Title>.mp3
 *
 * Resumable: songs already downloaded are skipped.
 * Requires yt-dlp: pip install yt-dlp
 */
import { log } from "../lib/logger";
import type { DownloadOutput, DownloadResult, SearchOutput } from "../lib/types";
import { downloadMp3, checkYtDlp } from "../lib/downloader";
import path from "node:path";

export interface DownloadOptions {
  inputFile: string;
  statusFile: string;
  outputDir: string;
  audioQuality?: "0" | "2" | "5";
  embedThumbnail?: boolean;
  limitTo?: number;
  onlyPlaylist?: string;
}

export async function runDownload(opts: DownloadOptions): Promise<DownloadOutput> {
  log.header("Step 3: Download MP3s");

  // Check yt-dlp is available
  await checkYtDlp();

  // Ensure output dir exists
  await Bun.$`mkdir -p ${opts.outputDir}`.quiet();

  // Load search results
  const inputRaw = await Bun.file(opts.inputFile).text().catch(() => {
    throw new Error(`Input file not found: ${opts.inputFile}\nRun 'search' step first.`);
  });
  const input: SearchOutput = JSON.parse(inputRaw);

  let songs = input.songs.filter((s) => s.searchStatus === "found");

  if (opts.onlyPlaylist) {
    const before = songs.length;
    songs = songs.filter((s) => s.playlistName === opts.onlyPlaylist || s.playlistId === opts.onlyPlaylist);
    log.info(`Filtered to playlist "${opts.onlyPlaylist}": ${songs.length}/${before} songs`);
  }

  if (opts.limitTo) {
    songs = songs.slice(0, opts.limitTo);
  }

  const skipped = input.songs.length - songs.length;
  log.info(`${input.songs.length} total songs, ${songs.length} with YouTube URLs, ${skipped} skipped (no URL)`);

  const total = songs.length;
  const results: DownloadResult[] = [];
  let downloaded = 0, alreadyExists = 0, errors = 0;
  const startedAt = new Date().toISOString();

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    log.step(i + 1, total, `${song.artist} - ${song.title}`);

    const result = await downloadMp3(song, {
      outputDir: opts.outputDir,
      audioQuality: opts.audioQuality ?? "0",
      embedThumbnail: opts.embedThumbnail ?? false,
    });

    results.push(result);

    if (result.downloadStatus === "downloaded") {
      downloaded++;
      log.success(`Downloaded: ${path.basename(result.filePath ?? "")}`);
    } else if (result.downloadStatus === "already_exists") {
      alreadyExists++;
    } else if (result.downloadStatus === "error") {
      errors++;
      log.error(`Failed: ${song.artist} - ${song.title}: ${result.downloadError?.slice(0, 100)}`);
    }

    // Save progress every 5 songs
    if ((i + 1) % 5 === 0 || i === songs.length - 1) {
      await saveStatus(opts.statusFile, results, startedAt, opts.outputDir, total, downloaded, alreadyExists, skipped, errors);
    }
  }

  const output = await saveStatus(
    opts.statusFile,
    results,
    startedAt,
    opts.outputDir,
    total,
    downloaded,
    alreadyExists,
    skipped,
    errors,
    new Date().toISOString()
  );

  log.summary([
    ["Total with URLs", total],
    ["Downloaded", downloaded],
    ["Already exists", alreadyExists],
    ["Skipped (no URL)", skipped],
    ["Errors", errors],
    ["Output directory", opts.outputDir],
    ["Status file", opts.statusFile],
  ]);
  log.success(`Download complete → ${opts.outputDir}/`);

  return output;
}

async function saveStatus(
  statusFile: string,
  songs: DownloadResult[],
  startedAt: string,
  outputDir: string,
  total: number,
  downloaded: number,
  alreadyExists: number,
  skipped: number,
  errors: number,
  finishedAt?: string
): Promise<DownloadOutput> {
  const output: DownloadOutput = {
    startedAt,
    finishedAt,
    totalSongs: total,
    downloadedCount: downloaded,
    alreadyExistsCount: alreadyExists,
    skippedCount: skipped,
    errorCount: errors,
    outputDir,
    songs,
  };
  await Bun.write(statusFile, JSON.stringify(output, null, 2));
  return output;
}
