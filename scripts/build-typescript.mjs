import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

const packageRoot = process.cwd();
await rm(path.join(packageRoot, "dist"), { recursive: true, force: true });

const executable = process.platform === "win32" ? "tsc.cmd" : "tsc";
const child = spawn(executable, ["-p", "tsconfig.json"], {
  cwd: packageRoot,
  shell: false,
  stdio: "inherit",
});
child.once("error", (error) => {
  console.error(`Unable to start TypeScript compiler: ${error.message}`);
  process.exitCode = 1;
});
child.once("close", (code) => {
  process.exitCode = code ?? 1;
});
