import { build } from "jsr:@fresh/core/build";
import manifest from "../fresh.gen.ts";
import { ROOT } from "../lib/utils.ts";

// Change CWD to the project root
Deno.chdir(ROOT);

await build({
  manifest,
});