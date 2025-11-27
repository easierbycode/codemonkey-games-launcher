const sources = ["manifest.json", "scripts", "images"];
const buildDir = "build";
const destination = `${buildDir}/chrome-extension.zip`;
const decoder = new TextDecoder();

async function runCommand(command: string, args: string[]) {
  try {
    const { success, stdout, stderr } = await new Deno.Command(command, { args }).output();
    return { success, stdout: decoder.decode(stdout), stderr: decoder.decode(stderr) };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      const hint = command === "zip"
        ? "Install the `zip` CLI (e.g. `sudo apt install zip` or `brew install zip`)."
        : "";
      throw new Error(`Command not found: ${command}. ${hint}`.trim());
    }
    throw error;
  }
}

await Deno.mkdir(buildDir, { recursive: true });
await Deno.remove(destination).catch((error) => {
  if (error instanceof Deno.errors.NotFound) return;
  throw error;
});

console.log(`Packaging extension -> ${destination}`);

if (Deno.build.os === "windows") {
  const archiveCommand = `Compress-Archive -Path ${sources
    .map((source) => `"${source}"`)
    .join(", ")} -DestinationPath "${destination}" -Force`;
  const result = await runCommand("powershell", ["-NoProfile", "-Command", archiveCommand]);
  if (!result.success) {
    console.error(result.stdout.trim());
    console.error(result.stderr.trim());
    throw new Error("Failed to package extension with Compress-Archive.");
  }
} else {
  const result = await runCommand("zip", ["-r", destination, ...sources]);
  if (!result.success) {
    console.error(result.stdout.trim());
    console.error(result.stderr.trim());
    throw new Error("Failed to package extension with zip.");
  }
}

console.log("Extension packaged successfully.");
