import { HandlerContext } from "$fresh/server.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { ROOT } from "../lib/utils.ts";

export const handler = {
  async GET(_req: Request, _ctx: HandlerContext): Promise<Response> {
    try {
      const file = await Deno.readFile(join(ROOT, "static", "index.html"));
      return new Response(file, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch (err) {
      console.error("Failed to load launcher index.html:", err);
      return new Response("Launcher UI not available", { status: 500 });
    }
  },
};
