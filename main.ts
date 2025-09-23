/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

import { start } from "$fresh/server.ts";
import manifest from "./fresh.gen.ts";
import { ROOT } from "./lib/utils.ts";

const RUNTIME_CONFIG = JSON.stringify({
  imports: {
    "$fresh/": "https://deno.land/x/fresh@1.6.8/",
    "fresh": "https://deno.land/x/fresh@1.6.8/mod.ts",
    "preact": "https://esm.sh/preact@10.19.6",
    "preact/": "https://esm.sh/preact@10.19.6/",
    "@preact/signals": "https://esm.sh/*@preact/signals@1.2.2",
    "@preact/signals-core": "https://esm.sh/*@preact/signals-core@1.5.1",
    "tailwindcss": "npm:tailwindcss@3.4.1",
    "tailwindcss/": "npm:/tailwindcss@3.4.1/",
    "tailwindcss/plugin": "npm:/tailwindcss@3.4.1/plugin.js",
    "vite": "npm:vite@^5.3.3",
    "@fresh/plugin-vite": "jsr:@fresh/plugin-vite@^0.1.0"
  },
  compilerOptions: {
    jsx: "react-jsx",
    jsxImportSource: "preact",
  },
}, null, 2);

const CONFIG_FILENAMES = ["deno.json", "deno.jsonc"] as const;

function isConfigPath(path: string | URL): boolean {
  const value = typeof path === "string"
    ? path
    : path instanceof URL
    ? path.pathname
    : String(path);

  const lower = value.toLowerCase();
  return CONFIG_FILENAMES.some((name) =>
    lower === name || lower.endsWith(`/${name}`) || lower.endsWith(`\\${name}`)
  );
}

function installConfigFallbacks() {
  const originalReadTextFile = Deno.readTextFile.bind(Deno);
  const originalReadTextFileSync = Deno.readTextFileSync.bind(Deno);

  Deno.readTextFile = async (path: string | URL, options?: Deno.ReadFileOptions): Promise<string> => {
    if (isConfigPath(path)) {
      try {
        return await originalReadTextFile(path, options);
      } catch (_) {
        return `${RUNTIME_CONFIG}\n`;
      }
    }
    return await originalReadTextFile(path, options);
  };

  Deno.readTextFileSync = (path: string | URL): string => {
    if (isConfigPath(path)) {
      try {
        return originalReadTextFileSync(path);
      } catch (_) {
        return `${RUNTIME_CONFIG}\n`;
      }
    }
    return originalReadTextFileSync(path);
  };
}

async function ensureFreshConfig() {
  for (const name of CONFIG_FILENAMES) {
    try {
      await Deno.stat(name);
      return;
    } catch (_) {
      // keep searching
    }
  }

  try {
    await Deno.writeTextFile("deno.json", `${RUNTIME_CONFIG}\n`);
  } catch (err) {
    console.error("Unable to create fallback deno.json:", err);
  }
}

async function launchKiosk(url: string) {
  if (Deno.env.get("CMG_DISABLE_KIOSK") === "1") {
    return;
  }

  const candidates = [
    Deno.env.get("CHROME_PATH"),
    Deno.env.get("BROWSER_PATH"),
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].filter((candidate): candidate is string => Boolean(candidate));

  let browserPath: string | null = null;

  for (const candidate of candidates) {
    try {
      const stat = await Deno.stat(candidate);
      if (stat.isFile) {
        browserPath = candidate;
        break;
      }
    } catch (_) {
      // continue searching
    }
  }

  if (!browserPath) {
    console.error("No Chromium-based browser found for kiosk mode. Set CHROME_PATH or BROWSER_PATH.");
    return;
  }

  try {
    new Deno.Command(browserPath, {
      args: [
        "--kiosk",
        "--no-first-run",
        "--disable-session-crashed-bubble",
        `--app=${url}`,
      ],
      detached: true,
      stderr: "null",
      stdout: "null",
    }).spawn();
  } catch (err) {
    console.error("Failed to launch kiosk browser:", err);
  }
}

try {
  Deno.chdir(ROOT);
} catch (err) {
  console.error("Failed to change working directory to app root:", err);
}

installConfigFallbacks();
await ensureFreshConfig();

const BASE_PORT = Number(Deno.env.get("PORT") ?? "8000");
const HOSTNAME = Deno.env.get("HOSTNAME") ?? "127.0.0.1";
const MAX_PORT_OFFSET = Number(Deno.env.get("PORT_RETRY_LIMIT") ?? "10");
let kioskLaunched = false;

for (let offset = 0; offset <= MAX_PORT_OFFSET; offset++) {
  const port = BASE_PORT + offset;
  try {
    await start(manifest, {
      port,
      hostname: HOSTNAME,
      onListen: ({ hostname, port }) => {
        const host = hostname === "0.0.0.0" ? "localhost" : hostname;
        const url = `http://${host}:${port}/`;
        console.log(`Codemonkey Games Launcher ready at ${url}`);

        if (!kioskLaunched) {
          kioskLaunched = true;
          launchKiosk(url);
        }
      },
    });

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

    console.error("Server failed to start:", err);
    Deno.exit(1);
  }
}
