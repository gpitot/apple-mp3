import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Config {
  outputDir?: string;
}

interface Status {
  ytDlpReady: boolean;
  ytDlpVersion?: string;
  ytDlpLog?: string;
  fetchFile?: string;
  searchFile?: string;
  downloadFile?: string;
  songCount?: number;
  foundCount?: number;
  downloadedCount?: number;
  running?: string | null;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const css = `
  :root { --bg: #0d0d0d; --surface: #1a1a1a; --border: #2e2e2e; --accent: #fa586a; --text: #e8e8e8; --muted: #888; --green: #4ade80; --yellow: #facc15; }
  body { background: var(--bg); color: var(--text); }
  .app { max-width: 780px; margin: 0 auto; padding: 32px 20px; }
  h1 { font-size: 1.6rem; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
  .subtitle { color: var(--muted); font-size: 0.85rem; margin-bottom: 28px; }
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
  .tab { padding: 8px 18px; border: none; background: none; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; font-size: 0.9rem; transition: color 0.15s; }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 16px; }
  label { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.05em; }
  input { display: block; width: 100%; background: #111; border: 1px solid var(--border); border-radius: 6px; padding: 9px 12px; color: var(--text); font-size: 0.9rem; margin-bottom: 14px; outline: none; }
  input:focus { border-color: var(--accent); }
  .row { display: flex; gap: 10px; }
  .row input { flex: 1; }
  button { padding: 9px 20px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.9rem; font-weight: 600; transition: opacity 0.15s; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-primary { background: var(--accent); color: white; }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }
  .btn-secondary { background: #2e2e2e; color: var(--text); }
  .btn-secondary:hover:not(:disabled) { background: #3a3a3a; }
  .stat-row { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
  .stat { background: #111; border: 1px solid var(--border); border-radius: 6px; padding: 12px 18px; }
  .stat-val { font-size: 1.5rem; font-weight: 700; }
  .stat-label { font-size: 0.75rem; color: var(--muted); margin-top: 2px; }
  .log { background: #111; border: 1px solid var(--border); border-radius: 6px; padding: 14px; font-family: monospace; font-size: 0.8rem; line-height: 1.6; max-height: 320px; overflow-y: auto; color: #bbb; white-space: pre-wrap; word-break: break-all; }
  .log .info { color: #60a5fa; }
  .log .success { color: var(--green); }
  .log .warn { color: var(--yellow); }
  .log .error { color: var(--accent); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
  .badge-green { background: #052c14; color: var(--green); }
  .badge-red { background: #2c0506; color: var(--accent); }
  .badge-yellow { background: #2c1f05; color: var(--yellow); }
  .hint { font-size: 0.8rem; color: var(--muted); margin-bottom: 14px; line-height: 1.5; }
  .section-title { font-size: 1rem; font-weight: 600; margin-bottom: 14px; }
  .file-upload-label { display: inline-block; padding: 9px 20px; background: #2e2e2e; border-radius: 6px; cursor: pointer; font-size: 0.9rem; margin-bottom: 14px; }
  .file-upload-label:hover { background: #3a3a3a; }
  .spacer { margin-bottom: 10px; }
  .flex-gap { display: flex; gap: 10px; flex-wrap: wrap; }
`;

// ── App ────────────────────────────────────────────────────────────────────────

function App() {
  const [tab, setTab] = useState<"setup" | "library" | "download">("setup");
  const [config, setConfig] = useState<Config>({});
  const [status, setStatus] = useState<Status>({ ytDlpReady: false });
  const [logs, setLogs] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const xmlFileRef = useRef<HTMLInputElement>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);

  // Load config + status on mount
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: Config) => setConfig(c))
      .catch(() => {});
    refreshStatus();
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const refreshStatus = useCallback(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s: Status) => setStatus(s))
      .catch(() => {});
  }, []);

  const appendLog = (line: string) => {
    setLogs((prev) => [...prev, line]);
  };

  const runJob = async (endpoint: string, body?: object) => {
    setLogs([]);
    setRunning(endpoint);

    const eventSource = new EventSource("/api/logs");
    eventSource.onmessage = (e) => {
      appendLog(e.data);
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        appendLog(`ERROR: ${data.error ?? "Unknown error"}`);
      } else {
        appendLog(`Done.`);
      }
    } catch (err: any) {
      appendLog(`ERROR: ${err.message}`);
    } finally {
      eventSource.close();
      setRunning(null);
      refreshStatus();
    }
  };

  const saveConfig = async () => {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    refreshStatus();
  };

  const handleXmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload-xml", { method: "POST", body: formData });
    const { path: xmlPath } = await res.json();
    await runJob("/api/fetch", { fromXml: xmlPath });
    setTab("library");
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload-csv", { method: "POST", body: formData });
    const { path: csvPath } = await res.json();
    await runJob("/api/fetch", { fromCsv: csvPath });
    setTab("library");
  };

  const classForLog = (line: string): string => {
    if (line.startsWith("ERROR") || line.includes("✗")) return "error";
    if (line.includes("✓") || line.includes("Done.")) return "success";
    if (line.includes("⚠")) return "warn";
    return "info";
  };

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <h1>apple-mp3</h1>
        <p className="subtitle">Download your Apple Music library as MP3s</p>

        {/* yt-dlp status badge */}
        <p className="hint">
          yt-dlp:{" "}
          {status.ytDlpReady ? (
            <span className="badge badge-green">ready {status.ytDlpVersion ? `(${status.ytDlpVersion})` : ""}</span>
          ) : (
            <span className="badge badge-yellow">{status.ytDlpLog ?? "setting up…"}</span>
          )}
        </p>

        <div className="tabs">
          {(["setup", "library", "download"] as const).map((t) => (
            <button key={t} className={`tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── SETUP TAB ─────────────────────────────────────────────────────── */}
        {tab === "setup" && (
          <div>
            <div className="card">
              <p className="section-title">Import Library</p>
              <p className="hint">
                Export your iTunes/Music library XML from <strong>File → Library → Export Library…</strong> and upload it here.
              </p>
              <div className="flex-gap">
                <label className="file-upload-label">
                  Upload iTunes XML
                  <input ref={xmlFileRef} type="file" accept=".xml" style={{ display: "none" }} onChange={handleXmlUpload} />
                </label>
                <label className="file-upload-label">
                  Upload CSV
                  <input ref={csvFileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCsvUpload} />
                </label>
              </div>
            </div>

            <div className="card">
              <p className="section-title">Output Directory</p>
              <label>Where to save MP3 files</label>
              <input
                type="text"
                placeholder="~/Downloads/apple-mp3"
                value={config.outputDir ?? ""}
                onChange={(e) => setConfig({ ...config, outputDir: e.target.value })}
              />
            </div>

            <button className="btn-primary" onClick={saveConfig}>
              {saved ? "Saved ✓" : "Save Settings"}
            </button>
          </div>
        )}

        {/* ── LIBRARY TAB ───────────────────────────────────────────────────── */}
        {tab === "library" && (
          <div>
            <div className="stat-row">
              <div className="stat">
                <div className="stat-val">{status.songCount ?? "—"}</div>
                <div className="stat-label">Songs fetched</div>
              </div>
              <div className="stat">
                <div className="stat-val">{status.foundCount ?? "—"}</div>
                <div className="stat-label">YouTube matches</div>
              </div>
              <div className="stat">
                <div className="stat-val">{status.downloadedCount ?? "—"}</div>
                <div className="stat-label">MP3s downloaded</div>
              </div>
            </div>

            <div className="flex-gap spacer">
              <button
                className="btn-secondary"
                disabled={!!running || !status.songCount}
                onClick={() => runJob("/api/search")}
              >
                {running === "/api/search" ? "Searching…" : "Search YouTube"}
              </button>
            </div>

            {logs.length > 0 && (
              <div ref={logRef} className="log">
                {logs.map((line, i) => (
                  <div key={i} className={classForLog(line)}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── DOWNLOAD TAB ──────────────────────────────────────────────────── */}
        {tab === "download" && (
          <div>
            <div className="stat-row">
              <div className="stat">
                <div className="stat-val">{status.foundCount ?? "—"}</div>
                <div className="stat-label">Ready to download</div>
              </div>
              <div className="stat">
                <div className="stat-val">{status.downloadedCount ?? "—"}</div>
                <div className="stat-label">Downloaded</div>
              </div>
            </div>

            <div className="flex-gap spacer">
              <button
                className="btn-primary"
                disabled={!!running || !status.foundCount || !status.ytDlpReady}
                onClick={() => runJob("/api/download")}
              >
                {running === "/api/download" ? "Downloading…" : "Download MP3s"}
              </button>
            </div>

            {!status.ytDlpReady && (
              <p className="hint" style={{ color: "#facc15" }}>Waiting for yt-dlp to finish setting up…</p>
            )}

            {logs.length > 0 && (
              <div ref={logRef} className="log">
                {logs.map((line, i) => (
                  <div key={i} className={classForLog(line)}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
