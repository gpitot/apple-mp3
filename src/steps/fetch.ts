/**
 * Step 1: Fetch songs from Apple Music
 *
 * Sources (in priority order):
 *   1. Apple Music API   — set APPLE_DEVELOPER_TOKEN + APPLE_MUSIC_USER_TOKEN
 *   2. iTunes Library XML — pass --from-xml <path>
 *   3. JSON file          — pass --from-json <path>
 *
 * Output: output/songs.json
 */
import { log } from "../lib/logger";
import type { FetchOutput, Song, Playlist } from "../lib/types";
import { fetchAllLibrarySongs, fetchPlaylistSongs, fetchAllPlaylists } from "../lib/apple-music";
import { parseItunesLibraryXml } from "../lib/xml-parser";
import path from "node:path";

export interface FetchOptions {
  outputFile: string;
  playlistFilter?: string;
  fromXml?: string;
  fromJson?: string;
  fromCsv?: string;
  listPlaylists?: boolean;
}

export async function runFetch(opts: FetchOptions): Promise<FetchOutput> {
  log.header("Step 1: Fetch Apple Music Songs");

  let songs: Song[];
  let source: string;
  let playlists: Playlist[] | undefined;

  if (opts.fromJson) {
    ({ songs, source } = await fetchFromJson(opts.fromJson));
  } else if (opts.fromCsv) {
    ({ songs, source, playlists } = await fetchFromCsv(opts.fromCsv));
  } else if (opts.fromXml) {
    ({ songs, source, playlists } = await fetchFromXml(opts.fromXml, opts.playlistFilter));
  } else {
    ({ songs, source } = await fetchFromApi(opts));
  }

  const output: FetchOutput = {
    fetchedAt: new Date().toISOString(),
    source,
    playlistFilter: opts.playlistFilter,
    totalSongs: songs.length,
    songs,
    playlists,
  };

  await Bun.write(opts.outputFile, JSON.stringify(output, null, 2));

  log.summary([
    ["Source", source],
    ["Total songs", songs.length],
    ["Output", opts.outputFile],
  ]);
  log.success(`Fetch complete → ${opts.outputFile}`);

  return output;
}

async function fetchFromApi(
  opts: FetchOptions
): Promise<{ songs: Song[]; source: string }> {
  const devToken = process.env.APPLE_DEVELOPER_TOKEN;
  const userToken = process.env.APPLE_MUSIC_USER_TOKEN;

  if (!devToken || !userToken) {
    throw new Error(
      "Apple Music API credentials not set.\n" +
        "Set APPLE_DEVELOPER_TOKEN and APPLE_MUSIC_USER_TOKEN in .env\n" +
        "Or use --from-xml <path> to import from an iTunes Library XML export.\n" +
        "See README.md for instructions on obtaining tokens."
    );
  }

  if (opts.listPlaylists) {
    const playlists = await fetchAllPlaylists(devToken, userToken);
    console.log("\nYour playlists:");
    for (const pl of playlists) {
      console.log(`  ${pl.id}  ${pl.attributes.name}`);
    }
    process.exit(0);
  }

  let songs: Song[];
  if (opts.playlistFilter) {
    const result = await fetchPlaylistSongs(devToken, userToken, opts.playlistFilter);
    songs = result.songs;
  } else {
    songs = await fetchAllLibrarySongs(devToken, userToken);
  }

  return { songs, source: "apple-music-api" };
}

async function fetchFromXml(
  xmlPath: string,
  playlistFilter?: string
): Promise<{ songs: Song[]; source: string; playlists: Playlist[] }> {
  const { songs, playlists } = await parseItunesLibraryXml(xmlPath, playlistFilter);
  return { songs, playlists, source: `itunes-xml:${path.basename(xmlPath)}` };
}

async function fetchFromCsv(
  csvPath: string
): Promise<{ songs: Song[]; source: string; playlists: Playlist[] }> {
  log.info(`Loading songs from CSV: ${csvPath}`);
  const raw = await Bun.file(csvPath).text();
  const lines = raw.split("\n").filter((line) => line.trim());

  if (lines.length < 2) {
    throw new Error(`CSV file is empty or has no data rows: ${csvPath}`);
  }

  // Parse header to find column indices (strip BOM if present)
  const header = parseCsvLine(lines[0]!.replace(/^\uFEFF/, ""));
  const col = (name: string) => {
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`CSV missing required column: "${name}"`);
    return idx;
  };

  const iTrack = col("Track name");
  const iArtist = col("Artist name");
  const iAlbum = col("Album");
  const iPlaylist = col("Playlist name");
  const iIsrc = header.indexOf("ISRC");
  const iAppleId = header.indexOf("Apple - id");

  const songs: Song[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]!);
    if (fields.length < header.length) continue;

    songs.push({
      id: iAppleId >= 0 && fields[iAppleId] ? fields[iAppleId]! : `csv-${i}`,
      title: fields[iTrack]!,
      artist: fields[iArtist]!,
      album: fields[iAlbum]!,
      playlistName: fields[iPlaylist] || undefined,
      isrc: iIsrc >= 0 && fields[iIsrc] ? fields[iIsrc] : undefined,
      durationMs: 0,
    });
  }

  // Group songs by playlist name
  const playlistMap = new Map<string, string[]>();
  for (const song of songs) {
    const plName = song.playlistName ?? "Uncategorized";
    const ids = playlistMap.get(plName);
    if (ids) {
      ids.push(song.id);
    } else {
      playlistMap.set(plName, [song.id]);
    }
  }
  const playlists: Playlist[] = [...playlistMap.entries()].map(([name, songIds]) => ({
    id: name,
    name,
    songIds,
  }));

  log.success(`Loaded ${songs.length} songs in ${playlists.length} playlists from ${csvPath}`);
  return { songs, playlists, source: `csv:${path.basename(csvPath)}` };
}

/** Parse a single CSV line, handling quoted fields */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field
      let value = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      if (i < line.length && line[i] === ",") i++; // skip comma
    } else {
      // Unquoted field
      const comma = line.indexOf(",", i);
      if (comma === -1) {
        fields.push(line.slice(i).trim());
        break;
      } else {
        fields.push(line.slice(i, comma).trim());
        i = comma + 1;
      }
    }
  }
  return fields;
}

async function fetchFromJson(
  jsonPath: string
): Promise<{ songs: Song[]; source: string }> {
  log.info(`Loading songs from JSON: ${jsonPath}`);
  const raw = await Bun.file(jsonPath).text();
  const data = JSON.parse(raw);

  // Support both raw array and FetchOutput format
  const songs: Song[] = Array.isArray(data) ? data : data.songs ?? [];
  log.success(`Loaded ${songs.length} songs from ${jsonPath}`);
  return { songs, source: `json:${path.basename(jsonPath)}` };
}
