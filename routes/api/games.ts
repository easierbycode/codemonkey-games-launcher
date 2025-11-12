import { Handlers } from "$fresh/server.ts";
import { listGames } from "../../lib/utils.ts";

export const handler: Handlers = {
  async GET(_req, _ctx) {
    try {
      const games = await listGames();
      return Response.json(games);
    } catch (e) {
      console.error("API route error:", e);
      const msg = e instanceof Error ? e.message : "Internal Server Error";
      return Response.json({ ok: false, error: msg }, { status: 500 });
    }
  },
};
