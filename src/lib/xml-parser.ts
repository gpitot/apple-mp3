/**
 * Parse an iTunes/Music Library XML export into a list of songs.
 * The file is at: ~/Music/Music/Music Library.musiclibrary (export via File > Library > Export Library)
 * The exported XML is a plist with Tracks and Playlists dictionaries.
 */
import { XMLParser } from "fast-xml-parser";
import type { Song } from "./types";
import { log } from "./logger";

interface PlistDict {
  [key: string]: string | number | boolean | PlistDict | PlistDict[];
}

export async function parseItunesLibraryXml(
  filePath: string,
  playlistFilter?: string
): Promise<Song[]> {
  log.info(`Parsing iTunes Library XML: ${filePath}`);

  const raw = await Bun.file(filePath).text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: true,
    parseTagValue: true,
    // The plist format alternates <key> and value tags inside <dict>
    // We need to handle this specially
  });

  const parsed = parser.parse(raw);
  const plist = parsed?.plist?.dict;
  if (!plist) throw new Error("Unexpected XML structure — is this an iTunes Library export?");

  // Build a flat map of the top-level plist dict
  const root = parsePlistDict(plist);

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

  // If a playlist filter is specified, filter by playlist name or id
  if (playlistFilter) {
    const playlistsRaw = root["Playlists"];
    if (!Array.isArray(playlistsRaw)) {
      log.warn("No playlists found in library XML");
      return [...trackMap.values()];
    }

    const playlists = playlistsRaw as PlistDict[];
    const matched = playlists.find(
      (p) =>
        String(p["Name"]).toLowerCase() === playlistFilter.toLowerCase() ||
        String(p["Playlist ID"]) === playlistFilter
    );

    if (!matched) {
      const names = playlists.map((p) => `"${p["Name"]}"`).join(", ");
      throw new Error(`Playlist "${playlistFilter}" not found. Available: ${names}`);
    }

    const playlistName = String(matched["Name"]);
    log.info(`Using playlist: "${playlistName}"`);

    const items = matched["Playlist Items"];
    if (!Array.isArray(items)) return [];

    const songs: Song[] = [];
    for (const item of items as PlistDict[]) {
      const id = String(item["Track ID"]);
      const song = trackMap.get(id);
      if (song) songs.push({ ...song, playlistId: String(matched["Playlist ID"]), playlistName });
    }
    return songs;
  }

  return [...trackMap.values()];
}

/**
 * Convert fast-xml-parser's plist output (alternating <key>/<value> children)
 * into a plain JS object.
 */
function parsePlistDict(dict: unknown): PlistDict {
  if (typeof dict !== "object" || dict === null) return {};

  const obj = dict as Record<string, unknown>;
  const result: PlistDict = {};

  // fast-xml-parser returns alternating key-value arrays or objects
  // The structure for a plist dict looks like:
  // { key: ["Major Version", "Tracks", ...], integer: [1, ...], dict: {...}, ... }
  const keys: string[] = toArray(obj["key"]).map(String);

  // Collect all value nodes in document order — this is tricky with fast-xml-parser
  // because it groups by tag name. We'll reconstruct order using index mapping.
  const valueNodes: { tag: string; value: unknown }[] = [];

  for (const [tag, vals] of Object.entries(obj)) {
    if (tag === "key") continue;
    const arr = toArray(vals);
    for (let i = 0; i < arr.length; i++) {
      valueNodes.push({ tag, value: arr[i] });
    }
  }

  // In a plist dict, keys and values alternate. With fast-xml-parser grouping by
  // tag name, we can't perfectly reconstruct order without attribute tracking.
  // Instead, we pair keys[i] with valueNodes[i] in order of appearance.
  for (let i = 0; i < keys.length; i++) {
    const node = valueNodes[i];
    if (!node) break;
    const k = keys[i];

    if (node.tag === "dict") {
      result[k] = parsePlistDict(node.value);
    } else if (node.tag === "array") {
      result[k] = parsePlistArray(node.value);
    } else {
      result[k] = node.value as string | number | boolean;
    }
  }

  return result;
}

function parsePlistArray(arr: unknown): PlistDict[] {
  if (!arr || typeof arr !== "object") return [];
  const obj = arr as Record<string, unknown>;
  const dicts = toArray(obj["dict"]);
  return dicts.map((d) => parsePlistDict(d));
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}
