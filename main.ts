/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

import { App, staticFiles } from "fresh";

export const app = new App()
  // Add static file serving middleware
  .use(staticFiles())
  // Enable file-system based routing
  .fsRoutes();
