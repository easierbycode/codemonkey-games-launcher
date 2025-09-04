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

type GameEntry = {
  id: string;
  name: string;
  path: string; // local filesystem path
  urlPath: string; // public URL path e.g., /games/<id>/
  hasThumbnail: boolean;
};

async function listGames(): Promise<GameEntry[]> {
  const entries: GameEntry[] = [];
  for await (const dirEntry of Deno.readDir(GAMES_DIR)) {
    if (!dirEntry.isDirectory) continue;
    const id = dirEntry.name;
    const fsPath = join(GAMES_DIR, id);
    const thumbnailPath = join(fsPath, "thumbnail.png");
    let hasThumbnail = false;
    try {
      const stat = await Deno.stat(thumbnailPath);
      hasThumbnail = stat.isFile;
    } catch (_) {
      hasThumbnail = false;
    }
    // Choose a display name from folder name
    const name = id.replace(/[-_]/g, " ");
    entries.push({
      id,
      name,
      path: fsPath,
      urlPath: `/games/${id}/`,
      hasThumbnail,
    });
  }
  // stable sort
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

async function saveZipToDir(zipBytes: Uint8Array, targetDir: string, subdirHint?: string) {
  await ensureDir(targetDir);
  const tmpZip = await Deno.makeTempFile({ suffix: ".zip" });
  await Deno.writeFile(tmpZip, zipBytes);
  const extractRoot = await Deno.makeTempDir();
  let extracted = false;
  // Try system 'unzip'
  try {
    const unzip = new Deno.Command("unzip", {
      args: ["-q", "-o", tmpZip, "-d", extractRoot],
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
        args: ["-x", "-k", tmpZip, extractRoot],
        stderr: "inherit",
        stdout: "inherit",
      });
      const { success } = await ditto.output();
      extracted = !!success;
    } catch (_) { /* ignore */ }
  }
  if (!extracted) {
    throw new Error("Failed to extract zip: no system unzip available. Install 'unzip' (Linux) or rely on 'ditto' (macOS).\nTried: unzip, ditto");
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
  try { await Deno.remove(tmpZip); } catch {}
  try { await Deno.remove(extractRoot, { recursive: true }); } catch {}
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
    await saveZipToDir(bytes, target, subdir);
    return json({ ok: true, id });
  }
  if (url.pathname === "/api/add-game/from-github" && req.method === "POST") {
    const { repo, branch, subdir, name } = await req.json();
    if (!repo) return new Response("repo required", { status: 400 });
    const m = String(repo).match(/github.com\/(.+?)\/(.+?)(?:\.git)?$/);
    if (!m) return new Response("invalid repo url", { status: 400 });
    const owner = m[1];
    const repoName = m[2];
    const useBranch = branch || "main";
    const zipUrl = `https://codeload.github.com/${owner}/${repoName}/zip/refs/heads/${useBranch}`;
    const resp = await fetch(zipUrl);
    if (!resp.ok) return new Response("download failed", { status: 502 });
    const zipBytes = new Uint8Array(await resp.arrayBuffer());
    const id = (name || repoName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const target = join(GAMES_DIR, id);
    await ensureDir(target);
    await saveZipToDir(zipBytes, target, subdir || "root");
    return json({ ok: true, id });
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
  if (Deno.build.os !== "windows") return; // only implement Windows for now
  const found = await findWinBrowser();
  if (!found) {
    // As a last resort, open default browser (no kiosk flags)
    try { new Deno.Command("cmd.exe", { args: ["/c", "start", "", url], stdin: "null", stdout: "null", stderr: "null" }).spawn(); } catch {}
    return;
  }
  const { path, kind } = found;
  const args: string[] = [];
  const disableExt = (Deno.env.get("CMG_DISABLE_EXTENSIONS") ?? "1") !== "0";
  let userDataDir = Deno.env.get("CMG_BROWSER_DATA_DIR");
  if (disableExt && !userDataDir) {
    try { userDataDir = await Deno.makeTempDir({ prefix: "cmg-profile-" }); } catch {}
  }
  if (kind === "chrome") {
    args.push(`--app=${url}`);
    args.push("--kiosk");
    args.push("--start-fullscreen");
    args.push("--no-first-run", "--no-default-browser-check", "--disable-translate");
    if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);
    // Strongly isolate by running as Guest when disabling extensions
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
}

const PORT = Number(Deno.env.get("PORT") ?? "8000");

const handler = async (req: Request) => {
  const url = new URL(req.url);

  // API routes
  const apiRes = await handleApi(req);
  if (apiRes) return apiRes;

  // Serve games directory at /games/ manually for predictable behavior
  if (url.pathname.startsWith("/games/")) {
    const rel = decodeURIComponent(url.pathname.replace(/^\/games\//, ""));
    const filePath = rel.endsWith("/") || rel === "" ? join(GAMES_DIR, rel, "index.html") : join(GAMES_DIR, rel);
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
        url.pathname.endsWith("/")
      );
      // Inject early OSD key listener, localStorage fix, and overflow hidden CSS into index.html pages
      if (isIndex) {
        try {
          const html = new TextDecoder().decode(data);
          const cssInjection = `\n<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;} canvas{display:block;} ::-webkit-scrollbar{display:none}</style>\n`;
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
          const injected = cssInjection + localStorageInjection + disableContextMenuInjection + osdInjection;
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

  // Serve frontend
  if (rewriteToIndex(url.pathname)) {
    const indexFile = await Deno.readFile(join(ROOT, "static", "index.html"));
    return new Response(indexFile, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (url.pathname.startsWith("/static") || url.pathname.startsWith("/assets") || url.pathname.startsWith("/vendor")) {
    return serveDir(req, { fsRoot: ROOT, quiet: true });
  }

  // Default to index.html for SPA routing (unknown routes)
  const indexFile = await Deno.readFile(join(ROOT, "static", "index.html"));
  return new Response(indexFile, { headers: { "content-type": "text/html; charset=utf-8" } });
};

Deno.serve({ port: PORT }, handler);

// Auto-launch kiosk browser when running the compiled Windows binary
if (isCompiled() && Deno.build.os === "windows" && (Deno.env.get("CMG_AUTO_KIOSK") ?? "1") !== "0") {
  // Small delay to ensure server is ready
  (async () => {
    try { await new Promise((r) => setTimeout(r, 300)); } catch {}
    await launchKiosk(`http://localhost:${PORT}`);
  })();
}
