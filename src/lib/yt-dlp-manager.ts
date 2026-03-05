/**
 * yt-dlp Auto-Manager
 *
 * Downloads yt-dlp to ~/.apple-mp3/bin/ on first run and self-updates on each startup.
 * This way the distributed binary has zero external dependencies.
 */
import path from "node:path";
import os from "node:os";

const APP_DIR = path.join(os.homedir(), ".apple-mp3");
const BIN_DIR = path.join(APP_DIR, "bin");

function getBinaryName(): string {
  if (process.platform === "win32") return "yt-dlp.exe";
  if (process.platform === "darwin") return "yt-dlp_macos";
  return "yt-dlp"; // Linux
}

function getGithubAssetName(): string {
  if (process.platform === "win32") return "yt-dlp.exe";
  if (process.platform === "darwin") return "yt-dlp_macos";
  return "yt-dlp"; // Linux x86_64
}

export function getYtDlpPath(): string {
  return path.join(BIN_DIR, getBinaryName());
}

export type SetupProgressCallback = (msg: string) => void;

export async function ensureYtDlp(onProgress?: SetupProgressCallback): Promise<string> {
  await Bun.$`mkdir -p ${BIN_DIR}`.quiet();

  const binPath = getYtDlpPath();
  const binFile = Bun.file(binPath);
  const exists = await binFile.exists();

  if (!exists) {
    await downloadYtDlp(binPath, onProgress);
  } else {
    // Self-update on each startup (non-blocking, fire and forget is fine but we await to
    // surface errors in logs)
    await selfUpdate(binPath, onProgress);
  }

  return binPath;
}

async function downloadYtDlp(binPath: string, onProgress?: SetupProgressCallback): Promise<void> {
  const assetName = getGithubAssetName();
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`;

  onProgress?.(`Downloading yt-dlp from GitHub...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download yt-dlp: HTTP ${response.status} from ${url}`);
  }

  await Bun.write(binPath, response);

  // Make executable on Unix
  if (process.platform !== "win32") {
    await Bun.$`chmod +x ${binPath}`.quiet();
  }

  onProgress?.(`yt-dlp downloaded successfully.`);
}

async function selfUpdate(binPath: string, onProgress?: SetupProgressCallback): Promise<void> {
  onProgress?.(`Checking for yt-dlp updates...`);
  const proc = Bun.spawn([binPath, "-U"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
  ]);
  if (code === 0) {
    const line = stdout.trim().split("\n").at(-1) ?? "";
    onProgress?.(line || "yt-dlp is up to date.");
  } else {
    // Update failures are non-fatal — old version still works
    onProgress?.("yt-dlp update check failed (will use existing version).");
  }
}
