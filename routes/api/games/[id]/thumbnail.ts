import { Handlers } from "$fresh/server.ts";
import { GAMES_DIR } from "../../../../lib/utils.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

export const handler: Handlers = {
  async POST(req, ctx) {
    try {
      const { id } = ctx.params;
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
    } catch (e) {
      console.error("API route error:", e);
      const msg = e instanceof Error ? e.message : "Internal Server Error";
      return Response.json({ ok: false, error: msg }, { status: 500 });
    }
  },
};
