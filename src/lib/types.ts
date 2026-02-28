export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  playlistId?: string;
  playlistName?: string;
  trackNumber?: number;
  year?: number;
  isrc?: string;
}

export interface SongWithUrl extends Song {
  searchQuery: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  youtubeTitle?: string;
  youtubeDurationSec?: number;
  searchStatus: "found" | "not_found" | "error" | "pending";
  searchError?: string;
  searchedAt?: string;
}

export interface DownloadResult extends SongWithUrl {
  downloadStatus: "downloaded" | "already_exists" | "skipped" | "error" | "pending";
  filePath?: string;
  downloadedAt?: string;
  downloadError?: string;
}

export interface FetchOutput {
  fetchedAt: string;
  source: string;
  playlistFilter?: string;
  totalSongs: number;
  songs: Song[];
}

export interface SearchOutput {
  searchedAt: string;
  totalSongs: number;
  foundCount: number;
  notFoundCount: number;
  errorCount: number;
  songs: SongWithUrl[];
}

export interface DownloadOutput {
  startedAt: string;
  finishedAt?: string;
  totalSongs: number;
  downloadedCount: number;
  alreadyExistsCount: number;
  skippedCount: number;
  errorCount: number;
  outputDir: string;
  songs: DownloadResult[];
}
