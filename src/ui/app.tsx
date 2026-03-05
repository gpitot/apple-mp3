import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { createRoot } from "react-dom/client";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Config {
  outputDir?: string;
}

interface Status {
  fetchFile?: string;
  searchFile?: string;
  downloadFile?: string;
  songCount?: number;
  foundCount?: number;
  downloadedCount?: number;
  running?: string | null;
}

interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  playlistId?: string;
  playlistName?: string;
}

interface Playlist {
  id: string;
  name: string;
  songIds: string[];
}

interface FetchData {
  totalSongs: number;
  songs: Song[];
  playlists?: Playlist[];
}

interface SongWithUrl extends Song {
  searchStatus: string;
  youtubeUrl?: string;
  youtubeTitle?: string;
  youtubeDurationSec?: number;
}

interface SearchData {
  totalSongs: number;
  foundCount: number;
  songs: SongWithUrl[];
  playlists?: Playlist[];
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
  .log { background: #111; border: 1px solid var(--border); border-radius: 6px; padding: 14px; font-family: monospace; font-size: 0.8rem; line-height: 1.6; height: 320px; max-height: 320px; overflow-y: auto; color: #bbb; white-space: pre-wrap; word-break: break-all; }
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

  .song-list-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
  .song-list-toolbar input[type="text"] { flex: 1; min-width: 180px; margin-bottom: 0; }
  .song-list-toolbar .selection-info { font-size: 0.8rem; color: var(--muted); white-space: nowrap; }
  .song-list-toolbar button { padding: 6px 14px; font-size: 0.8rem; }
  .song-list-container { background: #111; border: 1px solid var(--border); border-radius: 6px; max-height: 400px; overflow-y: auto; margin-bottom: 14px; }
  .playlist-group {}
  .playlist-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #1e1e1e; border-bottom: 1px solid var(--border); cursor: pointer; user-select: none; position: sticky; top: 0; z-index: 1; }
  .playlist-header:hover { background: #252525; }
  .playlist-header input[type="checkbox"] { margin: 0; flex-shrink: 0; }
  .playlist-header .pl-name { font-weight: 600; font-size: 0.85rem; }
  .playlist-header .pl-count { font-size: 0.75rem; color: var(--muted); margin-left: auto; }
  .playlist-header .pl-arrow { font-size: 0.7rem; color: var(--muted); transition: transform 0.15s; }
  .playlist-header .pl-arrow.collapsed { transform: rotate(-90deg); }
  .song-row { display: flex; align-items: center; gap: 8px; padding: 4px 12px 4px 28px; border-bottom: 1px solid #1a1a1a; font-size: 0.8rem; color: var(--muted); }
  .song-row:hover { background: #1a1a1a; }
  .song-row input[type="checkbox"] { margin: 0; flex-shrink: 0; }
  .song-row .song-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .song-row .yt-info { font-size: 0.75rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .song-row .yt-info a { color: #60a5fa; text-decoration: none; }
  .song-row .yt-info a:hover { text-decoration: underline; }
  .song-row .yt-duration { font-size: 0.75rem; color: var(--muted); flex-shrink: 0; }
  .song-row-detail { flex-direction: column; align-items: flex-start; gap: 2px; padding: 6px 12px 6px 28px; }
  .song-row-detail .song-row-top { display: flex; align-items: center; gap: 8px; width: 100%; }
  input[type="checkbox"] { width: auto; display: inline-block; margin-bottom: 0; }
`;

// ── SongList Component ──────────────────────────────────────────────────────────

interface SongExtra {
  youtubeUrl?: string;
  youtubeTitle?: string;
  youtubeDurationSec?: number;
}

interface SongListProps {
  songs: Song[];
  playlists: Playlist[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  songExtras?: Map<string, SongExtra>;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function SongList({
  songs,
  playlists,
  selectedIds,
  onSelectionChange,
  songExtras,
}: SongListProps) {
  const [search, setSearch] = useState("");
  const [collapsedPlaylists, setCollapsedPlaylists] = useState<Set<string>>(
    new Set(),
  );

  // Build a map of songId -> Song for quick lookup
  const songMap = useMemo(() => {
    const m = new Map<string, Song>();
    for (const s of songs) m.set(s.id, s);
    return m;
  }, [songs]);

  // Group songs by playlist; songs not in any playlist go to "Uncategorized"
  const groups = useMemo(() => {
    const songIdsInPlaylists = new Set<string>();
    const result: { name: string; id: string; songIds: string[] }[] = [];

    for (const pl of playlists) {
      const validIds = pl.songIds.filter((id) => songMap.has(id));
      if (validIds.length > 0) {
        result.push({ name: pl.name, id: pl.id, songIds: validIds });
        for (const id of validIds) songIdsInPlaylists.add(id);
      }
    }

    const uncategorized = songs.filter((s) => !songIdsInPlaylists.has(s.id));
    if (uncategorized.length > 0) {
      result.push({
        name: "Uncategorized",
        id: "__uncategorized__",
        songIds: uncategorized.map((s) => s.id),
      });
    }

    return result;
  }, [songs, playlists, songMap]);

  // Filter by search term
  const lowerSearch = search.toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!lowerSearch) return groups;
    return groups
      .map((g) => {
        const nameMatch = g.name.toLowerCase().includes(lowerSearch);
        if (nameMatch) return g; // show all songs in matching playlist
        const filtered = g.songIds.filter((id) => {
          const s = songMap.get(id);
          if (!s) return false;
          if (
            s.title.toLowerCase().includes(lowerSearch) ||
            s.artist.toLowerCase().includes(lowerSearch) ||
            s.album.toLowerCase().includes(lowerSearch)
          )
            return true;
          const extra = songExtras?.get(id);
          if (extra?.youtubeTitle?.toLowerCase().includes(lowerSearch))
            return true;
          return false;
        });
        return { ...g, songIds: filtered };
      })
      .filter((g) => g.songIds.length > 0);
  }, [groups, lowerSearch, songMap]);

  const totalSongs = songs.length;
  const selectedCount = selectedIds.size;

  const selectAll = () => onSelectionChange(new Set(songs.map((s) => s.id)));
  const deselectAll = () => onSelectionChange(new Set());

  const togglePlaylist = (songIds: string[]) => {
    const next = new Set(selectedIds);
    const allSelected = songIds.every((id) => next.has(id));
    if (allSelected) {
      for (const id of songIds) next.delete(id);
    } else {
      for (const id of songIds) next.add(id);
    }
    onSelectionChange(next);
  };

  const toggleSong = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const toggleCollapse = (plId: string) => {
    setCollapsedPlaylists((prev) => {
      const next = new Set(prev);
      if (next.has(plId)) next.delete(plId);
      else next.add(plId);
      return next;
    });
  };

  return (
    <div>
      <div className="song-list-toolbar">
        <input
          type="text"
          placeholder="Filter songs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="selection-info">
          {selectedCount} / {totalSongs} selected
        </span>
        <button className="btn-secondary" onClick={selectAll}>
          All
        </button>
        <button className="btn-secondary" onClick={deselectAll}>
          None
        </button>
      </div>
      <div className="song-list-container">
        {filteredGroups.map((g) => {
          const allSelected = g.songIds.every((id) => selectedIds.has(id));
          const someSelected =
            !allSelected && g.songIds.some((id) => selectedIds.has(id));
          const isCollapsed = collapsedPlaylists.has(g.id);
          return (
            <div key={g.id} className="playlist-group">
              <div
                className="playlist-header"
                onClick={() => toggleCollapse(g.id)}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={(e) => {
                    e.stopPropagation();
                    togglePlaylist(g.songIds);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className={`pl-arrow${isCollapsed ? " collapsed" : ""}`}>
                  &#9660;
                </span>
                <span className="pl-name">{g.name}</span>
                <span className="pl-count">{g.songIds.length} songs</span>
              </div>
              {!isCollapsed &&
                g.songIds.map((id) => {
                  const s = songMap.get(id);
                  if (!s) return null;
                  const extra = songExtras?.get(id);
                  if (extra) {
                    return (
                      <div
                        key={`${g.id}-${id}`}
                        className="song-row song-row-detail"
                      >
                        <div className="song-row-top">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(id)}
                            onChange={() => toggleSong(id)}
                          />
                          <span className="song-text">
                            {s.artist} - {s.title}
                          </span>
                          {extra.youtubeDurationSec != null && (
                            <span className="yt-duration">
                              {formatDuration(extra.youtubeDurationSec)}
                            </span>
                          )}
                        </div>
                        {extra.youtubeTitle && (
                          <div className="yt-info" style={{ paddingLeft: 22 }}>
                            {extra.youtubeUrl ? (
                              <a
                                href={extra.youtubeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {extra.youtubeTitle}
                              </a>
                            ) : (
                              extra.youtubeTitle
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={`${g.id}-${id}`} className="song-row">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(id)}
                        onChange={() => toggleSong(id)}
                      />
                      <span className="song-text">
                        {s.artist} - {s.title}
                      </span>
                    </div>
                  );
                })}
            </div>
          );
        })}
        {filteredGroups.length === 0 && (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              color: "var(--muted)",
              fontSize: "0.85rem",
            }}
          >
            {search ? "No songs match your filter" : "No songs loaded"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────

function App() {
  const [tab, setTab] = useState<"setup" | "library" | "download">("setup");
  const [config, setConfig] = useState<Config>({});
  const [status, setStatus] = useState<Status>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const xmlFileRef = useRef<HTMLInputElement>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);

  // Song list state for Library tab
  const [librarySongs, setLibrarySongs] = useState<Song[]>([]);
  const [libraryPlaylists, setLibraryPlaylists] = useState<Playlist[]>([]);
  const [librarySelected, setLibrarySelected] = useState<Set<string>>(
    new Set(),
  );

  // Song list state for Download tab
  const [downloadSongs, setDownloadSongs] = useState<Song[]>([]);
  const [downloadPlaylists, setDownloadPlaylists] = useState<Playlist[]>([]);
  const [downloadSelected, setDownloadSelected] = useState<Set<string>>(
    new Set(),
  );
  const [downloadExtras, setDownloadExtras] = useState<Map<string, SongExtra>>(
    new Map(),
  );

  // Load config + status on mount
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: Config) => setConfig(c))
      .catch(() => {});
    refreshStatus();
  }, []);

  // Load songs when switching to library/download tabs
  useEffect(() => {
    if (tab === "library") loadLibrarySongs();
    if (tab === "download") loadDownloadSongs();
  }, [tab]);

  const loadLibrarySongs = () => {
    fetch("/api/songs")
      .then((r) => r.json())
      .then((data: FetchData | null) => {
        if (data && data.songs) {
          setLibrarySongs(data.songs);
          setLibraryPlaylists(data.playlists ?? []);
          // Select all by default if nothing selected yet
          setLibrarySelected((prev) =>
            prev.size === 0 ? new Set(data.songs.map((s) => s.id)) : prev,
          );
        }
      })
      .catch(() => {});
  };

  const loadDownloadSongs = () => {
    fetch("/api/songs-with-urls")
      .then((r) => r.json())
      .then((data: SearchData | null) => {
        if (data && data.songs) {
          const found = data.songs.filter((s) => s.searchStatus === "found");
          setDownloadSongs(found);
          setDownloadPlaylists(data.playlists ?? []);
          setDownloadSelected((prev) =>
            prev.size === 0 ? new Set(found.map((s) => s.id)) : prev,
          );
          const extras = new Map<string, SongExtra>();
          for (const s of found) {
            extras.set(s.id, {
              youtubeUrl: s.youtubeUrl,
              youtubeTitle: s.youtubeTitle,
              youtubeDurationSec: s.youtubeDurationSec,
            });
          }
          setDownloadExtras(extras);
        }
      })
      .catch(() => {});
  };

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

  const eventSourceRef = useRef<EventSource | null>(null);

  // Recover running job state on mount
  useEffect(() => {
    fetch("/api/job-status")
      .then((r) => r.json())
      .then(
        (job: { endpoint: string; status: string; error?: string } | null) => {
          if (job && job.status === "running") {
            setRunning(job.endpoint);
            // Attach to SSE stream to pick up logs + completion
            const es = new EventSource("/api/logs");
            eventSourceRef.current = es;
            es.onmessage = (e) => appendLog(e.data);
            es.addEventListener("job-done", (e: MessageEvent) => {
              const data = JSON.parse(e.data);
              if (!data.ok)
                appendLog(`ERROR: ${data.error ?? "Unknown error"}`);
              else appendLog("Done.");
              es.close();
              eventSourceRef.current = null;
              setRunning(null);
              refreshStatus();
            });
          }
        },
      )
      .catch(() => {});
  }, []);

  const runJob = async (
    endpoint: string,
    body?: object,
    onDone?: () => void,
  ) => {
    setLogs([]);
    setRunning(endpoint);

    const es = new EventSource("/api/logs");
    eventSourceRef.current = es;
    es.onmessage = (e) => appendLog(e.data);
    es.addEventListener("job-done", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      if (!data.ok) appendLog(`ERROR: ${data.error ?? "Unknown error"}`);
      else appendLog("Done.");
      es.close();
      eventSourceRef.current = null;
      setRunning(null);
      refreshStatus();
      onDone?.();
    });

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        appendLog(`ERROR: ${data.error ?? "Unknown error"}`);
        es.close();
        eventSourceRef.current = null;
        setRunning(null);
      }
    } catch (err: any) {
      appendLog(`ERROR: ${err.message}`);
      es.close();
      eventSourceRef.current = null;
      setRunning(null);
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
    const res = await fetch("/api/upload-xml", {
      method: "POST",
      body: formData,
    });
    const { path: xmlPath } = await res.json();
    runJob("/api/fetch", { fromXml: xmlPath }, () => {
      loadLibrarySongs();
      setTab("library");
    });
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload-csv", {
      method: "POST",
      body: formData,
    });
    const { path: csvPath } = await res.json();
    runJob("/api/fetch", { fromCsv: csvPath }, () => {
      loadLibrarySongs();
      setTab("library");
    });
  };

  const classForLog = (line: string): string => {
    if (line.startsWith("ERROR") || line.includes("\u2717")) return "error";
    if (line.includes("\u2713") || line.includes("Done.")) return "success";
    if (line.includes("\u26A0")) return "warn";
    return "info";
  };

  const handleSearchYouTube = () => {
    const allSelected = librarySelected.size === librarySongs.length;
    const body = allSelected ? {} : { songIds: Array.from(librarySelected) };
    runJob("/api/search", body, () => {
      loadDownloadSongs();
      setTab("download");
    });
  };

  const handleDownload = () => {
    const allSelected = downloadSelected.size === downloadSongs.length;
    const body = allSelected ? {} : { songIds: Array.from(downloadSelected) };
    runJob("/api/download", body);
  };

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <h1>apple-mp3</h1>
        <p className="subtitle">Download your Apple Music library as MP3s</p>

        <div className="tabs">
          {(["setup", "library", "download"] as const).map((t) => (
            <button
              key={t}
              className={`tab${tab === t ? " active" : ""}`}
              onClick={() => setTab(t)}
            >
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
                Export your iTunes/Music library XML from{" "}
                <strong>
                  File &rarr; Library &rarr; Export Library&hellip;
                </strong>{" "}
                and upload it here.
              </p>
              <div className="flex-gap">
                <label className="file-upload-label">
                  Upload iTunes XML
                  <input
                    ref={xmlFileRef}
                    type="file"
                    accept=".xml"
                    style={{ display: "none" }}
                    onChange={handleXmlUpload}
                  />
                </label>
                <label className="file-upload-label">
                  Upload CSV
                  <input
                    ref={csvFileRef}
                    type="file"
                    accept=".csv"
                    style={{ display: "none" }}
                    onChange={handleCsvUpload}
                  />
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
                onChange={(e) =>
                  setConfig({ ...config, outputDir: e.target.value })
                }
              />
            </div>

            <button className="btn-primary" onClick={saveConfig}>
              {saved ? "Saved \u2713" : "Save Settings"}
            </button>
          </div>
        )}

        {/* ── LIBRARY TAB ───────────────────────────────────────────────────── */}
        {tab === "library" && (
          <div>
            <div className="stat-row">
              <div className="stat">
                <div className="stat-val">{status.songCount ?? "\u2014"}</div>
                <div className="stat-label">Songs fetched</div>
              </div>
              <div className="stat">
                <div className="stat-val">{status.foundCount ?? "\u2014"}</div>
                <div className="stat-label">YouTube matches</div>
              </div>
              <div className="stat">
                <div className="stat-val">
                  {status.downloadedCount ?? "\u2014"}
                </div>
                <div className="stat-label">MP3s downloaded</div>
              </div>
            </div>

            {librarySongs.length > 0 && (
              <SongList
                songs={librarySongs}
                playlists={libraryPlaylists}
                selectedIds={librarySelected}
                onSelectionChange={setLibrarySelected}
              />
            )}

            <div className="flex-gap spacer">
              <button
                className="btn-secondary"
                disabled={
                  !!running || !status.songCount || librarySelected.size === 0
                }
                onClick={handleSearchYouTube}
              >
                {running === "/api/search"
                  ? "Searching\u2026"
                  : `Search YouTube (${librarySelected.size})`}
              </button>
            </div>

            {logs.length > 0 && (
              <div ref={logRef} className="log">
                {logs.map((line, i) => (
                  <div key={i} className={classForLog(line)}>
                    {line}
                  </div>
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
                <div className="stat-val">{status.foundCount ?? "\u2014"}</div>
                <div className="stat-label">Ready to download</div>
              </div>
              <div className="stat">
                <div className="stat-val">
                  {status.downloadedCount ?? "\u2014"}
                </div>
                <div className="stat-label">Downloaded</div>
              </div>
            </div>

            {downloadSongs.length > 0 && (
              <SongList
                songs={downloadSongs}
                playlists={downloadPlaylists}
                selectedIds={downloadSelected}
                onSelectionChange={setDownloadSelected}
                songExtras={downloadExtras}
              />
            )}

            <div className="flex-gap spacer">
              <button
                className="btn-primary"
                disabled={
                  !!running || !status.foundCount || downloadSelected.size === 0
                }
                onClick={handleDownload}
              >
                {running === "/api/download"
                  ? "Downloading\u2026"
                  : `Download MP3s (${downloadSelected.size})`}
              </button>
            </div>

            {logs.length > 0 && (
              <div ref={logRef} className="log">
                {logs.map((line, i) => (
                  <div key={i} className={classForLog(line)}>
                    {line}
                  </div>
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
