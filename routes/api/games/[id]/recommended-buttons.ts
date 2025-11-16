import { Handlers } from "$fresh/server.ts";
import { GAMES_DIR, GamepadMapping } from "../../../../lib/utils.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

type Metadata = {
  sourceInfo?: unknown;
  recommendedButtons?: GamepadMapping;
  [key: string]: unknown;
};

export const handler: Handlers = {
  async POST(req, ctx) {
    try {
      const { id } = ctx.params;
      if (!id) return new Response("Game ID required", { status: 400 });

      const target = join(GAMES_DIR, id);
      try {
        const stat = await Deno.stat(target);
        if (!stat.isDirectory) throw new Error("Not a directory");
      } catch {
        return new Response("Game not found", { status: 404 });
      }

      let payload: { gamepadMapping?: GamepadMapping } | null = null;
      try {
        payload = await req.json();
      } catch {
        return new Response("Invalid JSON body", { status: 400 });
      }

      if (!payload?.gamepadMapping || typeof payload.gamepadMapping !== "object") {
        return new Response("gamepadMapping object required", { status: 400 });
      }

      const metadataPath = join(target, "codemonkey.json");
      let metadata: Metadata = {};
      try {
        const content = await Deno.readTextFile(metadataPath);
        metadata = JSON.parse(content);
      } catch {
        metadata = {};
      }

      metadata.recommendedButtons = payload.gamepadMapping;

      await Deno.writeTextFile(metadataPath, JSON.stringify(metadata, null, 2));
      return Response.json({ ok: true });
    } catch (err) {
      console.error("Failed to save recommended buttons:", err);
      const msg = err instanceof Error ? err.message : "Internal Server Error";
      return Response.json({ ok: false, error: msg }, { status: 500 });
    }
  },
};
