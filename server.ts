// Deno web app server for launching Phaser/Kaplay games
// Serves static frontend and manages game library under ./games

import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { copy } from "https://deno.land/std@0.224.0/fs/copy.ts";
import { join, fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";
import { contentType } from "https://deno.land/std@0.224.0/media_types/mod.ts";

const ROOT = fromFileUrl(new URL(".", import.meta.url));
const GAMES_DIR = join(ROOT, "games");
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
  try {
    const unzip = new Deno.Command("unzip", {
      args: ["-q", "-o", tmpZip, "-d", extractRoot],
      stderr: "inherit",
      stdout: "inherit",
    });
    const { success } = await unzip.output();
    if (!success) throw new Error("unzip failed");
  } catch (err) {
    throw new Error(`Failed to extract zip: ${err?.message || err}. Please install 'unzip'.`);
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
  const url = new URL(req.url);
  if (url.pathname === "/api/games" && req.method === "GET") {
    const games = await listGames();
    return Response.json(games);
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
    return Response.json({ ok: true, id });
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
    return Response.json({ ok: true, id });
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
    return Response.json({ ok: true });
  }
  return undefined;
}

function rewriteToIndex(pathname: string): boolean {
  return pathname === "/" || pathname === "/index.html";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // API routes
  const apiRes = await handleApi(req);
  if (apiRes) return apiRes;

  // Serve games directory at /games/ manually for predictable behavior
  if (url.pathname.startsWith("/games/")) {
    const rel = decodeURIComponent(url.pathname.replace(/^\/games\//, ""));
    const filePath = rel.endsWith("/") || rel === "" ? join(GAMES_DIR, rel, "index.html") : join(GAMES_DIR, rel);
    try {
      let data = await Deno.readFile(filePath);
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
      // Inject early OSD key listener into index.html pages to ensure priority
      if (filePath.toLowerCase().endsWith('/index.html')) {
        try {
          const html = new TextDecoder().decode(data);
          const injection = `\n<script>(function(){
            function shouldOpen(e){return (e.code==='Backquote'||e.keyCode===192||e.which===192);} 
            function onKey(e){ if(shouldOpen(e)){ try{ parent.postMessage({cmg:'osd',action:'open'}, location.origin); }catch(_){} if(e.preventDefault) e.preventDefault(); if(e.stopPropagation) e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation(); }
              var k=e.key||e.code; if(k==='Escape'){ try{ parent.postMessage({cmg:'osd',action:'exit'}, location.origin); }catch(_){}} }
            try{ document.addEventListener('keydown', onKey, true); window.addEventListener('keydown', onKey, true);}catch(_){}}
          )();</script>\n`;
          const out = injection + html; // Prepend to ensure first listener registered
          data = new TextEncoder().encode(out);
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
});
