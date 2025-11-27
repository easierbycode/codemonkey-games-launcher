import { Handlers } from "$fresh/server.ts";
import { downloadFromUrl, extractArchiveToDir, GAMES_DIR, SourceInfo } from "../../../lib/utils.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

export const handler: Handlers = {
  async POST(req, _ctx) {
    try {
      const { url: gameUrl, subdir, name } = await req.json();
      if (!gameUrl) return new Response("url required", { status: 400 });
      const zipBytes = await downloadFromUrl(gameUrl);
      const gameName = name ||
        new URL(gameUrl).pathname.split("/").pop()?.replace(/\.(zip|dmg|pkg)$/, "") || "game";
      const archiveName = new URL(gameUrl).pathname.split("/").pop() || "archive.zip";
      const id = gameName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const target = join(GAMES_DIR, id);
      await ensureDir(target);
      await extractArchiveToDir(zipBytes, archiveName, target, subdir || "root");

      const sourceInfo: SourceInfo = { source: "url", url: gameUrl, subdir: subdir || "root" };
      const metadataPath = join(target, "codemonkey.json");
      let metadata: Record<string, unknown> = {};
      try {
        const existing = await Deno.readTextFile(metadataPath);
        metadata = JSON.parse(existing);
      } catch {
        metadata = {};
      }
      metadata.sourceInfo = sourceInfo;
      await Deno.writeTextFile(metadataPath, JSON.stringify(metadata, null, 2));

      // After adding, notify the UI to refresh. This is a bit of a hack for desktop.
      // In a real webapp, we'd use websockets or SSE.
      try {
        const { webview } = await import("npm:@webview/webview@0.7.7");
        if (webview) {
          webview.eval(`window.dispatchEvent(new CustomEvent('games-updated'))`);
        }
      } catch (e) {
        console.warn("Could not dispatch games-updated event:", e);
      }

      return Response.json({ ok: true, id });
    } catch (e) {
      console.error("API route error:", e);
      const msg = e instanceof Error ? e.message : "Internal Server Error";
      return Response.json({ ok: false, error: msg }, { status: 500 });
    }
  },
};
