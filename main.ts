/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

import { start } from "$fresh/server.ts";
import manifest from "./fresh.gen.ts";
import { join, basename } from "https://deno.land/std@0.224.0/path/mod.ts";

const PORT = Number(Deno.env.get("PORT") ?? "8000");

// --- Protocol Handler Logic ---
if (Deno.args.length > 0 && Deno.args[0].startsWith("codemonkey://")) {
  try {
    const url = new URL(Deno.args[0]);
    const repo = url.searchParams.get("repo");
    const branch = url.searchParams.get("branch");
    const subdir = url.searchParams.get("folder");

    if (repo) {
      console.log(`Adding game from GitHub: ${repo}`);
      const waitForServer = async (retries = 5, delay = 500) => {
        for (let i = 0; i < retries; i++) {
          try {
            const resp = await fetch(`http://localhost:${PORT}/api/games`);
            if (resp.ok) {
              console.log("Server is up.");
              return true;
            }
          } catch {
            // Ignore connection errors
          }
          console.log(`Server not ready, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        return false;
      };

      let serverIsUp = await waitForServer(1, 100);

      if (!serverIsUp) {
        console.log("Server not detected. Launching in background...");
        const args = isCompiled() ? [] : ["run", "-A", "main.ts"];
        new Deno.Command(Deno.execPath(), {
          args,
        }).spawn();
        serverIsUp = await waitForServer(5, 1000);
      }

      if (!serverIsUp) {
        throw new Error("Server did not start in time. Cannot add game.");
      }

      const addResp = await fetch(`http://localhost:${PORT}/api/add-game/from-github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, branch, subdir }),
      });

      if (addResp.ok) {
        console.log("Successfully added game via API.");
      } else {
        console.error("Failed to add game via API:", await addResp.text());
      }
    }
  } catch (error) {
    console.error("Failed to handle protocol URL:", error);
  }
  Deno.exit();
}

function isCompiled(): boolean {
  const base = basename(Deno.execPath()).toLowerCase();
  return base !== "deno" && base !== "deno.exe";
}

async function pathExists(p: string): Promise<boolean> {
  try { await Deno.stat(p); return true; } catch { return false; }
}

async function findWinBrowser(): Promise<{ path: string; kind: "chrome" | "edge" } | null> {
  const env = (k: string) => Deno.env.get(k) ?? "";
  const candidates: { path: string; kind: "chrome" | "edge" }[] = [];
  const pf = env("PROGRAMFILES");
  const pfx86 = env("PROGRAMFILES(X86)");
  const lad = env("LOCALAPPDATA");
  if (lad) candidates.push({ path: join(lad, "Google", "Chrome", "Application", "chrome.exe"), kind: "chrome" });
  if (pf) candidates.push({ path: join(pf, "Google", "Chrome", "Application", "chrome.exe"), kind: "chrome" });
  if (pfx86) candidates.push({ path: join(pfx86, "Google", "Chrome", "Application", "chrome.exe"), kind: "chrome" });
  if (pf) candidates.push({ path: join(pf, "Microsoft", "Edge", "Application", "msedge.exe"), kind: "edge" });
  if (pfx86) candidates.push({ path: join(pfx86, "Microsoft", "Edge", "Application", "msedge.exe"), kind: "edge" });
  candidates.push({ path: "chrome.exe", kind: "chrome" });
  candidates.push({ path: "msedge.exe", kind: "edge" });
  for (const c of candidates) {
    if (c.path.includes(".exe") && (c.path.includes("\\") || c.path.includes("/"))) {
      if (await pathExists(c.path)) return c;
    } else {
      try {
        const p = new Deno.Command(c.path, { args: ["--version"], stdout: "piped", stderr: "null" });
        const r = await p.output();
        if (r.success) return c;
      } catch { /* not found in PATH */ }
    }
  }
  return null;
}

async function launchKiosk(url: string): Promise<void> {
  const disableExt = (Deno.env.get("CMG_DISABLE_EXTENSIONS") ?? "1") !== "0";
  let userDataDir = Deno.env.get("CMG_BROWSER_DATA_DIR");
  if (disableExt && !userDataDir) {
    try { userDataDir = await Deno.makeTempDir({ prefix: "cmg-profile-" }); } catch {}
  }

  if (Deno.build.os === "windows") {
    const found = await findWinBrowser();
    if (!found) {
      try { new Deno.Command("cmd.exe", { args: ["/c", "start", "", url], stdin: "null", stdout: "null", stderr: "null" }).spawn(); } catch {}
      return;
    }
    const { path, kind } = found;
    const args: string[] = [];
    if (kind === "chrome") {
      args.push(`--app=${url}`);
      args.push("--kiosk");
      args.push("--start-fullscreen");
      args.push("--no-first-run", "--no-default-browser-check", "--disable-translate");
      if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);
      if (disableExt) {
        args.push("--disable-extensions", "--disable-component-extensions-with-background-pages", "--guest");
      }
    } else {
      args.push("--kiosk", url, "--edge-kiosk-type=fullscreen", "--no-first-run", "--no-default-browser-check");
      if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);
      if (disableExt) {
        args.push("--disable-extensions", "--disable-component-extensions-with-background-pages", "--inprivate");
      }
    }
    try {
      new Deno.Command(path, { args, stdin: "null", stdout: "null", stderr: "null" }).spawn();
    } catch (e) {
      console.error("Failed to launch browser:", e);
    }
    return;
  }

  if (Deno.build.os === "darwin") {
    const openArgs: string[] = ["-a", "Google Chrome", "--args", `--app=${url}`, "--kiosk", "--start-fullscreen", "--no-first-run", "--no-default-browser-check", "--disable-translate"];
    if (userDataDir) openArgs.push(`--user-data-dir=${userDataDir}`);
    if (disableExt) {
      openArgs.push("--disable-extensions", "--disable-component-extensions-with-background-pages", "--guest");
    }
    try {
      new Deno.Command("/usr/bin/open", { args: openArgs, stdin: "null", stdout: "null", stderr: "null" }).spawn();
      return;
    } catch (_) {
      const chromeBin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      const args: string[] = [`--app=${url}`, "--kiosk", "--start-fullscreen", "--no-first-run", "--no-default-browser-check", "--disable-translate"];
      if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);
      if (disableExt) args.push("--disable-extensions", "--disable-component-extensions-with-background-pages", "--guest");
      try {
        new Deno.Command(chromeBin, { args, stdin: "null", stdout: "null", stderr: "null" }).spawn();
        return;
      } catch (e) {
        console.error("Failed to launch Chrome on macOS:", e);
      }
    }
    try { new Deno.Command("/usr/bin/open", { args: [url], stdin: "null", stdout: "null", stderr: "null" }).spawn(); } catch {}
    return;
  }
}

await start(manifest, {
  port: PORT,
  onListen: () => {
    if (isCompiled() && (Deno.build.os === "windows" || Deno.build.os === "darwin") && (Deno.env.get("CMG_AUTO_KIOSK") ?? "1") !== "0") {
      // deno-lint-ignore no-explicit-any
      (globalThis as any).lastHeartbeat = Date.now();
      const HEARTBEAT_CHECK_INTERVAL = 5000;
      const HEARTBEAT_TIMEOUT = 10000;

      const monitor = setInterval(() => {
        // deno-lint-ignore no-explicit-any
        const last = (globalThis as any).lastHeartbeat;
        if (Date.now() - last > HEARTBEAT_TIMEOUT) {
          console.log("Heartbeat timeout exceeded. App window likely closed. Exiting.");
          clearInterval(monitor);
          Deno.exit(0);
        }
      }, HEARTBEAT_CHECK_INTERVAL);

      (async () => {
        try { await new Promise((r) => setTimeout(r, 300)); } catch {}
        await launchKiosk(`http://localhost:${PORT}`);
      })();
    }
  },
});
