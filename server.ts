// --- Protocol Handler Logic ---
// Check if the app was launched with a custom protocol URL
if (Deno.args.length > 0 && Deno.args[0].startsWith("codemonkey://")) {
  try {
    const url = new URL(Deno.args[0]);
    const repo = url.searchParams.get("repo");
    const branch = url.searchParams.get("branch");
    const subdir = url.searchParams.get("folder"); // 'folder' from extension, 'subdir' for API

    if (repo) {
      console.log(`Adding game from GitHub: ${repo}`);

      // Function to wait for the server to be ready
      const waitForServer = async (retries = 5, delay = 500) => {
        for (let i = 0; i < retries; i++) {
          try {
            const resp = await fetch("http://localhost:8000/api/games");
            if (resp.ok) {
              console.log("Server is up.");
              return true;
            }
          } catch {
            // Ignore connection errors
          }
          console.log(`Server not ready, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        return false;
      };

      let serverIsUp = await waitForServer(1, 100); // Quick initial check

      if (!serverIsUp) {
        console.log("Server not detected. Launching in background...");
        const args = isCompiled() ? [] : ["run", "-A", "server.ts"];
        new Deno.Command(Deno.execPath(), {
          args,
        }).spawn();
        serverIsUp = await waitForServer(5, 1000); // Wait longer after launch
      }

      if (!serverIsUp) {
        throw new Error("Server did not start in time. Cannot add game.");
      }

      const addResp = await fetch("http://localhost:8000/api/add-game/from-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, branch, subdir }),
      });

      if (addResp.ok) {
        console.log("Successfully added game via API.");
      } else {
        console.error("Failed to add game via API:", await addResp.text());
      }
    }
  } catch (error) {
    console.error("Failed to handle protocol URL:", error);
  }
  Deno.exit();
}
// --- End Protocol Handler Logic ---

// Deno web app server for launching Phaser/Kaplay games
// Serves static frontend and manages game library under ./games

import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { copy } from "https://deno.land/std@0.224.0/fs/copy.ts";
import { join, fromFileUrl, dirname, basename } from "https://deno.land/std@0.224.0/path/mod.ts";
import { contentType } from "https://deno.land/std@0.224.0/media_types/mod.ts";

// Determine an on-disk application root:
// - In dev (deno run), use the directory of this source file
// - In compiled mode (deno compile), use the directory of the executable
function getAppRoot(): string {
  const exeBase = basename(Deno.execPath()).toLowerCase();
  const isDenoCli = exeBase === "deno" || exeBase === "deno.exe";
  if (isDenoCli) {
    return fromFileUrl(new URL(".", import.meta.url));
  }
  // Compiled binary: place assets next to the exe
  return dirname(Deno.execPath());
}

const ROOT = getAppRoot();
const GAMES_DIR = Deno.env.get("CMG_GAMES_DIR") ?? join(ROOT, "games");
await ensureDir(GAMES_DIR);

type SourceInfo = {
  source: "github" | "url" | "zip";
  repo?: string;
  branch?: string;
  url?: string;
  subdir?: string;
};

type GameEntry = {
  id: string;
  name: string;
  path: string; // local filesystem path
  urlPath: string; // public URL path e.g., /games/<id>/
  hasThumbnail: boolean;
  sourceInfo?: SourceInfo;
};

async function listGames(): Promise<GameEntry[]> {
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

    let sourceInfo: SourceInfo | undefined = undefined;
    try {
      const metaContent = await Deno.readTextFile(metadataPath);
      sourceInfo = JSON.parse(metaContent);
    } catch (_) {
      // Ignore if metadata doesn't exist or is invalid
    }

    // Choose a display name from folder name
    const name = id.replace(/[-_]/g, " ");
    entries.push({
      id,
      name,
      path: fsPath,
      urlPath: `/games/${id}/`,
      hasThumbnail,
      sourceInfo,
    });
  }
  // stable sort
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

async function extractArchiveToDir(
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

  // macOS: handle .dmg, .pkg
  if (Deno.build.os === "darwin") {
    if (name.endsWith(".dmg")) {
      // Mount DMG, find .app, copy it out
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
            // Find the .app directory
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

  // Handle .zip (all platforms)
  if (name.endsWith(".zip")) {
    // Try system 'unzip'
    try {
      const unzip = new Deno.Command("unzip", {
        args: ["-q", "-o", tmpArchive, "-d", extractRoot],
        stderr: "inherit",
        stdout: "inherit",
      });
      const { success } = await unzip.output();
      extracted = !!success;
    } catch (_) { /* ignore */ }
    // On macOS, fallback to 'ditto'
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
    // On Windows, fallback to PowerShell Expand-Archive
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

  // Determine base directory inside extracted content
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

async function downloadFromGithub(repo: string, branch: string): Promise<Uint8Array> {
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

async function downloadFromUrl(url: string): Promise<Uint8Array> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("download failed");
  return new Uint8Array(await resp.arrayBuffer());
}

async function handleApi(req: Request): Promise<Response | undefined> {
  const json = (data: unknown, init: ResponseInit = {}) => {
    const headers = new Headers(init.headers || {});
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    try {
      // Use standard JSON response when available
      // deno-lint-ignore no-explicit-any
      const anyResp = Response as any;
      if (anyResp && typeof anyResp.json === "function") {
        return anyResp.json(data, { ...init, headers });
      }
    } catch {}
    return new Response(JSON.stringify(data), { ...init, headers });
  };
  const url = new URL(req.url);
  if (url.pathname === "/api/games" && req.method === "GET") {
    const games = await listGames();
    return json(games);
  }
  if (url.pathname === "/api/add-game/from-zip" && req.method === "POST") {
    const form = await req.formData();
    const file = form.get("file");
    const name = String(form.get("name") || "game");
    const subdir = String(form.get("subdir") || "root");
    if (!(file instanceof File)) return new Response("file required", { status: 400 });
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const target = join(GAMES_DIR, id);
    await ensureDir(target);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await extractArchiveToDir(bytes, file.name, target, subdir);

    // Write metadata
    const sourceInfo: SourceInfo = { source: "zip" };
    const metadataPath = join(target, "codemonkey.json");
    await Deno.writeTextFile(metadataPath, JSON.stringify(sourceInfo, null, 2));

    return json({ ok: true, id });
  }
  if (url.pathname === "/api/add-game/from-github" && req.method === "POST") {
    const { repo, branch, subdir, name } = await req.json();
    if (!repo) return new Response("repo required", { status: 400 });
    const repoName = String(repo).match(/github.com\/(.+?)\/(.+?)(?:\.git)?$/)?.[2] || 'game';
    const zipBytes = await downloadFromGithub(repo, branch || "main");
    const id = (name || repoName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const target = join(GAMES_DIR, id);
    await ensureDir(target);
    await extractArchiveToDir(zipBytes, `${repoName}.zip`, target, subdir || "root");

    // Write metadata
    const sourceInfo: SourceInfo = { source: "github", repo, branch: branch || "main", subdir: subdir || "root" };
    const metadataPath = join(target, "codemonkey.json");
    await Deno.writeTextFile(metadataPath, JSON.stringify(sourceInfo, null, 2));

    return json({ ok: true, id });
  }
  if (url.pathname === "/api/add-game/from-url" && req.method === "POST") {
    const { url: gameUrl, subdir, name } = await req.json();
    if (!gameUrl) return new Response("url required", { status: 400 });
    const zipBytes = await downloadFromUrl(gameUrl);
    const gameName = name || new URL(gameUrl).pathname.split('/').pop()?.replace(/\.(zip|dmg|pkg)$/, '') || 'game';
    const archiveName = new URL(gameUrl).pathname.split('/').pop() || 'archive.zip';
    const id = gameName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const target = join(GAMES_DIR, id);
    await ensureDir(target);
    await extractArchiveToDir(zipBytes, archiveName, target, subdir || "root");

    // Write metadata
    const sourceInfo: SourceInfo = { source: "url", url: gameUrl, subdir: subdir || "root" };
    const metadataPath = join(target, "codemonkey.json");
    await Deno.writeTextFile(metadataPath, JSON.stringify(sourceInfo, null, 2));

    return json({ ok: true, id });
  }
  if (url.pathname.startsWith("/api/games/") && url.pathname.endsWith("/update") && req.method === "POST") {
    const id = url.pathname.split("/")[3];
    const target = join(GAMES_DIR, id);

    try {
      const stat = await Deno.stat(target);
      if (!stat.isDirectory) throw new Error("Game directory not found");
    } catch {
      return new Response("Game not found", { status: 404 });
    }

    const metadataPath = join(target, "codemonkey.json");
    let sourceInfo: SourceInfo | undefined;
    try {
      const metaContent = await Deno.readTextFile(metadataPath);
      sourceInfo = JSON.parse(metaContent);
    } catch {
      return new Response("Game metadata not found or invalid", { status: 400 });
    }

    if (!sourceInfo || !sourceInfo.source || sourceInfo.source === 'zip') {
      return new Response("Game is not updatable", { status: 400 });
    }

    try {
      let zipBytes: Uint8Array;
      if (sourceInfo.source === 'github' && sourceInfo.repo) {
        zipBytes = await downloadFromGithub(sourceInfo.repo, sourceInfo.branch || 'main');
      } else if (sourceInfo.source === 'url' && sourceInfo.url) {
        zipBytes = await downloadFromUrl(sourceInfo.url);
      } else {
        return new Response("Invalid source info in metadata", { status: 400 });
      }

      const archiveName = sourceInfo.source === 'github'
        ? `${sourceInfo.repo?.split('/').pop()}.zip`
        : new URL(sourceInfo.url || '').pathname.split('/').pop() || 'archive.zip';
      await extractArchiveToDir(zipBytes, archiveName, target, sourceInfo.subdir);
      return json({ ok: true, id });

    } catch (err) {
      console.error(`Update failed for game ${id}:`, err);
      return new Response(`Update failed: ${err.message}`, { status: 500 });
    }
  }
  if (url.pathname.startsWith("/api/games/") && url.pathname.endsWith("/thumbnail") && req.method === "POST") {
    const id = url.pathname.split("/")[3];
    const target = join(GAMES_DIR, id);
    try {
      const stat = await Deno.stat(target);
      if (!stat.isDirectory) throw new Error("not dir");
    } catch {
      return new Response("not found", { status: 404 });
    }
    const body = await req.arrayBuffer();
    const bytes = new Uint8Array(body);
    await Deno.writeFile(join(target, "thumbnail.png"), bytes);
    return json({ ok: true });
  }
  if (url.pathname.startsWith("/api/games/") && req.method === "DELETE") {
    const id = url.pathname.split("/")[3];
    const target = join(GAMES_DIR, id);
    try {
      const stat = await Deno.stat(target);
      if (!stat.isDirectory) throw new Error("not dir");
    } catch {
      return new Response("not found", { status: 404 });
    }
    // Remove the game directory
    await Deno.remove(target, { recursive: true });
    return json({ ok: true });
  }
  if (url.pathname === "/api/heartbeat" && req.method === "POST") {
    // This is the heartbeat endpoint, part of the mechanism to ensure the app closes
    // when the browser window is closed.
    // deno-lint-ignore no-explicit-any
    if ((globalThis as any).lastHeartbeat) {
      // deno-lint-ignore no-explicit-any
      (globalThis as any).lastHeartbeat = Date.now();
    }
    return json({ ok: true });
  }
  return undefined;
}

function rewriteToIndex(pathname: string): boolean {
  return pathname === "/" || pathname === "/index.html";
}
// Simple platform helpers
function isCompiled(): boolean {
  const base = basename(Deno.execPath()).toLowerCase();
  return base !== "deno" && base !== "deno.exe";
}

async function pathExists(p: string): Promise<boolean> {
  try { await Deno.stat(p); return true; } catch { return false; }
}

async function findWinBrowser(): Promise<{ path: string; kind: "chrome" | "edge" } | null> {
  const env = (k: string) => Deno.env.get(k) ?? "";
  const candidates: { path: string; kind: "chrome" | "edge" }[] = [];
  const pf = env("PROGRAMFILES");
  const pfx86 = env("PROGRAMFILES(X86)");
  const lad = env("LOCALAPPDATA");
  if (lad) candidates.push({ path: join(lad, "Google", "Chrome", "Application", "chrome.exe"), kind: "chrome" });
  if (pf) candidates.push({ path: join(pf, "Google", "Chrome", "Application", "chrome.exe"), kind: "chrome" });
  if (pfx86) candidates.push({ path: join(pfx86, "Google", "Chrome", "Application", "chrome.exe"), kind: "chrome" });
  if (pf) candidates.push({ path: join(pf, "Microsoft", "Edge", "Application", "msedge.exe"), kind: "edge" });
  if (pfx86) candidates.push({ path: join(pfx86, "Microsoft", "Edge", "Application", "msedge.exe"), kind: "edge" });
  // Fallback to names in PATH
  candidates.push({ path: "chrome.exe", kind: "chrome" });
  candidates.push({ path: "msedge.exe", kind: "edge" });
  for (const c of candidates) {
    if (c.path.includes(".exe") && (c.path.includes("\\") || c.path.includes("/"))) {
      if (await pathExists(c.path)) return c;
    } else {
      // Rely on PATH for bare names
      try {
        const p = new Deno.Command(c.path, { args: ["--version"], stdout: "piped", stderr: "null" });
        const r = await p.output();
        if (r.success) return c;
      } catch { /* not found in PATH */ }
    }
  }
  return null;
}

async function launchKiosk(url: string): Promise<void> {
  const disableExt = (Deno.env.get("CMG_DISABLE_EXTENSIONS") ?? "1") !== "0";
  let userDataDir = Deno.env.get("CMG_BROWSER_DATA_DIR");
  if (disableExt && !userDataDir) {
    try { userDataDir = await Deno.makeTempDir({ prefix: "cmg-profile-" }); } catch {}
  }

  if (Deno.build.os === "windows") {
    const found = await findWinBrowser();
    if (!found) {
      // As a last resort, open default browser (no kiosk flags)
      try { new Deno.Command("cmd.exe", { args: ["/c", "start", "", url], stdin: "null", stdout: "null", stderr: "null" }).spawn(); } catch {}
      return;
    }
    const { path, kind } = found;
    const args: string[] = [];
    if (kind === "chrome") {
      args.push(`--app=${url}`);
      args.push("--kiosk");
      args.push("--start-fullscreen");
      args.push("--no-first-run", "--no-default-browser-check", "--disable-translate");
      if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);
      if (disableExt) {
        args.push("--disable-extensions", "--disable-component-extensions-with-background-pages", "--guest");
      }
    } else {
      // Edge
      args.push("--kiosk", url, "--edge-kiosk-type=fullscreen", "--no-first-run", "--no-default-browser-check");
      if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);
      if (disableExt) {
        args.push("--disable-extensions", "--disable-component-extensions-with-background-pages", "--inprivate");
      }
    }
    try {
      new Deno.Command(path, { args, stdin: "null", stdout: "null", stderr: "null" }).spawn();
    } catch (e) {
      console.error("Failed to launch browser:", e);
    }
    return;
  }

  if (Deno.build.os === "darwin") {
    // Prefer using the app bundle via `open -a` for robustness
    const openArgs: string[] = ["-a", "Google Chrome", "--args", `--app=${url}`, "--kiosk", "--start-fullscreen", "--no-first-run", "--no-default-browser-check", "--disable-translate"];
    if (userDataDir) openArgs.push(`--user-data-dir=${userDataDir}`);
    if (disableExt) {
      openArgs.push("--disable-extensions", "--disable-component-extensions-with-background-pages", "--guest");
    }
    try {
      new Deno.Command("/usr/bin/open", { args: openArgs, stdin: "null", stdout: "null", stderr: "null" }).spawn();
      return;
    } catch (_) {
      // Fallback: try launching the binary directly if present
      const chromeBin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      const args: string[] = [`--app=${url}`, "--kiosk", "--start-fullscreen", "--no-first-run", "--no-default-browser-check", "--disable-translate"];
      if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);
      if (disableExt) args.push("--disable-extensions", "--disable-component-extensions-with-background-pages", "--guest");
      try {
        new Deno.Command(chromeBin, { args, stdin: "null", stdout: "null", stderr: "null" }).spawn();
        return;
      } catch (e) {
        console.error("Failed to launch Chrome on macOS:", e);
      }
    }
    // Last resort: open default browser (no kiosk flags)
    try { new Deno.Command("/usr/bin/open", { args: [url], stdin: "null", stdout: "null", stderr: "null" }).spawn(); } catch {}
    return;
  }
}

const PORT = Number(Deno.env.get("PORT") ?? "8000");

const handler = async (req: Request) => {
  const url = new URL(req.url);

  // API routes (robust error handling so client never sees empty response)
  try {
    const apiRes = await handleApi(req);
    if (apiRes) return apiRes;
  } catch (e) {
    try { console.error("API route error:", e); } catch {}
    const msg = (e && (e as Error).message) ? (e as Error).message : "Internal Server Error";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  // Allow top-level game aliases like /mario/* to resolve to /games/mario/*
  // This helps when bundled games reference absolute asset paths (e.g., "/mario/main.js")
  {
    const p = url.pathname;
    // Ignore known prefixes
    const ignored = ["api", "static", "assets", "vendor", "games"];
    if (p.startsWith("/") && p.length > 1) {
      const first = p.split("/")[1];
      if (first && !ignored.includes(first)) {
        const maybeDir = join(GAMES_DIR, first);
        try {
          const st = await Deno.stat(maybeDir);
          if (st.isDirectory) {
            const after = p.slice(("/" + first).length);
            const rel = decodeURIComponent(after.startsWith("/") ? after.slice(1) : after);
            const filePath = rel === "" || rel.endsWith("/") ? join(maybeDir, "index.html") : join(maybeDir, rel);
            try {
              let data: Uint8Array = await Deno.readFile(filePath);
              let headersCt = (() => {
                const fp = filePath.toLowerCase();
                if (fp.endsWith('.js') || fp.endsWith('.mjs')) return 'text/javascript';
                if (fp.endsWith('.css')) return 'text/css';
                if (fp.endsWith('.html')) return 'text/html; charset=utf-8';
                if (fp.endsWith('.png')) return 'image/png';
                if (fp.endsWith('.jpg') || fp.endsWith('.jpeg')) return 'image/jpeg';
                if (fp.endsWith('.gif')) return 'image/gif';
                if (fp.endsWith('.svg')) return 'image/svg+xml';
                return contentType(filePath) ?? 'application/octet-stream';
              })();
              const isIndex = (
                filePath.toLowerCase().endsWith("/index.html") ||
                filePath.toLowerCase().endsWith("\\index.html") ||
                url.pathname.endsWith("/index.html") ||
                url.pathname === "/" + first ||
                url.pathname === "/" + first + "/"
              );
              if (isIndex) {
                try {
                  const html = new TextDecoder().decode(data);
                  const cssInjection = `\n<style>
                    html,body{margin:0;padding:0;height:100%;overflow:hidden;}
                    canvas{display:block;}
                    ::-webkit-scrollbar{display:none}
                    /* Hide cursor by default inside all games */
                    html, body { cursor: none !important; }
                    /* When parent requests cursor visibility (e.g., Game OSD), allow it */
                    html.cmg-cursor-visible, body.cmg-cursor-visible, .cmg-cursor-visible * { cursor: auto !important; }
                  </style>\n`;
                  const osdInjection = `\n<script>(function(){
                    function shouldOpen(e){return (e.code==='Backquote'||e.keyCode===192||e.which===192);} 
                    function onKey(e){ if(shouldOpen(e)){ try{ parent.postMessage({cmg:'osd',action:'open'}, location.origin); }catch(_){} if(e.preventDefault) e.preventDefault(); if(e.stopPropagation) e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation(); }
                      var k=e.key||e.code; if(k==='Escape'){ try{ parent.postMessage({cmg:'osd',action:'exit'}, location.origin); }catch(_){}} }
                    try{ document.addEventListener('keydown', onKey, true); window.addEventListener('keydown', onKey, true);}catch(_){}}
                  )();</script>\n`;
                  const disableContextMenuInjection = `\n<script>(function(){
                    try{
                      var handler=function(e){ if(e && e.preventDefault) e.preventDefault(); if(e && e.stopPropagation) e.stopPropagation(); if(e && e.stopImmediatePropagation) e.stopImmediatePropagation(); return false; };
                      window.addEventListener('contextmenu', handler, true);
                      document.addEventListener('contextmenu', handler, true);
                    }catch(_){/* ignore */}
                  })();</script>\n`;
                  const localStorageInjection = `\n<script>(function(){
                    // Fix localStorage issues in iframe context
                    var originalJSONParse = JSON.parse;
                    JSON.parse = function(text) {
                      if (text === undefined || text === null || text === 'undefined') {
                        return null;
                      }
                      return originalJSONParse.call(this, text);
                    };
                    // Ensure localStorage works in iframe
                    if (window.parent !== window && !window.localStorage) {
                      window.localStorage = {
                        data: {},
                        getItem: function(key) { return this.data[key] || null; },
                        setItem: function(key, value) { this.data[key] = String(value); },
                        removeItem: function(key) { delete this.data[key]; },
                        clear: function() { this.data = {}; },
                        get length() { return Object.keys(this.data).length; },
                        key: function(index) { return Object.keys(this.data)[index] || null; }
                      };
                      for (let i = 0; i < Object.keys(window.localStorage.data).length; i++) {
                        let key = Object.keys(window.localStorage.data)[i];
                        Object.defineProperty(window.localStorage, key, {
                          get: function() { return this.getItem(key); },
                          set: function(value) { this.setItem(key, value); },
                          configurable: true
                        });
                      }
                    }
                  })();</script>\n`;
                  const cursorToggleInjection = `\n<script>(function(){
                    try {
                      function setCursorVisible(v){
                        try{
                          var root=document.documentElement; var body=document.body;
                          if(v){ root && root.classList.add('cmg-cursor-visible'); body && body.classList.add('cmg-cursor-visible'); }
                          else { root && root.classList.remove('cmg-cursor-visible'); body && body.classList.remove('cmg-cursor-visible'); }
                        }catch(_){}
                      }
                      // Default hidden
                      setCursorVisible(false);
                      // Listen for parent messages to toggle cursor visibility
                      window.addEventListener('message', function(ev){
                        try{
                          if(!ev || !ev.data) return;
                          var msg = ev.data;
                          if (msg && msg.cmg === 'cursor') {
                            setCursorVisible(!!msg.visible);
                          }
                        }catch(_){/*ignore*/}
                      }, true);
                    } catch(_){/* ignore */}
                  })();</script>\n`;
                  const injected = cssInjection + localStorageInjection + cursorToggleInjection + disableContextMenuInjection + osdInjection;
                  let out = html;
                  if (/<head[^>]*>/i.test(html)) {
                    out = html.replace(/<head[^>]*>/i, (m) => m + injected);
                  } else if (/^<!doctype[^>]*>/i.test(html)) {
                    out = html.replace(/^<!doctype[^>]*>/i, (m) => m + injected);
                  } else if (/<html[^>]*>/i.test(html)) {
                    out = html.replace(/<html[^>]*>/i, (m) => m + injected);
                  } else {
                    out = injected + html; // Fallback
                  }
                  data = new TextEncoder().encode(out) as Uint8Array;
                  headersCt = 'text/html; charset=utf-8';
                } catch {}
              }
              return new Response(data, { headers: { "content-type": headersCt } });
            } catch (_) {
              return new Response("Not Found", { status: 404 });
            }
          }
        } catch {
          // Not a game alias; continue
        }
      }
    }
  }

  // Serve games directory at /games/ with path clamping and Referer-based resolution
  if (url.pathname.startsWith("/games/")) {
    const relRaw = decodeURIComponent(url.pathname.replace(/^\/games\//, ""));

    // Sanitize a relative path, preventing traversal above base
    const safeRel = (p: string): string => {
      const parts = p.split("/");
      const out: string[] = [];
      for (const part of parts) {
        if (!part || part === ".") continue;
        if (part === "..") { if (out.length) out.pop(); continue; }
        out.push(part);
      }
      return out.join("/");
    };

    // Try to extract a gameId from the Referer header
    const ref = (req.headers.get("referer") || req.headers.get("referrer") || "").toString();
    const refGameId = await (async () => {
      if (!ref) return null as string | null;
      try {
        const ru = new URL(ref);
        const rp = ru.pathname || "";
        if (rp.startsWith("/games/")) {
          const seg = rp.split("/")[2];
          if (seg) return seg;
        } else if (/^\/[A-Za-z0-9_-]+\/?/.test(rp)) {
          const seg = rp.split("/")[1];
          try {
            const st = await Deno.stat(join(GAMES_DIR, seg));
            if (st.isDirectory) return seg;
          } catch {}
        }
      } catch {}
      return null as string | null;
    })();

    // Resolve target path:
    // 1) If first path segment is a valid game id, serve from it and clamp traversal
    // 2) Else, if Referer points to a game, treat rel as inside that game's root (e.g., /games/assets/* -> /games/<id>/assets/*)
    // 3) Fallback to legacy behavior
    const segs = relRaw.split("/").filter(Boolean);
    const first = segs[0] || "";
    let filePath: string;
    let isFromGameRoot = false;
    try {
      if (first) {
        try {
          const st = await Deno.stat(join(GAMES_DIR, first));
          if (st.isDirectory) {
            // Case 1: explicit /games/<gameId>/...
            const rest = safeRel(segs.slice(1).join("/"));
            const base = join(GAMES_DIR, first);
            filePath = (relRaw.endsWith("/") || rest === "") ? join(base, "index.html") : join(base, rest);
            isFromGameRoot = true;
          } else {
            throw new Error("not a dir");
          }
        } catch {
          if (refGameId) {
            // Case 2: Referer-based resolution (e.g., /games/assets/*)
            const rest = safeRel(relRaw);
            const base = join(GAMES_DIR, refGameId);
            filePath = (relRaw.endsWith("/") || rest === "") ? join(base, "index.html") : join(base, rest);
            isFromGameRoot = true;
          } else {
            // Case 3: Fallback
            filePath = (relRaw.endsWith("/") || relRaw === "") ? join(GAMES_DIR, relRaw, "index.html") : join(GAMES_DIR, relRaw);
          }
        }
      } else {
        if (refGameId) {
          const base = join(GAMES_DIR, refGameId);
          filePath = join(base, "index.html");
          isFromGameRoot = true;
        } else {
          filePath = join(GAMES_DIR, "index.html");
        }
      }
    } catch {
      // Ultimate fallback
      filePath = (relRaw.endsWith("/") || relRaw === "") ? join(GAMES_DIR, relRaw, "index.html") : join(GAMES_DIR, relRaw);
    }

    try {
      let data: Uint8Array = await Deno.readFile(filePath);
      let headersCt = (() => {
        const p = filePath.toLowerCase();
        if (p.endsWith('.js') || p.endsWith('.mjs')) return 'text/javascript';
        if (p.endsWith('.css')) return 'text/css';
        if (p.endsWith('.html')) return 'text/html; charset=utf-8';
        if (p.endsWith('.png')) return 'image/png';
        if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
        if (p.endsWith('.gif')) return 'image/gif';
        if (p.endsWith('.svg')) return 'image/svg+xml';
        return contentType(filePath) ?? 'application/octet-stream';
      })();
      // Inject helpers into game index pages across platforms (Windows paths use \\)
      const isIndex = (
        filePath.toLowerCase().endsWith("/index.html") ||
        filePath.toLowerCase().endsWith("\\index.html") ||
        url.pathname.endsWith("/index.html") ||
        (isFromGameRoot && url.pathname.endsWith("/"))
      );
      // Inject early OSD key listener, localStorage fix, and overflow hidden CSS into index.html pages
      if (isIndex) {
        try {
          const html = new TextDecoder().decode(data);
          const cssInjection = `\n<style>
            html,body{margin:0;padding:0;height:100%;overflow:hidden;}
            canvas{display:block;}
            ::-webkit-scrollbar{display:none}
            /* Hide cursor by default inside all games */
            html, body { cursor: none !important; }
            /* When parent requests cursor visibility (e.g., Game OSD), allow it */
            html.cmg-cursor-visible, body.cmg-cursor-visible, .cmg-cursor-visible * { cursor: auto !important; }
          </style>\n`;
          const osdInjection = `\n<script>(function(){
            function shouldOpen(e){return (e.code==='Backquote'||e.keyCode===192||e.which===192);} 
            function onKey(e){ if(shouldOpen(e)){ try{ parent.postMessage({cmg:'osd',action:'open'}, location.origin); }catch(_){} if(e.preventDefault) e.preventDefault(); if(e.stopPropagation) e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation(); }
              var k=e.key||e.code; if(k==='Escape'){ try{ parent.postMessage({cmg:'osd',action:'exit'}, location.origin); }catch(_){}} }
            try{ document.addEventListener('keydown', onKey, true); window.addEventListener('keydown', onKey, true);}catch(_){}}
          )();</script>\n`;
          const disableContextMenuInjection = `\n<script>(function(){
            try{
              var handler=function(e){ if(e && e.preventDefault) e.preventDefault(); if(e && e.stopPropagation) e.stopPropagation(); if(e && e.stopImmediatePropagation) e.stopImmediatePropagation(); return false; };
              window.addEventListener('contextmenu', handler, true);
              document.addEventListener('contextmenu', handler, true);
            }catch(_){/* ignore */}
          })();</script>\n`;
          const localStorageInjection = `\n<script>(function(){
            // Fix localStorage issues in iframe context
            var originalJSONParse = JSON.parse;
            JSON.parse = function(text) {
              if (text === undefined || text === null || text === 'undefined') {
                return null;
              }
              return originalJSONParse.call(this, text);
            };
            // Ensure localStorage works in iframe
            if (window.parent !== window && !window.localStorage) {
              window.localStorage = {
                data: {},
                getItem: function(key) { return this.data[key] || null; },
                setItem: function(key, value) { this.data[key] = String(value); },
                removeItem: function(key) { delete this.data[key]; },
                clear: function() { this.data = {}; },
                get length() { return Object.keys(this.data).length; },
                key: function(index) { return Object.keys(this.data)[index] || null; }
              };
              for (let i = 0; i < Object.keys(window.localStorage.data).length; i++) {
                let key = Object.keys(window.localStorage.data)[i];
                Object.defineProperty(window.localStorage, key, {
                  get: function() { return this.getItem(key); },
                  set: function(value) { this.setItem(key, value); },
                  configurable: true
                });
              }
            }
          })();</script>\n`;
          const cursorToggleInjection = `\n<script>(function(){
            try {
              function setCursorVisible(v){
                try{
                  var root=document.documentElement; var body=document.body;
                  if(v){ root && root.classList.add('cmg-cursor-visible'); body && body.classList.add('cmg-cursor-visible'); }
                  else { root && root.classList.remove('cmg-cursor-visible'); body && body.classList.remove('cmg-cursor-visible'); }
                }catch(_){}
              }
              // Default hidden
              setCursorVisible(false);
              // Listen for parent messages to toggle cursor visibility
              window.addEventListener('message', function(ev){
                try{
                  if(!ev || !ev.data) return;
                  var msg = ev.data;
                  if (msg && msg.cmg === 'cursor') {
                    setCursorVisible(!!msg.visible);
                  }
                }catch(_){/*ignore*/}
              }, true);
            } catch(_){/* ignore */}
          })();</script>\n`;
          const screenshotPreserveInjection = `\n<script>(function(){
            // Ensure WebGL canvases retain their drawing buffer for screenshots
            try {
              var origGetContext = HTMLCanvasElement.prototype.getContext;
              HTMLCanvasElement.prototype.getContext = function(type, attrs){
                try{
                  if (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2') {
                    attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
                  }
                }catch(_){/* ignore */}
                return origGetContext.call(this, type, attrs);
              };
            } catch(_){/* ignore */}
          })();</script>\n`;
          const markerInjection = `\n<script>(function(){
            try {
              window.__CMG_LAUNCHER__ = true;
              window.__CMG__ = Object.freeze({ launcher: true, name: 'codemonkey-games-launcher' });
              try { document.documentElement.setAttribute('data-cmg-launcher', '1'); } catch(_){/* ignore */}
              try { document.documentElement.classList.add('inLauncher'); } catch(_){/* ignore */}
              // Also mark body once available
              try {
                if (document.body) document.body.classList.add('inLauncher');
                else document.addEventListener('DOMContentLoaded', function(){ try{ document.body && document.body.classList.add('inLauncher'); }catch(_){/*ignore*/} }, { once: true });
              } catch(_){/* ignore */}
            } catch(_){/* ignore */}
          })();</script>\n`;
          const gamepadBlockInjection = `\n<script>(function(){
            try {
              var __cmg_input_blocked = false;
              window.addEventListener('message', function(ev){
                try{
                  if(!ev || !ev.data) return;
                  var msg = ev.data;
                  if (msg && msg.cmg === 'input') { __cmg_input_blocked = !!msg.blocked; }
                }catch(_){/*ignore*/}
              }, true);
              function clonePad(p){
                if (!p) return p;
                var btns = Array.from(p.buttons || []).map(function(){ return { pressed:false, touched:false, value:0 }; });
                var axes = Array.from(p.axes || []).map(function(){ return 0; });
                try {
                  return new Proxy(p, {
                    get: function(target, prop){
                      if (prop === 'buttons') return btns;
                      if (prop === 'axes') return axes;
                      if (prop === 'connected') return target.connected;
                      return target[prop];
                    }
                  });
                } catch(_) {
                  return { id:p.id, index:p.index, mapping:p.mapping, connected:p.connected, timestamp:p.timestamp, buttons:btns, axes:axes };
                }
              }
              var origGet = (Navigator.prototype && Navigator.prototype.getGamepads) || (navigator && navigator.getGamepads);
              if (origGet) {
                var wrapped = function(){
                  var r = origGet.call(navigator) || [];
                  if (!__cmg_input_blocked) return r;
                  try { return Array.from(r).map(clonePad); } catch(_) { return r; }
                };
                try { Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable:true, writable:true, value: wrapped }); } catch(_){/* ignore */}
                try { navigator.getGamepads = wrapped; } catch(_){/* ignore */}
              }
            } catch(_){/* ignore */}
          })();</script>\n`;
          const injected = cssInjection + localStorageInjection + cursorToggleInjection + disableContextMenuInjection + osdInjection + screenshotPreserveInjection + markerInjection + gamepadBlockInjection;
          let out = html;
          // Prefer injecting inside <head> when possible to avoid breaking DOCTYPE
          if (/<head[^>]*>/i.test(html)) {
            out = html.replace(/<head[^>]*>/i, (m) => m + injected);
          } else if (/^<!doctype[^>]*>/i.test(html)) {
            out = html.replace(/^<!doctype[^>]*>/i, (m) => m + injected);
          } else if (/<html[^>]*>/i.test(html)) {
            out = html.replace(/<html[^>]*>/i, (m) => m + injected);
          } else {
            out = injected + html; // Fallback
          }
          data = new TextEncoder().encode(out) as Uint8Array;
          headersCt = 'text/html; charset=utf-8';
        } catch {}
      }
      return new Response(data, { headers: { "content-type": headersCt } });
    } catch (_) {
      return new Response("Not Found", { status: 404 });
    }
  }

  // Friendly alias: serve /<gameId>/... as /games/<gameId>/...
  // Some games reference absolute paths like "/mario/..." from their index.html.
  // Detect when the first segment matches an installed game folder and serve it.
  {
    const segs = url.pathname.replace(/^\/+/, "").split("/");
    const first = segs[0] || "";
    // Skip known app namespaces
    const reserved = new Set(["", "static", "assets", "vendor", "api", "games"]);
    if (!reserved.has(first)) {
      try {
        const candidateDir = join(GAMES_DIR, first);
        const st = await Deno.stat(candidateDir);
        if (st && st.isDirectory) {
          const rel = segs.slice(1).join("/");
          const filePath = rel === "" || url.pathname.endsWith("/")
            ? join(candidateDir, "index.html")
            : join(candidateDir, rel);
          try {
            let data: Uint8Array = await Deno.readFile(filePath);
            let headersCt = (() => {
              const p = filePath.toLowerCase();
              if (p.endsWith('.js') || p.endsWith('.mjs')) return 'text/javascript';
              if (p.endsWith('.css')) return 'text/css';
              if (p.endsWith('.html')) return 'text/html; charset=utf-8';
              if (p.endsWith('.png')) return 'image/png';
              if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
              if (p.endsWith('.gif')) return 'image/gif';
              if (p.endsWith('.svg')) return 'image/svg+xml';
              return contentType(filePath) ?? 'application/octet-stream';
            })();
            // Inject helpers for index pages similar to /games/ handling
            const isIndex = (
              filePath.toLowerCase().endsWith("/index.html") ||
              filePath.toLowerCase().endsWith("\\index.html") ||
              url.pathname.endsWith("/index.html") ||
              url.pathname.endsWith("/")
            );
            if (isIndex) {
              try {
                const html = new TextDecoder().decode(data);
                const cssInjection = `\n<style>
                  html,body{margin:0;padding:0;height:100%;overflow:hidden;}
                  canvas{display:block;}
                  ::-webkit-scrollbar{display:none}
                  /* Hide cursor by default inside all games */
                  html, body { cursor: none !important; }
                  /* When parent requests cursor visibility (e.g., Game OSD), allow it */
                  html.cmg-cursor-visible, body.cmg-cursor-visible, .cmg-cursor-visible * { cursor: auto !important; }
                </style>\n`;
                const osdInjection = `\n<script>(function(){
                  function shouldOpen(e){return (e.code==='Backquote'||e.keyCode===192||e.which===192);} 
                  function onKey(e){ if(shouldOpen(e)){ try{ parent.postMessage({cmg:'osd',action:'open'}, location.origin); }catch(_){} if(e.preventDefault) e.preventDefault(); if(e.stopPropagation) e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation(); }
                    var k=e.key||e.code; if(k==='Escape'){ try{ parent.postMessage({cmg:'osd',action:'exit'}, location.origin); }catch(_){}} }
                  try{ document.addEventListener('keydown', onKey, true); window.addEventListener('keydown', onKey, true);}catch(_){}}
                )();</script>\n`;
                const disableContextMenuInjection = `\n<script>(function(){
                  try{
                    var handler=function(e){ if(e && e.preventDefault) e.preventDefault(); if(e && e.stopPropagation) e.stopPropagation(); if(e && e.stopImmediatePropagation) e.stopImmediatePropagation(); return false; };
                    window.addEventListener('contextmenu', handler, true);
                    document.addEventListener('contextmenu', handler, true);
                  }catch(_){/* ignore */}
                })();</script>\n`;
                const localStorageInjection = `\n<script>(function(){
                  // Fix localStorage issues in iframe context
                  var originalJSONParse = JSON.parse;
                  JSON.parse = function(text) {
                    if (text === undefined || text === null || text === 'undefined') {
                      return null;
                    }
                    return originalJSONParse.call(this, text);
                  };
                  // Ensure localStorage works in iframe
                  if (window.parent !== window && !window.localStorage) {
                    window.localStorage = {
                      data: {},
                      getItem: function(key) { return this.data[key] || null; },
                      setItem: function(key, value) { this.data[key] = String(value); },
                      removeItem: function(key) { delete this.data[key]; },
                      clear: function() { this.data = {}; },
                      get length() { return Object.keys(this.data).length; },
                      key: function(index) { return Object.keys(this.data)[index] || null; }
                    };
                    for (let i = 0; i < Object.keys(window.localStorage.data).length; i++) {
                      let key = Object.keys(window.localStorage.data)[i];
                      Object.defineProperty(window.localStorage, key, {
                        get: function() { return this.getItem(key); },
                        set: function(value) { this.setItem(key, value); },
                        configurable: true
                      });
                    }
                  }
                })();</script>\n`;
                const cursorToggleInjection = `\n<script>(function(){
                  try {
                    function setCursorVisible(v){
                      try{
                        var root=document.documentElement; var body=document.body;
                        if(v){ root && root.classList.add('cmg-cursor-visible'); body && body.classList.add('cmg-cursor-visible'); }
                        else { root && root.classList.remove('cmg-cursor-visible'); body && body.classList.remove('cmg-cursor-visible'); }
                      }catch(_){}
                    }
                    // Default hidden
                    setCursorVisible(false);
                    // Listen for parent messages to toggle cursor visibility
                    window.addEventListener('message', function(ev){
                      try{
                        if(!ev || !ev.data) return;
                        var msg = ev.data;
                        if (msg && msg.cmg === 'cursor') {
                          setCursorVisible(!!msg.visible);
                        }
                      }catch(_){/*ignore*/}
                    }, true);
                  } catch(_){/* ignore */}
                })();</script>\n`;
            const screenshotPreserveInjection = `\n<script>(function(){
                  // Ensure WebGL canvases retain their drawing buffer for screenshots
                  try {
                    var origGetContext = HTMLCanvasElement.prototype.getContext;
                    HTMLCanvasElement.prototype.getContext = function(type, attrs){
                      try{
                        if (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2') {
                          attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
                        }
                      }catch(_){/* ignore */}
                      return origGetContext.call(this, type, attrs);
                    };
                  } catch(_){/* ignore */}
                })();</script>\n`;
            const markerInjection = `\n<script>(function(){
                  try {
                    window.__CMG_LAUNCHER__ = true;
                    window.__CMG__ = Object.freeze({ launcher: true, name: 'codemonkey-games-launcher' });
                    try { document.documentElement.setAttribute('data-cmg-launcher', '1'); } catch(_){/* ignore */}
                    try { document.documentElement.classList.add('inLauncher'); } catch(_){/* ignore */}
                    try {
                      if (document.body) document.body.classList.add('inLauncher');
                      else document.addEventListener('DOMContentLoaded', function(){ try{ document.body && document.body.classList.add('inLauncher'); }catch(_){/*ignore*/} }, { once: true });
                    } catch(_){/* ignore */}
                  } catch(_){/* ignore */}
                })();</script>\n`;
            const gamepadBlockInjection = `\n<script>(function(){
                  try {
                    var __cmg_input_blocked = false;
                    window.addEventListener('message', function(ev){
                      try{
                        if(!ev || !ev.data) return;
                        var msg = ev.data;
                        if (msg && msg.cmg === 'input') { __cmg_input_blocked = !!msg.blocked; }
                      }catch(_){/*ignore*/}
                    }, true);
                    function clonePad(p){
                      if (!p) return p;
                      var btns = Array.from(p.buttons || []).map(function(){ return { pressed:false, touched:false, value:0 }; });
                      var axes = Array.from(p.axes || []).map(function(){ return 0; });
                      try {
                        return new Proxy(p, {
                          get: function(target, prop){
                            if (prop === 'buttons') return btns;
                            if (prop === 'axes') return axes;
                            if (prop === 'connected') return target.connected;
                            return target[prop];
                          }
                        });
                      } catch(_) {
                        return { id:p.id, index:p.index, mapping:p.mapping, connected:p.connected, timestamp:p.timestamp, buttons:btns, axes:axes };
                      }
                    }
                    var origGet = (Navigator.prototype && Navigator.prototype.getGamepads) || (navigator && navigator.getGamepads);
                    if (origGet) {
                      var wrapped = function(){
                        var r = origGet.call(navigator) || [];
                        if (!__cmg_input_blocked) return r;
                        try { return Array.from(r).map(clonePad); } catch(_) { return r; }
                      };
                      try { Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable:true, writable:true, value: wrapped }); } catch(_){/* ignore */}
                      try { navigator.getGamepads = wrapped; } catch(_){/* ignore */}
                    }
                  } catch(_){/* ignore */}
                })();</script>\n`;
            const injected = cssInjection + localStorageInjection + cursorToggleInjection + disableContextMenuInjection + osdInjection + screenshotPreserveInjection + markerInjection + gamepadBlockInjection;
                let out = html;
                // Prefer injecting inside <head> when possible to avoid breaking DOCTYPE
                if (/<head[^>]*>/i.test(html)) {
                  out = html.replace(/<head[^>]*>/i, (m) => m + injected);
                } else if (/^<!doctype[^>]*>/i.test(html)) {
                  out = html.replace(/^<!doctype[^>]*>/i, (m) => m + injected);
                } else if (/<html[^>]*>/i.test(html)) {
                  out = html.replace(/<html[^>]*>/i, (m) => m + injected);
                } else {
                  out = injected + html; // Fallback
                }
                data = new TextEncoder().encode(out) as Uint8Array;
                headersCt = 'text/html; charset=utf-8';
              } catch {}
            }
            return new Response(data, { headers: { "content-type": headersCt } });
          } catch (_) {
            return new Response("Not Found", { status: 404 });
          }
        }
      } catch { /* not a game folder; continue */ }
    }
  }

  // Serve frontend
  if (rewriteToIndex(url.pathname)) {
    const indexFile = await Deno.readFile(join(ROOT, "static", "index.html"));
    return new Response(indexFile, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (url.pathname.startsWith("/static") || url.pathname.startsWith("/assets") || url.pathname.startsWith("/vendor")) {
    return serveDir(req, { fsRoot: ROOT, quiet: true });
  }

  // Alias by Referer: handle apps built with absolute base paths different from game folder
  // Example: game installed as /games/ronagun but HTML references "/evil-invaders-svite/*".
  // If the Referer is a game page, strip the first segment and serve from that game's folder.
  {
    const p = url.pathname;
    if (p.startsWith("/") && p.length > 1) {
      const first = p.split("/")[1];
      const reserved = new Set(["", "static", "assets", "vendor", "api", "games"]);
      if (!reserved.has(first)) {
        const ref = req.headers.get("referer") || req.headers.get("referrer");
        if (ref) {
          try {
            const ru = new URL(ref);
            const rpath = ru.pathname || "";
            let gameId: string | null = null;
            if (rpath.startsWith("/games/")) {
              const seg = rpath.split("/")[2];
              if (seg) gameId = seg;
            } else if (/^\/[A-Za-z0-9_-]+\/?/.test(rpath)) {
              const seg = rpath.split("/")[1];
              // Only treat as game ID if folder exists
              try {
                const st = await Deno.stat(join(GAMES_DIR, seg));
                if (st.isDirectory) gameId = seg;
              } catch {}
            }
            if (gameId) {
              const rest = p.slice(("/" + first).length);
              const rel = rest.startsWith("/") ? rest.slice(1) : rest;
              const filePath = join(GAMES_DIR, gameId, rel);
              try {
                const data = await Deno.readFile(filePath);
                const ct = (() => {
                  const fp = filePath.toLowerCase();
                  if (fp.endsWith('.js') || fp.endsWith('.mjs')) return 'text/javascript';
                  if (fp.endsWith('.css')) return 'text/css';
                  if (fp.endsWith('.html')) return 'text/html; charset=utf-8';
                  if (fp.endsWith('.png')) return 'image/png';
                  if (fp.endsWith('.jpg') || fp.endsWith('.jpeg')) return 'image/jpeg';
                  if (fp.endsWith('.gif')) return 'image/gif';
                  if (fp.endsWith('.svg')) return 'image/svg+xml';
                  return contentType(filePath) ?? 'application/octet-stream';
                })();
                return new Response(data, { headers: { 'content-type': ct } });
              } catch { /* not found; continue */ }
            }
          } catch { /* ignore bad referer */ }
        }
      }
    }
  }

  // Default to index.html for SPA routing (unknown routes)
  const indexFile = await Deno.readFile(join(ROOT, "static", "index.html"));
  return new Response(indexFile, { headers: { "content-type": "text/html; charset=utf-8" } });
};

Deno.serve({ port: PORT }, handler);

// Auto-launch kiosk browser when running the compiled binary on supported OSes
if (isCompiled() && (Deno.build.os === "windows" || Deno.build.os === "darwin") && (Deno.env.get("CMG_AUTO_KIOSK") ?? "1") !== "0") {
  // In compiled mode, we use a heartbeat to detect when the browser window closes
  // deno-lint-ignore no-explicit-any
  (globalThis as any).lastHeartbeat = Date.now();
  const HEARTBEAT_CHECK_INTERVAL = 5000; // 5 seconds
  const HEARTBEAT_TIMEOUT = 10000; // 10 seconds

  const monitor = setInterval(() => {
    // deno-lint-ignore no-explicit-any
    const last = (globalThis as any).lastHeartbeat;
    if (Date.now() - last > HEARTBEAT_TIMEOUT) {
      console.log("Heartbeat timeout exceeded. App window likely closed. Exiting.");
      clearInterval(monitor);
      Deno.exit(0);
    }
  }, HEARTBEAT_CHECK_INTERVAL);

  // Small delay to ensure server is ready
  (async () => {
    try { await new Promise((r) => setTimeout(r, 300)); } catch {}
    await launchKiosk(`http://localhost:${PORT}`);
  })();
}
