import type { Song } from "./types";
import { log } from "./logger";

const BASE_URL = "https://api.music.apple.com/v1";

interface AppleMusicTrack {
  id: string;
  attributes: {
    name: string;
    artistName: string;
    albumName: string;
    durationInMillis: number;
    trackNumber?: number;
    releaseDate?: string;
    isrc?: string;
  };
}

interface AppleMusicPlaylist {
  id: string;
  attributes: {
    name: string;
    description?: { standard?: string };
  };
}

interface ApiResponse<T> {
  data: T[];
  next?: string;
}

async function apiFetch<T>(
  path: string,
  devToken: string,
  userToken: string
): Promise<ApiResponse<T>> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${devToken}`,
      "Music-User-Token": userToken,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apple Music API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchAllPages<T>(
  path: string,
  devToken: string,
  userToken: string
): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = `${path}${path.includes("?") ? "&" : "?"}limit=100`;

  while (next) {
    const page = await apiFetch<T>(next, devToken, userToken);
    items.push(...page.data);
    next = page.next ? `https://api.music.apple.com${page.next}` : null;
    if (page.next) {
      log.info(`  Fetched ${items.length} so far, loading next page...`);
    }
  }
  return items;
}

export async function fetchAllLibrarySongs(
  devToken: string,
  userToken: string
): Promise<Song[]> {
  log.info("Fetching all library songs from Apple Music API...");
  const tracks = await fetchAllPages<AppleMusicTrack>(
    "/me/library/songs",
    devToken,
    userToken
  );

  return tracks.map((t) => trackToSong(t));
}

export async function fetchPlaylistSongs(
  devToken: string,
  userToken: string,
  playlistId: string
): Promise<{ songs: Song[]; playlistName: string }> {
  log.info(`Fetching playlist ${playlistId}...`);

  const playlistRes = await apiFetch<AppleMusicPlaylist>(
    `/me/library/playlists/${playlistId}`,
    devToken,
    userToken
  );
  const playlistName = playlistRes.data[0]?.attributes?.name ?? playlistId;
  log.info(`Playlist: "${playlistName}"`);

  const tracks = await fetchAllPages<AppleMusicTrack>(
    `/me/library/playlists/${playlistId}/tracks`,
    devToken,
    userToken
  );

  const songs = tracks.map((t) => ({
    ...trackToSong(t),
    playlistId,
    playlistName,
  }));
  return { songs, playlistName };
}

export async function fetchAllPlaylists(
  devToken: string,
  userToken: string
): Promise<AppleMusicPlaylist[]> {
  log.info("Fetching all playlists...");
  return fetchAllPages<AppleMusicPlaylist>("/me/library/playlists", devToken, userToken);
}

function trackToSong(t: AppleMusicTrack): Song {
  return {
    id: t.id,
    title: t.attributes.name,
    artist: t.attributes.artistName,
    album: t.attributes.albumName,
    durationMs: t.attributes.durationInMillis,
    trackNumber: t.attributes.trackNumber,
    year: t.attributes.releaseDate
      ? parseInt(t.attributes.releaseDate.slice(0, 4))
      : undefined,
    isrc: t.attributes.isrc,
  };
}
