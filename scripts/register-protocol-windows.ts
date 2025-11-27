import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const projectRoot = Deno.cwd();
const appPath = join(projectRoot, "build", "windows", "codemonkey-games-launcher.exe");
const scriptPath = join(projectRoot, "scripts", "register-url-protocol-windows.ps1");

try {
  const command = new Deno.Command("powershell", {
    args: [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-AppPath",
      appPath,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();

  if (code === 0) {
    console.log(new TextDecoder().decode(stdout));
  } else {
    console.error(new TextDecoder().decode(stderr));
    Deno.exit(1);
  }
} catch (err) {
  console.error("Failed to execute PowerShell script:", err);
  Deno.exit(1);
}
