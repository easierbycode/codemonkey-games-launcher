/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

import { App } from "jsr:@fresh/core@^2.1.1";
import { Webview } from "@webview/webview";
import { ROOT } from "./lib/utils.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";

// --- Single Instance and URL Handling Logic ---

const LOCK_FILE = join(Deno.env.get("TMPDIR") || Deno.env.get("TEMP") || "/tmp", "codemonkey-games.lock");
const URL_FILE = join(Deno.env.get("TMPDIR") || Deno.env.get("TEMP") || "/tmp", "codemonkey-games.url");

// Function to handle the incoming URL
function handleUrl(url: string) {
  if (url.startsWith("codemonkey://")) {
    console.log("Protocol URL received:", url);
    // In a real application, you would parse the URL and take appropriate action,
    // like navigating the webview or showing a notification.
  }
}

async function ensureSingleInstance() {
  try {
    // Try to create a lock file exclusively. If it fails, another instance is running.
    await Deno.open(LOCK_FILE, { createNew: true, write: true });

    // This is the primary instance. Register cleanup logic.
    const cleanup = () => {
      try {
        Deno.removeSync(LOCK_FILE);
      } catch (e) {
        // Ignore errors during cleanup
      }
      Deno.exit();
    };
    Deno.addSignalListener("SIGINT", cleanup);
    Deno.addSignalListener("SIGTERM", cleanup);

    // Watch for new URLs being written to the URL_FILE.
    const watcher = Deno.watchFs(URL_FILE);
    (async () => {
      for await (const event of watcher) {
        if (event.kind === "modify" || event.kind === "create") {
          try {
            const url = await Deno.readTextFile(URL_FILE);
            if (url) {
              handleUrl(url);
              await Deno.writeTextFile(URL_FILE, ""); // Clear the file
            }
          } catch (error) {
            // Ignore if file doesn't exist or is empty
          }
        }
      }
    })();

    // Handle the initial URL if provided
    if (Deno.args.length > 0) {
      handleUrl(Deno.args[0]);
    }

    return true; // Indicates this is the primary instance
  } catch (error) {
    if (error instanceof Deno.errors.AlreadyExists) {
      // Another instance is running. Write the URL to the file and exit.
      if (Deno.args.length > 0) {
        const url = Deno.args[0];
        await Deno.writeTextFile(URL_FILE, url);
      }
      return false; // Indicates this is a secondary instance
    }
    // For other errors, just log and exit.
    console.error("Failed to acquire lock:", error);
    return false;
  }
}

// --- Application Entry Point ---

async function main() {
  const isPrimaryInstance = await ensureSingleInstance();

  if (!isPrimaryInstance) {
    console.log("Another instance is already running. Passing URL and exiting.");
    Deno.exit();
  }

  console.log("Primary instance started. Application is running.");

  // The rest of the original desktop.ts logic goes here...
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
}

main();
