import YouTube from "youtube-sr";
import type { Song, SongWithUrl } from "./types";
import { log } from "./logger";

export function buildSearchQuery(song: Song): string {
  // Build a targeted query: "Artist - Title" which matches typical YouTube video titles
  return `${song.artist} - ${song.title}`;
}

interface YouTubeSearchOptions {
  delayMs?: number;
  useApiKey?: string; // YouTube Data API v3 key (optional, falls back to scraping)
}

export async function searchYouTube(
  song: Song,
  opts: YouTubeSearchOptions = {}
): Promise<Omit<SongWithUrl, keyof Song>> {
  const query = buildSearchQuery(song);

  try {
    if (opts.useApiKey) {
      return await searchViaApi(query, opts.useApiKey);
    }
    return await searchViaScraping(query);
  } catch (err) {
    return {
      searchQuery: query,
      searchStatus: "error",
      searchError: err instanceof Error ? err.message : String(err),
      searchedAt: new Date().toISOString(),
    };
  }
}

async function searchViaScraping(
  query: string
): Promise<Omit<SongWithUrl, keyof Song>> {
  const results = await YouTube.search(query, { limit: 5, type: "video" });

  if (!results || results.length === 0) {
    return {
      searchQuery: query,
      searchStatus: "not_found",
      searchedAt: new Date().toISOString(),
    };
  }

  // Pick the best result: prefer "official" results, or just take top result
  const best = pickBestResult(results, query);

  return {
    searchQuery: query,
    youtubeUrl: best.url!,
    youtubeVideoId: best.id!,
    youtubeTitle: best.title!,
    youtubeDurationSec: best.duration ? Math.round(best.duration / 1000) : undefined,
    searchStatus: "found",
    searchedAt: new Date().toISOString(),
  };
}

async function searchViaApi(
  query: string,
  apiKey: string
): Promise<Omit<SongWithUrl, keyof Song>> {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: "5",
    key: apiKey,
  });

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const items: Array<{ id: { videoId: string }; snippet: { title: string } }> =
    data.items ?? [];

  if (items.length === 0) {
    return {
      searchQuery: query,
      searchStatus: "not_found",
      searchedAt: new Date().toISOString(),
    };
  }

  const videoId = items[0].id.videoId;
  const title = items[0].snippet.title;

  return {
    searchQuery: query,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    youtubeVideoId: videoId,
    youtubeTitle: title,
    searchStatus: "found",
    searchedAt: new Date().toISOString(),
  };
}

// Prefer results with "official", "audio", "lyrics" in the title,
// and deprioritize covers/live/acoustic.
function pickBestResult(results: YouTube.Video[], query: string): YouTube.Video {
  const lower = query.toLowerCase();
  const [artist, ...titleParts] = lower.split(" - ");
  const title = titleParts.join(" - ");

  const scored = results.map((v) => {
    const t = (v.title ?? "").toLowerCase();
    let score = 0;
    if (t.includes(title)) score += 10;
    if (t.includes(artist)) score += 5;
    if (t.includes("official")) score += 3;
    if (t.includes("audio")) score += 2;
    if (t.includes("lyrics")) score += 1;
    if (t.includes("live")) score -= 3;
    if (t.includes("cover")) score -= 5;
    if (t.includes("acoustic")) score -= 2;
    if (t.includes("karaoke")) score -= 10;
    return { v, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].v;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
