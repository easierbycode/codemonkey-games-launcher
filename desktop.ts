/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

import { App } from "jsr:@fresh/core@^2.1.1";
import { Webview } from "@webview/webview";
import { ROOT } from "./lib/utils.ts";

try {
  Deno.chdir(ROOT);
} catch (err) {
  console.error("Failed to change working directory to app root:", err);
}

const BASE_PORT = Number(Deno.env.get("PORT") ?? "8000");
const HOSTNAME = Deno.env.get("HOSTNAME") ?? "127.0.0.1";
const MAX_PORT_OFFSET = Number(Deno.env.get("PORT_RETRY_LIMIT") ?? "10");
let webviewLaunched = false;

for (let offset = 0; offset <= MAX_PORT_OFFSET; offset++) {
  const port = BASE_PORT + offset;
  try {
    // In Fresh v2, the manifest is discovered automatically.
    const app = new App();
    const controller = new AbortController();

    const listenPromise = app.listen({
      port,
      hostname: HOSTNAME,
      signal: controller.signal,
      onListen: ({ hostname, port }) => {
        if (webviewLaunched) {
          return;
        }
        webviewLaunched = true;

        const host = hostname === "0.0.0.0" ? "localhost" : hostname;
        const url = `http://${host}:${port}/`;
        console.log(`Codemonkey Games Launcher ready at ${url}`);

        const webview = new Webview();
        webview.navigate(url);
        webview.run();
        controller.abort();
      },
    });

    await listenPromise;
    break;
  } catch (err) {
    if (err instanceof Deno.errors.AddrInUse) {
      console.error(`Port ${port} is in use. Trying ${port + 1}...`);
      if (offset === MAX_PORT_OFFSET) {
        console.error("Unable to bind any port in range. Exiting.");
        Deno.exit(1);
      }
      continue;
    }

    if (err.name === "AbortError") {
      break;
    }

    console.error("Server failed to start:", err);
    Deno.exit(1);
  }
}