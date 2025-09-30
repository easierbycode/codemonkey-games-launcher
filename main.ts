/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import { App } from "jsr:@fresh/core@^2.1.1";
import { ROOT } from "./lib/utils.ts";

// Change CWD to the project root
try {
  Deno.chdir(ROOT);
} catch (err) {
  console.error("Failed to change working directory to app root:", err);
}

// In Fresh v2, the manifest is discovered automatically.
// The Vite plugin will handle the build process.
const app = new App();

// The Deno Deploy environment will set the PORT environment variable.
await app.listen();