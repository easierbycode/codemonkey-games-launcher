import { Handlers } from "$fresh/server.ts";
import {
  addGameFromGithub,
} from "../../../lib/utils.ts";

export const handler: Handlers = {
  async POST(req, _ctx) {
    try {
      const { repo, branch, subdir, name } = await req.json();
      if (!repo) return new Response("repo required", { status: 400 });
      const { id } = await addGameFromGithub({ repo, branch, subdir, name });
      return Response.json({ ok: true, id });
    } catch (e) {
      console.error("API route error:", e);
      const msg = e instanceof Error ? e.message : "Internal Server Error";
      return Response.json({ ok: false, error: msg }, { status: 500 });
    }
  },
};
