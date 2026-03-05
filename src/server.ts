/**
 * apple-mp3 Desktop App Server
 *
 * Serves a local web UI at http://localhost:3000.
 * Compile with: bun build --compile src/server.ts --outfile dist/apple-mp3
 */
import path from "node:path";
import os from "node:os";
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

function broadcastSSE(payload: string) {
  for (const ctrl of sseClients) {
    try {
      ctrl.enqueue(payload);
    } catch {
      sseClients.delete(ctrl);
    }
  }
}

const _origLog = console.log.bind(console);
console.log = (...args: any[]) => {
  _origLog(...args);
  const line = args
    .map((a) => (typeof a === "string" ? a : String(a)))
    .join(" ");
  // Strip ANSI escape codes for the browser
  const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
  broadcastSSE(`data: ${clean}\n\n`);
};

// ── Job tracking ──────────────────────────────────────────────────────────────

let currentJob: { endpoint: string; status: "running" | "done" | "error"; error?: string } | null = null;

function startJob(endpoint: string, work: () => Promise<unknown>) {
  currentJob = { endpoint, status: "running" };
  work()
    .then(() => {
      currentJob = { endpoint, status: "done" };
      broadcastSSE(`event: job-done\ndata: ${JSON.stringify({ endpoint, ok: true })}\n\n`);
    })
    .catch((err: any) => {
      currentJob = { endpoint, status: "error", error: err.message };
      broadcastSSE(`event: job-done\ndata: ${JSON.stringify({ endpoint, ok: false, error: err.message })}\n\n`);
    });
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

  return {
    songCount,
    foundCount,
    downloadedCount,
  };
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

    "/api/job-status": {
      GET: () => Response.json(currentJob),
    },

    "/api/config": {
      GET: async () => Response.json(await loadConfig()),
      POST: async (req: Request) => {
        const cfg: Config = await req.json();
        await saveConfig(cfg);
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
        if (currentJob?.status === "running")
          return Response.json({ error: "A job is already running" }, { status: 409 });
        const body: { fromXml?: string; fromCsv?: string } = await req.json();
        startJob("/api/fetch", () =>
          runFetch({
            outputFile: SONGS_FILE,
            fromXml: body.fromXml,
            fromCsv: body.fromCsv,
          })
        );
        return Response.json({ ok: true });
      },
    },

    // Get songs (for Library tab song list)
    "/api/songs": {
      GET: async () => {
        const f = Bun.file(SONGS_FILE);
        if (await f.exists()) {
          return new Response(await f.text(), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json(null);
      },
    },

    // Get songs with URLs (for Download tab song list)
    "/api/songs-with-urls": {
      GET: async () => {
        const f = Bun.file(SONGS_WITH_URLS_FILE);
        if (await f.exists()) {
          return new Response(await f.text(), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json(null);
      },
    },

    // Search YouTube
    "/api/search": {
      POST: async (req: Request) => {
        if (currentJob?.status === "running")
          return Response.json({ error: "A job is already running" }, { status: 409 });
        const body: { songIds?: string[] } = await req.json().catch(() => ({}));
        startJob("/api/search", () =>
          runSearch({
            inputFile: SONGS_FILE,
            outputFile: SONGS_WITH_URLS_FILE,
            songIds: body.songIds,
          })
        );
        return Response.json({ ok: true });
      },
    },

    // Download MP3s
    "/api/download": {
      POST: async (req: Request) => {
        if (currentJob?.status === "running")
          return Response.json({ error: "A job is already running" }, { status: 409 });
        const body: { songIds?: string[] } = await req.json().catch(() => ({}));
        const cfg = await loadConfig();
        const outputDir = cfg.outputDir
          ? cfg.outputDir.replace(/^~/, os.homedir())
          : path.join(os.homedir(), "Downloads", "apple-mp3");
        startJob("/api/download", () =>
          runDownload({
            inputFile: SONGS_WITH_URLS_FILE,
            statusFile: DOWNLOAD_STATUS_FILE,
            outputDir,
            songIds: body.songIds,
          })
        );
        return Response.json({ ok: true });
      },
    },
  },

  development:
    process.env.NODE_ENV !== "production"
      ? { hmr: true, console: true }
      : undefined,
});

console.log(`[apple-mp3] Server running at http://localhost:${PORT}`);

// Open browser
if (process.env.NODE_ENV === "production") {
  const url = `http://localhost:${PORT}`;
  if (process.platform === "darwin") {
    Bun.$`open ${url}`.quiet().catch(() => {});
  } else if (process.platform === "win32") {
    Bun.$`start ${url}`.quiet().catch(() => {});
  } else {
    Bun.$`xdg-open ${url}`.quiet().catch(() => {});
  }
}

export default server;
