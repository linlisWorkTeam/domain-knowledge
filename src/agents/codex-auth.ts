import { spawn } from "node:child_process";
import type { CodexAuthProvider } from "./contracts.js";

export class ExistingLoginAuthProvider implements CodexAuthProvider {
  public constructor(private readonly codexCommand = "codex") {}

  public async assertAvailable(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.codexCommand, ["login", "status"], {
        stdio: "ignore",
        shell: false,
      });
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("Timed out while checking the existing Codex login"));
      }, 10_000);
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(new Error(`Codex CLI is unavailable: ${error.message}`));
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error("No usable existing Codex login was found"));
        }
      });
    });
  }
}

export class NoopCodexAuthProvider implements CodexAuthProvider {
  public async assertAvailable(): Promise<void> {}
}
