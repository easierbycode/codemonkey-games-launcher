import { Handlers } from "jsr:@fresh/core@^2.1.1/compat";

export const handler: Handlers = {
  POST(_req, _ctx) {
    try {
      // deno-lint-ignore no-explicit-any
      if ((globalThis as any).lastHeartbeat) {
        // deno-lint-ignore no-explicit-any
        (globalThis as any).lastHeartbeat = Date.now();
      }
      return Response.json({ ok: true });
    } catch (e) {
      console.error("API route error:", e);
      const msg = e instanceof Error ? e.message : "Internal Server Error";
      return Response.json({ ok: false, error: msg }, { status: 500 });
    }
  },
};
