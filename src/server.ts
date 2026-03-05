/**
 * apple-mp3 Desktop App Server
 *
 * Serves a local web UI at http://localhost:3000.
 * Compile with: bun build --compile src/server.ts --outfile dist/apple-mp3
 */
import path from "node:path";
import os from "node:os";
import { ensureYtDlp } from "./lib/yt-dlp-manager";
import { runFetch } from "./steps/fetch";
import { runSearch } from "./steps/search";
import { runDownload } from "./steps/download";
import indexHtml from "./ui/index.html";

// ── Paths ──────────────────────────────────────────────────────────────────────

const APP_DIR = path.join(os.homedir(), ".apple-mp3");
const DATA_DIR = path.join(APP_DIR, "data");
const CONFIG_FILE = path.join(APP_DIR, "config.json");
const SONGS_FILE = path.join(DATA_DIR, "songs.json");
const SONGS_WITH_URLS_FILE = path.join(DATA_DIR, "songs-with-urls.json");
const DOWNLOAD_STATUS_FILE = path.join(DATA_DIR, "download-status.json");
const UPLOADS_DIR = path.join(APP_DIR, "uploads");

// ── Config ─────────────────────────────────────────────────────────────────────

interface Config {
  appleDeveloperToken?: string;
  appleMusicUserToken?: string;
  youtubeApiKey?: string;
  outputDir?: string;
}

async function loadConfig(): Promise<Config> {
  const f = Bun.file(CONFIG_FILE);
  if (await f.exists()) {
    return JSON.parse(await f.text());
  }
  return {};
}

async function saveConfig(cfg: Config): Promise<void> {
  await Bun.$`mkdir -p ${APP_DIR}`.quiet();
  await Bun.write(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ── SSE log bridge ─────────────────────────────────────────────────────────────

// We intercept console.log to broadcast to connected SSE clients.
const sseClients = new Set<ReadableStreamDefaultController<string>>();

const _origLog = console.log.bind(console);
console.log = (...args: any[]) => {
  _origLog(...args);
  const line = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
  // Strip ANSI escape codes for the browser
  const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
  for (const ctrl of sseClients) {
    try {
      ctrl.enqueue(`data: ${clean}\n\n`);
    } catch {
      sseClients.delete(ctrl);
    }
  }
};

// ── yt-dlp setup ──────────────────────────────────────────────────────────────

let ytDlpReady = false;
let ytDlpVersion: string | undefined;
let ytDlpLog = "setting up…";

async function setupYtDlp() {
  try {
    await ensureYtDlp((msg) => {
      ytDlpLog = msg;
      console.log(`[yt-dlp] ${msg}`);
    });
    // Get version
    const { getYtDlpPath } = await import("./lib/yt-dlp-manager");
    const proc = Bun.spawn([getYtDlpPath(), "--version"], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    ytDlpVersion = (await new Response(proc.stdout).text()).trim();
    ytDlpReady = true;
    ytDlpLog = "ready";
    console.log(`[yt-dlp] Ready — version ${ytDlpVersion}`);
  } catch (err: any) {
    ytDlpLog = `Error: ${err.message}`;
    console.log(`[yt-dlp] Setup failed: ${err.message}`);
  }
}

// ── Status ─────────────────────────────────────────────────────────────────────

async function getStatus() {
  let songCount: number | undefined;
  let foundCount: number | undefined;
  let downloadedCount: number | undefined;

  const songsFile = Bun.file(SONGS_FILE);
  if (await songsFile.exists()) {
    const data = JSON.parse(await songsFile.text());
    songCount = data.totalSongs;
  }

  const urlsFile = Bun.file(SONGS_WITH_URLS_FILE);
  if (await urlsFile.exists()) {
    const data = JSON.parse(await urlsFile.text());
    foundCount = data.foundCount;
  }

  const dlFile = Bun.file(DOWNLOAD_STATUS_FILE);
  if (await dlFile.exists()) {
    const data = JSON.parse(await dlFile.text());
    downloadedCount = data.downloadedCount;
  }

  return { ytDlpReady, ytDlpVersion, ytDlpLog, songCount, foundCount, downloadedCount };
}

// ── Server ─────────────────────────────────────────────────────────────────────

await Bun.$`mkdir -p ${DATA_DIR} ${UPLOADS_DIR}`.quiet();

const PORT = 3000;

const server = Bun.serve({
  port: PORT,
  routes: {
    "/": indexHtml,

    // SSE log stream
    "/api/logs": {
      GET: () => {
        let ctrl!: ReadableStreamDefaultController<string>;
        const stream = new ReadableStream<string>({
          start(c) {
            ctrl = c;
            sseClients.add(ctrl);
          },
          cancel() {
            sseClients.delete(ctrl);
          },
        });
        return new Response(stream as any, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },

    "/api/status": {
      GET: async () => Response.json(await getStatus()),
    },

    "/api/config": {
      GET: async () => Response.json(await loadConfig()),
      POST: async (req: Request) => {
        const cfg: Config = await req.json();
        await saveConfig(cfg);
        // Apply env vars for this process so API calls work immediately
        if (cfg.appleDeveloperToken) process.env.APPLE_DEVELOPER_TOKEN = cfg.appleDeveloperToken;
        if (cfg.appleMusicUserToken) process.env.APPLE_MUSIC_USER_TOKEN = cfg.appleMusicUserToken;
        if (cfg.youtubeApiKey) process.env.YOUTUBE_API_KEY = cfg.youtubeApiKey;
        return Response.json({ ok: true });
      },
    },

    // Upload iTunes XML
    "/api/upload-xml": {
      POST: async (req: Request) => {
        const form = await req.formData();
        const file = form.get("file") as File;
        const dest = path.join(UPLOADS_DIR, "library.xml");
        await Bun.write(dest, file);
        return Response.json({ path: dest });
      },
    },

    // Upload CSV
    "/api/upload-csv": {
      POST: async (req: Request) => {
        const form = await req.formData();
        const file = form.get("file") as File;
        const dest = path.join(UPLOADS_DIR, "library.csv");
        await Bun.write(dest, file);
        return Response.json({ path: dest });
      },
    },

    // Fetch songs
    "/api/fetch": {
      POST: async (req: Request) => {
        const body: { fromXml?: string; fromCsv?: string; fromApi?: boolean } = await req.json();
        const cfg = await loadConfig();
        try {
          await runFetch({
            outputFile: SONGS_FILE,
            fromXml: body.fromXml,
            fromCsv: body.fromCsv,
            // If fromApi, tokens must be in env (set via saveConfig)
          });
          return Response.json({ ok: true });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      },
    },

    // Search YouTube
    "/api/search": {
      POST: async () => {
        const cfg = await loadConfig();
        if (cfg.youtubeApiKey) process.env.YOUTUBE_API_KEY = cfg.youtubeApiKey;
        try {
          await runSearch({
            inputFile: SONGS_FILE,
            outputFile: SONGS_WITH_URLS_FILE,
          });
          return Response.json({ ok: true });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      },
    },

    // Download MP3s
    "/api/download": {
      POST: async () => {
        const cfg = await loadConfig();
        const outputDir = cfg.outputDir
          ? cfg.outputDir.replace(/^~/, os.homedir())
          : path.join(os.homedir(), "Downloads", "apple-mp3");
        try {
          await runDownload({
            inputFile: SONGS_WITH_URLS_FILE,
            statusFile: DOWNLOAD_STATUS_FILE,
            outputDir,
          });
          return Response.json({ ok: true });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      },
    },
  },

  development: process.env.NODE_ENV !== "production" ? { hmr: true, console: true } : undefined,
});

console.log(`[apple-mp3] Server running at http://localhost:${PORT}`);

// Open browser
const url = `http://localhost:${PORT}`;
if (process.platform === "darwin") {
  Bun.$`open ${url}`.quiet().catch(() => {});
} else if (process.platform === "win32") {
  Bun.$`start ${url}`.quiet().catch(() => {});
} else {
  Bun.$`xdg-open ${url}`.quiet().catch(() => {});
}

// Set env vars from saved config on startup
const cfg = await loadConfig();
if (cfg.appleDeveloperToken) process.env.APPLE_DEVELOPER_TOKEN = cfg.appleDeveloperToken;
if (cfg.appleMusicUserToken) process.env.APPLE_MUSIC_USER_TOKEN = cfg.appleMusicUserToken;
if (cfg.youtubeApiKey) process.env.YOUTUBE_API_KEY = cfg.youtubeApiKey;

// Download/update yt-dlp in background
setupYtDlp();

export default server;
