import { Handlers } from "$fresh/server.ts";
import {
  GAMES_DIR,
  GamepadMapping,
  GamepadUseWASDMap,
  RecommendedButtonsContainer,
} from "../../../../lib/utils.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

type Metadata = {
  sourceInfo?: unknown;
  recommendedButtons?: RecommendedButtonsContainer;
  [key: string]: unknown;
};

type Payload = {
  controllerId?: string;
  gamepadMapping?: GamepadMapping;
  gamepadUseWASD?: boolean;
};

function getExistingContainer(value: unknown): RecommendedButtonsContainer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!("mapping" in value)) return null;
  const container = value as RecommendedButtonsContainer;
  if (!container.mapping) return null;
  return container;
}

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

      let payload: Payload | null = null;
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

      const controllerId = String(payload.controllerId || "default");
      const previousValue = metadata.recommendedButtons;
      const existingContainer = getExistingContainer(previousValue);
      const useWASD: GamepadUseWASDMap = { ...(existingContainer?.useWASD ?? {}) };
      const legacyButtons = Array.isArray(previousValue) ? previousValue : undefined;
      const buttons = Array.isArray(existingContainer?.buttons)
        ? existingContainer.buttons
        : legacyButtons;
      if (payload.gamepadUseWASD !== undefined) {
        useWASD[controllerId] = payload.gamepadUseWASD;
      }

      const container: RecommendedButtonsContainer = {
        mapping: payload.gamepadMapping,
      };
      if (Object.keys(useWASD).length) container.useWASD = useWASD;
      if (buttons && buttons.length) container.buttons = buttons;
      metadata.recommendedButtons = container;

      await Deno.writeTextFile(metadataPath, JSON.stringify(metadata, null, 2));
      return Response.json({ ok: true });
    } catch (err) {
      console.error("Failed to save recommended buttons:", err);
      const msg = err instanceof Error ? err.message : "Internal Server Error";
      return Response.json({ ok: false, error: msg }, { status: 500 });
    }
  },
};
