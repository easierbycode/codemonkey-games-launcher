#!/usr/bin/env -S deno run -A --watch=static/,routes/

import dev from "jsr:@fresh/core/dev";
import manifest from "./fresh.gen.ts";

// The main Fresh server entrypoint for development and builds.
const entrypoint = "./main_server.ts";

await dev(import.meta.url, entrypoint, {
  manifest,
});