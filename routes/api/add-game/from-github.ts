import { Handlers } from "jsr:@fresh/core@^2.1.1/compat";
import {
  downloadFromGithub,
  extractArchiveToDir,
  GAMES_DIR,
  SourceInfo,
} from "../../../lib/utils.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

export const handler: Handlers = {
  async POST(req, _ctx) {
    try {
      const { repo, branch, subdir, name } = await req.json();
      if (!repo) return new Response("repo required", { status: 400 });
      const repoName = String(repo).match(/github.com\/(.+?)\/(.+?)(?:\.git)?$/)?.[2] || 'game';
      const zipBytes = await downloadFromGithub(repo, branch || "main");
      const id = (name || repoName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const target = join(GAMES_DIR, id);
      await ensureDir(target);
      await extractArchiveToDir(zipBytes, `${repoName}.zip`, target, subdir || "root");

      const sourceInfo: SourceInfo = { source: "github", repo, branch: branch || "main", subdir: subdir || "root" };
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
