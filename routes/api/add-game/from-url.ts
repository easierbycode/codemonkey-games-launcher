import { Handlers } from "$fresh/server.ts";
import {
  downloadFromUrl,
  extractArchiveToDir,
  GAMES_DIR,
  SourceInfo,
} from "../../../lib/utils.ts";
import { ensureDir } from "https://deno.land/std@0.216.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.216.0/path/mod.ts";

export const handler: Handlers = {
  async POST(req, _ctx) {
    try {
      const { url: gameUrl, subdir, name } = await req.json();
      if (!gameUrl) return new Response("url required", { status: 400 });
      const zipBytes = await downloadFromUrl(gameUrl);
      const gameName = name || new URL(gameUrl).pathname.split('/').pop()?.replace(/\.(zip|dmg|pkg)$/, '') || 'game';
      const archiveName = new URL(gameUrl).pathname.split('/').pop() || 'archive.zip';
      const id = gameName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const target = join(GAMES_DIR, id);
      await ensureDir(target);
      await extractArchiveToDir(zipBytes, archiveName, target, subdir || "root");

      const sourceInfo: SourceInfo = { source: "url", url: gameUrl, subdir: subdir || "root" };
      const metadataPath = join(target, "codemonkey.json");
      await Deno.writeTextFile(metadataPath, JSON.stringify(sourceInfo, null, 2));

      return Response.json({ ok: true, id });
    } catch (e) {
      console.error("API route error:", e);
      const msg = e instanceof Error ? e.message : "Internal Server Error";
      return Response.json({ ok: false, error: msg }, { status: 500 });
    }
  },
};
