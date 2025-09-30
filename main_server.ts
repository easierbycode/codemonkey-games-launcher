/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

import { App } from "jsr:@fresh/core@^2.1.1";
import manifest from "./fresh.gen.ts";
import { ROOT } from "./lib/utils.ts";

// This is a simplified entrypoint for the Fresh application,
// designed to run as a standard web server. The desktop-specific
// logic, such as the webview and config fallbacks, has been removed.

try {
  Deno.chdir(ROOT);
} catch (err) {
  console.error("Failed to change working directory to app root:", err);
}

const app = new App(manifest);

// The Deno Deploy environment will set the PORT environment variable.
const port = Number(Deno.env.get("PORT") ?? "8000");

await app.listen({
    port,
    onListen: ({ hostname, port }) => {
        console.log(`Fresh server listening on http://${hostname}:${port}`);
    }
});