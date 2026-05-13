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

export type GamepadButtonMapping = {
  keyboardKey?: string;
  keyCode?: number;
  gamepadButton?: number;
};

export type GamepadUseWASDMap = Record<string, boolean>;

// Groups (dpad, face, shoulder, special, etc.) -> button name -> mapping details
export type GamepadMapping = Record<string, Record<string, GamepadButtonMapping>>;

export type RecommendedButtonsContainer = {
  mapping: GamepadMapping;
  useWASD?: GamepadUseWASDMap;
  buttons?: RecommendedButton[];
};

export type RecommendedButtonsMetadata =
  | RecommendedButton[]
  | RecommendedButtonsContainer;

export type GameEntry = {
  id: string;
  name: string;
  path: string;
  urlPath: string;
  launchPath: string;
  hasThumbnail: boolean;
  sourceInfo?: SourceInfo;
  recommendedButtons?: RecommendedButtonsMetadata;
};

function normalizeSubdirHint(subdirHint?: string | null): string {
  const raw = (subdirHint ?? "root").trim();
  if (!raw || raw.toLowerCase() === "root") return "";
  const cleaned = raw.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const segments = cleaned.split("/").filter((seg) => seg && seg !== "." && seg !== "..");
  return segments.join("/");
}

function resolveLaunchSubdir(subdirHint?: string | null): string {
  const normalized = normalizeSubdirHint(subdirHint);
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  if (lower === "dist" || lower === "docs") return "";
  return normalized;
}

const DEFAULT_CONFIGS: Record<string, { recommendedButtons: RecommendedButton[] }> = {
  "monkey combat": {
    recommendedButtons: [
      { label: "Start", mapsTo: "start", elementId: "character-select" },
    ],
  },
};

const BUILTIN_GAMES: GameEntry[] = [
  {
    id: "game-genie",
    name: "game genie",
    path: "",
    urlPath: "/game-genie/",
    launchPath: "/game-genie/",
    hasThumbnail: false,
  },
];

export async function listGames(): Promise<GameEntry[]> {
  const entries: GameEntry[] = [];
  for await (const dirEntry of Deno.readDir(GAMES_DIR)) {
    if (!dirEntry.isDirectory) continue;
    const id = dirEntry.name;
    if (BUILTIN_GAMES.some((b) => b.id === id)) continue;
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

    const launchSubdir = resolveLaunchSubdir(metadata.sourceInfo?.subdir);

    entries.push({
      id,
      name,
      path: fsPath,
      urlPath: `/games/${id}/`,
      launchPath: `/games/${id}/${launchSubdir ? `${launchSubdir}/` : ""}`,
      hasThumbnail,
      sourceInfo: metadata.sourceInfo,
      recommendedButtons: metadata.recommendedButtons,
    });
  }
  entries.push(...BUILTIN_GAMES);
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
  const archiveSuffix = name.endsWith(".zip")
    ? ".zip"
    : name.endsWith(".dmg")
    ? ".dmg"
    : name.endsWith(".pkg")
    ? ".pkg"
    : "";
  // Some OS tools (e.g. Windows Expand-Archive) require the file extension to match the archive format.
  const tmpArchive = await Deno.makeTempFile({ suffix: archiveSuffix });
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
  const normalizedSubdir = normalizeSubdirHint(subdirHint);
  const lowerSubdir = normalizedSubdir.toLowerCase();
  if (lowerSubdir === "dist" || lowerSubdir === "docs") {
    base = join(base, normalizedSubdir);
  } else if (normalizedSubdir) {
    const candidate = join(base, normalizedSubdir);
    try {
      const info = await Deno.stat(candidate);
      if (!info.isDirectory) {
        console.warn(`Subdir '${normalizedSubdir}' is not a directory; using repo root.`);
      }
    } catch {
      console.warn(`Subdir '${normalizedSubdir}' not found in archive; using repo root.`);
    }
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

export function parseGithubRepo(repo: string): { owner: string; name: string } {
  const cleaned = String(repo).trim().replace(/^git\+/, "");

  // Try URL parsing first to robustly handle extra path segments (tree/branch/etc.).
  const looksLikeUrl = /^https?:\/\//i.test(cleaned) || cleaned.toLowerCase().startsWith("github.com/");
  if (looksLikeUrl) {
    try {
      const url = new URL(cleaned.startsWith("http") ? cleaned : `https://${cleaned}`);
      if (url.hostname.toLowerCase().includes("github.com")) {
        const [owner, name] = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
        if (owner && name && !owner.startsWith(":")) {
          return { owner, name: name.replace(/\.git$/, "") };
        }
      }
    } catch {
      // Fall through to regex parsing
    }
  }

  const match = cleaned.match(/github\.com[:/]+([^/]+)\/([^/]+)(?:\.git)?/i)
    || cleaned.match(/^([^/]+)\/([^/]+)(?:\.git)?$/);

  if (match?.[1] && match?.[2]) {
    return { owner: match[1], name: match[2].replace(/\.git$/, "") };
  }

  throw new Error("invalid repo url");
}

export async function downloadFromGithub(repo: string, branch: string): Promise<Uint8Array> {
  const { owner, name: repoName } = parseGithubRepo(repo);
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

export async function addGameFromGithub(options: {
  repo: string;
  branch?: string;
  subdir?: string;
  name?: string;
}): Promise<{ id: string }> {
  const { repo, branch, subdir, name } = options;
  if (!repo) throw new Error("repo required");

  const { name: repoName } = parseGithubRepo(repo);
  const zipBytes = await downloadFromGithub(repo, branch ?? "main");
  const id = ((name || repoName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || "game";
  const target = join(GAMES_DIR, id);
  await ensureDir(target);
  const normalizedSubdir = normalizeSubdirHint(subdir);
  const subdirForStorage = normalizedSubdir || "root";
  await extractArchiveToDir(zipBytes, `${repoName}.zip`, target, subdirForStorage);

  const sourceInfo: SourceInfo = { source: "github", repo, branch: branch ?? "main", subdir: subdirForStorage };
  const metadataPath = join(target, "codemonkey.json");
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(await Deno.readTextFile(metadataPath));
  } catch {
    metadata = {};
  }
  metadata.sourceInfo = sourceInfo;
  await Deno.writeTextFile(metadataPath, JSON.stringify(metadata, null, 2));

  return { id };
}

export function isCompiled(): boolean {
  const base = basename(Deno.execPath()).toLowerCase();
  return base !== "deno" && base !== "deno.exe";
}
