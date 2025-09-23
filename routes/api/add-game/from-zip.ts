import { Handlers } from "$fresh/server.ts";
import {
  extractArchiveToDir,
  GAMES_DIR,
  SourceInfo,
} from "../../../lib/utils.ts";
import { ensureDir } from "https://deno.land/std@0.216.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.216.0/path/mod.ts";

export const handler: Handlers = {
  async POST(req, _ctx) {
    try {
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

      const sourceInfo: SourceInfo = { source: "zip" };
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
