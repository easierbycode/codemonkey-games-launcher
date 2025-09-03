// Build Kazeta-compatible package output in ./build/kazeta
// Produces: build/kazeta/{site files}/, app.kzi, icon.png (64x64)
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { copy } from "https://deno.land/std@0.224.0/fs/copy.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const ROOT = new URL("..", import.meta.url);
const OUT = join(Deno.cwd(), "build", "kazeta");
await ensureDir(OUT);

// Copy static site and current games content
await ensureDir(join(OUT, "static"));
await copy(join(Deno.cwd(), "static"), join(OUT, "static"), { overwrite: true });

try {
  await ensureDir(join(OUT, "games"));
  await copy(join(Deno.cwd(), "games"), join(OUT, "games"), { overwrite: true });
} catch (_) {
  // no games yet
}

// Minimal .kzi info file
const kzi = {
  name: "Codemonkey Games Launcher",
  id: "codemonkey.games.launcher",
  version: Deno.env.get("GITHUB_REF_NAME")?.replace(/^v/, "") || "0.1.0",
  entry: "/static/index.html",
  description: "Launcher UI for Phaser & Kaplay games",
  author: "Codemonkey Games",
};
await Deno.writeTextFile(join(OUT, "app.kzi"), JSON.stringify(kzi, null, 2));

// Icon: ensure a 64x64 PNG exists
const ICON_SRC = join(Deno.cwd(), "static", "icon-64.png");
try {
  const stat = await Deno.stat(ICON_SRC);
  if (!stat.isFile) throw new Error("no icon");
  await Deno.copyFile(ICON_SRC, join(OUT, "icon.png"));
} catch {
  // Create a simple placeholder icon
  const png = new Uint8Array([
    // 1x1 PNG transparent converted to 64x64 in metadata is non-trivial; provide minimal placeholder bytes.
  ]);
  // Fallback: write an empty file to be replaced
  await Deno.writeFile(join(OUT, "icon.png"), png);
}

console.log(`Kazeta build created at ${OUT}`);

