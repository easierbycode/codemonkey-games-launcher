import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { copy } from "https://deno.land/std@0.224.0/fs/copy.ts";
import { join, fromFileUrl, dirname, basename } from "https://deno.land/std@0.224.0/path/mod.ts";

export function getAppRoot(): string {
  const exeBase = basename(Deno.execPath()).toLowerCase();
  const isDenoCli = exeBase === "deno" || exeBase === "deno.exe";
  if (isDenoCli) {
    return fromFileUrl(new URL("../", import.meta.url));
  }
  return dirname(Deno.execPath());
}

export const ROOT = getAppRoot();
export const GAMES_DIR = Deno.env.get("CMG_GAMES_DIR") ?? join(ROOT, "games");
await ensureDir(GAMES_DIR);

export type SourceInfo = {
  source: "github" | "url" | "zip";
  repo?: string;
  branch?: string;
  url?: string;
  subdir?: string;
};

export type RecommendedButton = {
  label: string;
  mapsTo: string;
  elementId: string;
};

export type GameEntry = {
  id: string;
  name: string;
  path: string;
  urlPath: string;
  hasThumbnail: boolean;
  sourceInfo?: SourceInfo;
  recommendedButtons?: RecommendedButton[];
};

const DEFAULT_CONFIGS: Record<string, { recommendedButtons: RecommendedButton[] }> = {
  "monkey combat": {
    recommendedButtons: [
      { label: "Start", mapsTo: "start", elementId: "character-select" },
    ],
  },
};

export async function listGames(): Promise<GameEntry[]> {
  const entries: GameEntry[] = [];
  for await (const dirEntry of Deno.readDir(GAMES_DIR)) {
    if (!dirEntry.isDirectory) continue;
    const id = dirEntry.name;
    const fsPath = join(GAMES_DIR, id);
    const thumbnailPath = join(fsPath, "thumbnail.png");
    const metadataPath = join(fsPath, "codemonkey.json");

    let hasThumbnail = false;
    try {
      const stat = await Deno.stat(thumbnailPath);
      hasThumbnail = stat.isFile;
    } catch (_) {
      hasThumbnail = false;
    }

    let metadata: Partial<GameEntry> = {};
    try {
      const metaContent = await Deno.readTextFile(metadataPath);
      metadata = JSON.parse(metaContent);
    } catch (_) {
      // Ignore if metadata doesn't exist or is invalid
    }

    const name = id.replace(/[-_]/g, " ");

    // Apply default config if it exists for the game
    const defaultConfig = DEFAULT_CONFIGS[name.toLowerCase()];
    if (defaultConfig && !metadata.recommendedButtons) {
      metadata.recommendedButtons = defaultConfig.recommendedButtons;
    }

    entries.push({
      id,
      name,
      path: fsPath,
      urlPath: `/games/${id}/`,
      hasThumbnail,
      sourceInfo: metadata.sourceInfo,
      recommendedButtons: metadata.recommendedButtons,
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

export async function extractArchiveToDir(
  archiveBytes: Uint8Array,
  archiveName: string,
  targetDir: string,
  subdirHint?: string,
) {
  await ensureDir(targetDir);

  const name = archiveName.toLowerCase();
  let extracted = false;
  const extractRoot = await Deno.makeTempDir();
  const tmpArchive = await Deno.makeTempFile();
  await Deno.writeFile(tmpArchive, archiveBytes);

  if (Deno.build.os === "darwin") {
    if (name.endsWith(".dmg")) {
      let mountPoint: string | null = null;
      try {
        const attach = new Deno.Command("hdiutil", {
          args: ["attach", "-nobrowse", "-mountpoint", await Deno.makeTempDir(), tmpArchive],
          stderr: "piped",
          stdout: "piped",
        });
        const { success, stdout } = await attach.output();
        if (success) {
          mountPoint = new TextDecoder().decode(stdout).trim().split("\t").pop() ?? null;
          if (mountPoint) {
            let appDir: string | null = null;
            for await (const entry of Deno.readDir(mountPoint)) {
              if (entry.isDirectory && entry.name.endsWith(".app")) {
                appDir = join(mountPoint, entry.name);
                break;
              }
            }
            if (appDir) {
              await copy(appDir, extractRoot, { overwrite: true });
              extracted = true;
            }
          }
        }
      } catch (e) {
        console.error("DMG extraction failed:", e);
      } finally {
        if (mountPoint) {
          try {
            await new Deno.Command("hdiutil", { args: ["detach", mountPoint] }).output();
          } catch { /* ignore */ }
        }
      }
    } else if (name.endsWith(".pkg")) {
      try {
        const xar = new Deno.Command("xar", {
          args: ["-xf", tmpArchive, "-C", extractRoot],
          stderr: "inherit",
          stdout: "inherit",
        });
        const { success } = await xar.output();
        extracted = !!success;
      } catch (e) {
        console.error("PKG extraction via xar failed:", e);
      }
    }
  }

  if (name.endsWith(".zip")) {
    try {
      const unzip = new Deno.Command("unzip", {
        args: ["-q", "-o", tmpArchive, "-d", extractRoot],
        stderr: "inherit",
        stdout: "inherit",
      });
      const { success } = await unzip.output();
      extracted = !!success;
    } catch (_) { /* ignore */ }
    if (!extracted && Deno.build.os === "darwin") {
      try {
        const ditto = new Deno.Command("/usr/bin/ditto", {
          args: ["-x", "-k", tmpArchive, extractRoot],
          stderr: "inherit",
          stdout: "inherit",
        });
        const { success } = await ditto.output();
        extracted = !!success;
      } catch (_) { /* ignore */ }
    }
    if (!extracted && Deno.build.os === "windows") {
      try {
        const zipPath = tmpArchive.replace(/'/g, "''");
        const outPath = extractRoot.replace(/'/g, "''");
        const psScript = `
          $ErrorActionPreference='Stop';
          if (Get-Command Expand-Archive -ErrorAction SilentlyContinue) {
            Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${outPath}' -Force
          } else {
            throw 'Expand-Archive not available'
          }
        `;
        const ps = new Deno.Command("powershell.exe", {
          args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", psScript],
          stderr: "inherit",
          stdout: "inherit",
        });
        const { success } = await ps.output();
        extracted = !!success;
      } catch (_) { /* ignore */ }
    }
  }

  if (!extracted) {
    throw new Error(
      "Failed to extract archive. Supported formats: .zip, .dmg (macOS), .pkg (macOS). Ensure system tools (unzip, ditto, xar, PowerShell) are available.",
    );
  }

  let base = extractRoot;
  const topLevel: string[] = [];
  for await (const e of Deno.readDir(extractRoot)) {
    topLevel.push(e.name);
  }
  if (topLevel.length === 1) {
    base = join(extractRoot, topLevel[0]);
  }
  const hint = (subdirHint || "root").toLowerCase();
  if (hint === "dist" || hint === "docs") {
    base = join(base, hint);
  }
  await ensureDir(targetDir);
  await copy(base, targetDir, { overwrite: true });
  try {
    await Deno.remove(tmpArchive);
  } catch {
  }
  try {
    await Deno.remove(extractRoot, { recursive: true });
  } catch {
  }
}

export async function downloadFromGithub(repo: string, branch: string): Promise<Uint8Array> {
  const m = String(repo).match(/github.com\/(.+?)\/(.+?)(?:\.git)?$/);
  if (!m) throw new Error("invalid repo url");
  const owner = m[1];
  const repoName = m[2];
  const useBranch = branch || "main";
  const zipUrl = `https://codeload.github.com/${owner}/${repoName}/zip/refs/heads/${useBranch}`;
  const resp = await fetch(zipUrl);
  if (!resp.ok) throw new Error("download failed");
  return new Uint8Array(await resp.arrayBuffer());
}

export async function downloadFromUrl(url: string): Promise<Uint8Array> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("download failed");
  return new Uint8Array(await resp.arrayBuffer());
}

export function isCompiled(): boolean {
  const base = basename(Deno.execPath()).toLowerCase();
  return base !== "deno" && base !== "deno.exe";
}
