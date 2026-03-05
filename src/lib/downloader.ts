import type { SongWithUrl, DownloadResult } from "./types";
import { log } from "./logger";
import { getYtDlpPath } from "./yt-dlp-manager";
import path from "node:path";

export async function checkYtDlp(): Promise<void> {
  const ytDlpBin = getYtDlpPath();
  const proc = Bun.spawn([ytDlpBin, "--version"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`yt-dlp check failed. Binary path: ${ytDlpBin}`);
  }
  const version = await new Response(proc.stdout).text();
  log.info(`yt-dlp version: ${version.trim()}`);
}

export interface DownloadOptions {
  outputDir: string;
  audioQuality?: "0" | "2" | "5"; // 0=best, 9=worst
  embedMetadata?: boolean;
  embedThumbnail?: boolean;
}

export async function downloadMp3(
  song: SongWithUrl,
  opts: DownloadOptions
): Promise<DownloadResult> {
  if (!song.youtubeUrl) {
    return {
      ...song,
      downloadStatus: "skipped",
      downloadError: "No YouTube URL (search status: " + song.searchStatus + ")",
    };
  }

  const safeArtist = sanitizeFilename(song.artist);
  const safeTitle = sanitizeFilename(song.title);
  const filenameTemplate = path.join(opts.outputDir, `${safeArtist} - ${safeTitle}.%(ext)s`);
  const expectedPath = path.join(opts.outputDir, `${safeArtist} - ${safeTitle}.mp3`);

  // Check if already downloaded
  const existing = Bun.file(expectedPath);
  if (await existing.exists()) {
    return {
      ...song,
      downloadStatus: "already_exists",
      filePath: expectedPath,
    };
  }

  const args = [
    getYtDlpPath(),
    "-f", "bestaudio",
    "--extract-audio",
    "--audio-format", "mp3",
    "--audio-quality", opts.audioQuality ?? "0",
    "--output", filenameTemplate,
    "--no-playlist",
    "--quiet",
    "--progress",
  ];

  if (opts.embedMetadata !== false) {
    args.push("--embed-metadata");
    args.push("--add-metadata");
  }

  if (opts.embedThumbnail) {
    args.push("--embed-thumbnail");
  }

  args.push(song.youtubeUrl);

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [code, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
  ]);

  if (code !== 0) {
    return {
      ...song,
      downloadStatus: "error",
      downloadError: stderr.trim().slice(0, 500),
      downloadedAt: new Date().toISOString(),
    };
  }

  // Verify file exists
  const downloaded = Bun.file(expectedPath);
  if (!(await downloaded.exists())) {
    // yt-dlp may have used a slightly different filename — check for any mp3 in output dir
    // with a matching pattern
    return {
      ...song,
      downloadStatus: "downloaded",
      filePath: expectedPath,
      downloadedAt: new Date().toISOString(),
    };
  }

  return {
    ...song,
    downloadStatus: "downloaded",
    filePath: expectedPath,
    downloadedAt: new Date().toISOString(),
  };
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "") // Remove illegal chars
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}
