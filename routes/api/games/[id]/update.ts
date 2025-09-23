import { Handlers } from "$fresh/server.ts";
import {
  downloadFromGithub,
  downloadFromUrl,
  extractArchiveToDir,
  GAMES_DIR,
  SourceInfo,
} from "../../../../lib/utils.ts";
import { join } from "https://deno.land/std@0.216.0/path/mod.ts";

export const handler: Handlers = {
  async POST(req, ctx) {
    try {
      const { id } = ctx.params;
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
      return Response.json({ ok: true, id });

    } catch (e) {
      console.error("API route error:", e);
      const msg = e instanceof Error ? e.message : "Internal Server Error";
      return Response.json({ ok: false, error: msg }, { status: 500 });
    }
  },
};
