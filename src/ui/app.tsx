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
  /* ── Pastel Cartoon Variables ── */
  :root {
    --bg-grad-start: #fff0fb;
    --bg-grad-end: #f0f4ff;
    --surface: #ffffff;
    --border: #2a2a2a;
    --shadow: 4px 4px 0 #2a2a2a;
    --shadow-sm: 2px 2px 0 #2a2a2a;
    --accent: #ff6b8a;
    --accent-dark: #d94f6e;
    --text: #2a2a2a;
    --muted: #7a6b7f;
    --green: #3dba6f;
    --green-bg: #d4f5e2;
    --yellow: #c49a00;
    --yellow-bg: #fff8d4;
    --tab-setup: #ffb3ba;
    --tab-library: #c9b8ff;
    --tab-download: #b8f0c9;
    --radius-card: 16px;
    --radius-btn: 12px;
    --radius-input: 10px;
    --radius-badge: 6px;
  }
  body {
    background: linear-gradient(135deg, var(--bg-grad-start) 0%, var(--bg-grad-end) 100%);
    background-attachment: fixed;
    color: var(--text);
  }
  .app { max-width: 780px; margin: 0 auto; padding: 36px 20px; }
  h1 {
    font-family: 'Fredoka One', cursive;
    font-size: 2rem;
    font-weight: 400;
    color: var(--accent);
    text-shadow: 2px 2px 0 #2a2a2a;
    letter-spacing: 0.02em;
    margin-bottom: 4px;
  }
  .subtitle { color: var(--muted); font-size: 0.9rem; font-weight: 600; margin-bottom: 32px; }
  .tabs { display: flex; gap: 8px; margin-bottom: 28px; }
  .tab {
    padding: 10px 22px;
    border: 2px solid var(--border);
    border-radius: var(--radius-btn);
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 700;
    font-family: 'Nunito', sans-serif;
    box-shadow: var(--shadow-sm);
    transition: transform 0.1s, box-shadow 0.1s;
  }
  .tab:hover { transform: translateY(-2px); box-shadow: 4px 6px 0 #2a2a2a; color: var(--text); }
  .tab.active[data-tab="setup"]    { background: var(--tab-setup);    color: var(--text); box-shadow: var(--shadow); }
  .tab.active[data-tab="library"]  { background: var(--tab-library);  color: var(--text); box-shadow: var(--shadow); }
  .tab.active[data-tab="download"] { background: var(--tab-download); color: var(--text); box-shadow: var(--shadow); }
  .tab.active { background: var(--tab-setup); color: var(--text); border-color: var(--border); box-shadow: var(--shadow); }
  .card { background: var(--surface); border: 2px solid var(--border); border-radius: var(--radius-card); padding: 22px; margin-bottom: 18px; box-shadow: var(--shadow); }
  label { display: block; font-size: 0.78rem; font-weight: 700; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.06em; }
  input {
    display: block; width: 100%;
    background: #fdf6ff;
    border: 2px solid var(--border);
    border-radius: var(--radius-input);
    padding: 10px 13px;
    color: var(--text);
    font-size: 0.9rem;
    font-family: 'Nunito', sans-serif;
    font-weight: 600;
    margin-bottom: 14px;
    outline: none;
    box-shadow: var(--shadow-sm);
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  input:focus { border-color: var(--accent); box-shadow: 3px 3px 0 var(--accent-dark); }
  .row { display: flex; gap: 10px; }
  .row input { flex: 1; }
  button {
    padding: 10px 22px;
    border-radius: var(--radius-btn);
    border: 2px solid var(--border);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 700;
    font-family: 'Nunito', sans-serif;
    box-shadow: var(--shadow);
    transition: transform 0.12s, box-shadow 0.12s, opacity 0.12s;
  }
  button:hover:not(:disabled) { transform: translateY(-2px) scale(1.02); box-shadow: 5px 6px 0 #2a2a2a; }
  button:active:not(:disabled) { transform: translateY(1px) scale(0.99); box-shadow: 2px 2px 0 #2a2a2a; }
  button:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: 2px 2px 0 #aaa; border-color: #aaa; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover:not(:disabled) { background: var(--accent-dark); }
  .btn-secondary { background: #ede8ff; color: var(--text); }
  .btn-secondary:hover:not(:disabled) { background: #ddd4ff; }
  .stat-row { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 20px; }
  .stat { background: var(--surface); border: 2px solid var(--border); border-radius: 14px; padding: 14px 20px; box-shadow: var(--shadow-sm); min-width: 100px; }
  .stat-val { font-family: 'Fredoka One', cursive; font-size: 1.7rem; font-weight: 400; color: var(--accent); letter-spacing: 0.02em; }
  .stat-label { font-size: 0.72rem; font-weight: 700; color: var(--muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em; }
  .log {
    background: #1e1a2e;
    border: 2px solid var(--border);
    border-radius: var(--radius-card);
    padding: 16px;
    font-family: 'Courier New', 'Menlo', monospace;
    font-size: 0.78rem;
    line-height: 1.7;
    height: 320px; max-height: 320px;
    overflow-y: auto;
    color: #ccc;
    white-space: pre-wrap;
    word-break: break-all;
    box-shadow: var(--shadow);
  }
  .log .info    { color: #93c5fd; }
  .log .success { color: #6ee7a0; }
  .log .warn    { color: #fde68a; }
  .log .error   { color: #fca5a5; }
  .badge { display: inline-block; padding: 3px 9px; border-radius: var(--radius-badge); border: 1.5px solid var(--border); font-size: 0.72rem; font-weight: 700; font-family: 'Nunito', sans-serif; }
  .badge-green  { background: var(--green-bg); color: var(--green); }
  .badge-red    { background: #ffe4ea; color: #d94f6e; }
  .badge-yellow { background: var(--yellow-bg); color: var(--yellow); }
  .hint { font-size: 0.82rem; font-weight: 600; color: var(--muted); margin-bottom: 16px; line-height: 1.6; }
  .section-title { font-family: 'Fredoka One', cursive; font-size: 1.1rem; font-weight: 400; color: var(--text); margin-bottom: 14px; letter-spacing: 0.01em; }
  .file-upload-label { display: inline-block; padding: 10px 22px; background: #fff4b8; border: 2px solid var(--border); border-radius: var(--radius-btn); cursor: pointer; font-size: 0.9rem; font-weight: 700; font-family: 'Nunito', sans-serif; box-shadow: var(--shadow); transition: transform 0.12s, box-shadow 0.12s; margin-bottom: 14px; }
  .file-upload-label:hover { background: #ffe97a; transform: translateY(-2px) scale(1.02); box-shadow: 5px 6px 0 #2a2a2a; }
  .spacer { margin-bottom: 12px; }
  .flex-gap { display: flex; gap: 10px; flex-wrap: wrap; }
  .song-list-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
  .song-list-toolbar input[type="text"] { flex: 1; min-width: 180px; margin-bottom: 0; }
  .song-list-toolbar .selection-info { font-size: 0.8rem; font-weight: 700; color: var(--muted); white-space: nowrap; }
  .song-list-toolbar button { padding: 7px 15px; font-size: 0.8rem; }
  .song-list-container { background: var(--surface); border: 2px solid var(--border); border-radius: var(--radius-card); max-height: 400px; overflow-y: auto; margin-bottom: 16px; box-shadow: var(--shadow); }
  .playlist-group {}
  .playlist-header { display: flex; align-items: center; gap: 8px; padding: 9px 14px; background: #f3eeff; border-bottom: 2px solid var(--border); cursor: pointer; user-select: none; position: sticky; top: 0; z-index: 1; }
  .playlist-header:hover { background: #ebe3ff; }
  .playlist-header input[type="checkbox"] { margin: 0; flex-shrink: 0; }
  .playlist-header .pl-name { font-weight: 700; font-size: 0.87rem; color: var(--text); }
  .playlist-header .pl-count { font-size: 0.75rem; font-weight: 600; color: var(--muted); margin-left: auto; }
  .playlist-header .pl-arrow { font-size: 0.72rem; color: var(--muted); transition: transform 0.15s; }
  .playlist-header .pl-arrow.collapsed { transform: rotate(-90deg); }
  .song-row { display: flex; align-items: center; gap: 8px; padding: 5px 14px 5px 30px; border-bottom: 1px solid #f0eaff; font-size: 0.8rem; font-weight: 600; color: var(--muted); transition: background 0.1s; }
  .song-row:hover { background: #fdf6ff; }
  .song-row input[type="checkbox"] { margin: 0; flex-shrink: 0; }
  .song-row .song-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
  .song-row .yt-info { font-size: 0.75rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .song-row .yt-info a { color: #7c5cbf; text-decoration: none; }
  .song-row .yt-info a:hover { text-decoration: underline; }
  .song-row .yt-duration { font-size: 0.74rem; color: var(--muted); flex-shrink: 0; }
  .song-row-detail { flex-direction: column; align-items: flex-start; gap: 2px; padding: 7px 14px 7px 30px; }
  .song-row-detail .song-row-top { display: flex; align-items: center; gap: 8px; width: 100%; }
  input[type="checkbox"] { width: auto; display: inline-block; margin-bottom: 0; accent-color: var(--accent); }
  .log::-webkit-scrollbar, .song-list-container::-webkit-scrollbar { width: 6px; }
  .log::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
  .song-list-container::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
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
  const lastClickedId = useRef<string | null>(null);

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

  // Flat list of visible (non-collapsed, filtered) song IDs for shift-select range
  const visibleSongIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of filteredGroups) {
      if (!collapsedPlaylists.has(g.id)) {
        for (const id of g.songIds) ids.push(id);
      }
    }
    return ids;
  }, [filteredGroups, collapsedPlaylists]);

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

  const toggleSong = (id: string, shiftKey: boolean) => {
    const next = new Set(selectedIds);
    if (shiftKey && lastClickedId.current) {
      const lastIdx = visibleSongIds.indexOf(lastClickedId.current);
      const curIdx = visibleSongIds.indexOf(id);
      if (lastIdx !== -1 && curIdx !== -1) {
        const start = Math.min(lastIdx, curIdx);
        const end = Math.max(lastIdx, curIdx);
        for (let i = start; i <= end; i++) {
          next.add(visibleSongIds[i]!);
        }
        onSelectionChange(next);
        lastClickedId.current = id;
        return;
      }
    }
    if (next.has(id)) next.delete(id);
    else next.add(id);
    lastClickedId.current = id;
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
                            onChange={(e) =>
                              toggleSong(
                                id,
                                e.nativeEvent instanceof MouseEvent &&
                                  e.nativeEvent.shiftKey,
                              )
                            }
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
                        onChange={(e) =>
                          toggleSong(
                            id,
                            e.nativeEvent instanceof MouseEvent &&
                              e.nativeEvent.shiftKey,
                          )
                        }
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
  const [ytDlpInstalled, setYtDlpInstalled] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"setup" | "library" | "download">("setup");
  const [config, setConfig] = useState<Config>({});
  const [status, setStatus] = useState<Status>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const xmlFileRef = useRef<HTMLInputElement>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const checkPreflight = useCallback(() => {
    fetch("/api/preflight")
      .then((r) => r.json())
      .then((data: { ytDlp: boolean }) => setYtDlpInstalled(data.ytDlp))
      .catch(() => setYtDlpInstalled(false));
  }, []);

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

  // Check preflight + load config + status on mount
  useEffect(() => {
    checkPreflight();
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

  if (ytDlpInstalled === null) {
    return (
      <>
        <style>{css}</style>
        <div className="app" style={{ textAlign: "center", paddingTop: 120 }}>
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        </div>
      </>
    );
  }

  if (ytDlpInstalled === false) {
    return (
      <>
        <style>{css}</style>
        <div className="app" style={{ textAlign: "center", paddingTop: 80 }}>
          <h1>apple-mp3</h1>
          <div className="card" style={{ maxWidth: 480, margin: "32px auto" }}>
            <p className="section-title" style={{ color: "var(--accent)" }}>
              yt-dlp not found
            </p>
            <p className="hint" style={{ marginBottom: 16 }}>
              This app requires <strong>yt-dlp</strong> to download MP3s from
              YouTube. Please install it and try again.
            </p>
            <p style={{ marginBottom: 16 }}>
              Install yt-dlp by following the instructions on their{" "}
              <a
                style={{ color: "var(--accent)" }}
                href="https://github.com/yt-dlp/yt-dlp?tab=readme-ov-file#installation"
              >
                GitHub
              </a>
            </p>
            <button className="btn-primary" onClick={checkPreflight}>
              Retry
            </button>
          </div>
        </div>
      </>
    );
  }

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
              data-tab={t}
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
