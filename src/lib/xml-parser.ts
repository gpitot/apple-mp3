/**
 * Parse an iTunes/Music Library XML export into a list of songs.
 * The file is at: ~/Music/Music/Music Library.musiclibrary (export via File > Library > Export Library)
 * The exported XML is a plist with Tracks and Playlists dictionaries.
 */
import { XMLParser } from "fast-xml-parser";
import type { Song, Playlist } from "./types";
import { log } from "./logger";

interface PlistDict {
  [key: string]: string | number | boolean | PlistDict | PlistDict[];
}

export async function parseItunesLibraryXml(
  filePath: string,
  playlistFilter?: string
): Promise<{ songs: Song[]; playlists: Playlist[] }> {
  log.info(`Parsing iTunes Library XML: ${filePath}`);

  const raw = await Bun.file(filePath).text();

  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: true,
    preserveOrder: true,
  });

  const parsed = parser.parse(raw);

  // With preserveOrder, the structure is an array of ordered elements.
  // Find <plist> → <dict> inside it.
  const plistNode = findTag(parsed, "plist");
  if (!plistNode) throw new Error("Unexpected XML structure — is this an iTunes Library export?");
  const topDictNode = findTag(plistNode, "dict");
  if (!topDictNode) throw new Error("Unexpected XML structure — is this an iTunes Library export?");

  // Build a flat map of the top-level plist dict
  const root = parsePlistDict(topDictNode);

  // Extract tracks
  const tracksRaw = root["Tracks"] as PlistDict | undefined;
  if (!tracksRaw) throw new Error("No 'Tracks' key in library XML");

  const trackMap = new Map<string, Song>();
  for (const [trackId, trackData] of Object.entries(tracksRaw)) {
    if (typeof trackData !== "object" || Array.isArray(trackData)) continue;
    const td = trackData as PlistDict;
    const kind = String(td["Kind"] ?? "");
    // Only include Apple Music / audio tracks
    if (kind && !kind.toLowerCase().includes("audio") && !kind.toLowerCase().includes("apple music")) continue;

    const song: Song = {
      id: String(td["Track ID"] ?? trackId),
      title: String(td["Name"] ?? "Unknown"),
      artist: String(td["Artist"] ?? td["Album Artist"] ?? "Unknown"),
      album: String(td["Album"] ?? ""),
      durationMs: Number(td["Total Time"] ?? 0),
      trackNumber: td["Track Number"] ? Number(td["Track Number"]) : undefined,
      year: td["Year"] ? Number(td["Year"]) : undefined,
    };
    trackMap.set(song.id, song);
  }

  log.info(`Found ${trackMap.size} audio tracks in library`);

  // Parse all playlists from the XML
  const parsedPlaylists: Playlist[] = [];
  const playlistsRaw = root["Playlists"];
  if (Array.isArray(playlistsRaw)) {
    for (const p of playlistsRaw as PlistDict[]) {
      // Skip Apple-internal playlists
      if (p["Master"] || p["Distinguished Kind"]) continue;

      const name = String(p["Name"] ?? "");
      const id = String(p["Playlist ID"] ?? "");
      const items = p["Playlist Items"];
      if (!Array.isArray(items)) continue;

      const songIds = (items as PlistDict[])
        .map((item) => String(item["Track ID"]))
        .filter((tid) => trackMap.has(tid));

      if (songIds.length > 0) {
        parsedPlaylists.push({ id, name, songIds });
      }
    }
  }

  log.info(`Found ${parsedPlaylists.length} playlists in library`);

  // If a playlist filter is specified, filter songs to that playlist only
  if (playlistFilter) {
    const matched = parsedPlaylists.find(
      (p) =>
        p.name.toLowerCase() === playlistFilter.toLowerCase() ||
        p.id === playlistFilter
    );

    if (!matched) {
      const names = parsedPlaylists.map((p) => `"${p.name}"`).join(", ");
      throw new Error(`Playlist "${playlistFilter}" not found. Available: ${names}`);
    }

    log.info(`Using playlist: "${matched.name}"`);

    const songs: Song[] = [];
    for (const songId of matched.songIds) {
      const song = trackMap.get(songId);
      if (song) songs.push({ ...song, playlistId: matched.id, playlistName: matched.name });
    }
    return { songs, playlists: parsedPlaylists };
  }

  return { songs: [...trackMap.values()], playlists: parsedPlaylists };
}

/**
 * With preserveOrder: true, each element is an object like:
 *   { tagName: [ ...children ] } or { tagName: [{ "#text": value }] }
 * A <dict> is an array of alternating <key> and value elements.
 */
function parsePlistDict(children: unknown[]): PlistDict {
  if (!Array.isArray(children)) return {};
  const result: PlistDict = {};

  let currentKey: string | null = null;
  for (const node of children) {
    if (typeof node !== "object" || node === null) continue;
    const entry = node as Record<string, unknown>;

    if ("key" in entry) {
      // <key>SomeKey</key> → entry.key = [{ "#text": "SomeKey" }]
      const keyChildren = entry.key as { "#text"?: string | number }[];
      currentKey = String(keyChildren?.[0]?.["#text"] ?? "");
      continue;
    }

    if (currentKey === null) continue;

    const k = currentKey;
    currentKey = null;

    if ("dict" in entry) {
      result[k] = parsePlistDict(entry.dict as unknown[]);
    } else if ("array" in entry) {
      result[k] = parsePlistArray(entry.array as unknown[]);
    } else if ("true" in entry) {
      result[k] = true;
    } else if ("false" in entry) {
      result[k] = false;
    } else {
      // <string>, <integer>, <real>, <date>, etc.
      const tag = Object.keys(entry)[0]!;
      const tagChildren = entry[tag] as { "#text"?: string | number }[];
      result[k] = tagChildren?.[0]?.["#text"] ?? "";
    }
  }

  return result;
}

function parsePlistArray(children: unknown[]): PlistDict[] {
  if (!Array.isArray(children)) return [];
  const results: PlistDict[] = [];
  for (const node of children) {
    if (typeof node !== "object" || node === null) continue;
    const entry = node as Record<string, unknown>;
    if ("dict" in entry) {
      results.push(parsePlistDict(entry.dict as unknown[]));
    }
  }
  return results;
}

/** Find a tag in a preserveOrder array and return its children. */
function findTag(arr: unknown, tagName: string): unknown[] | null {
  if (!Array.isArray(arr)) return null;
  for (const node of arr) {
    if (typeof node === "object" && node !== null && tagName in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[tagName] as unknown[];
    }
  }
  return null;
}
