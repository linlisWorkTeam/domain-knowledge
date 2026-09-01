import { spawn } from "node:child_process";

export interface CodexAuthProvider {
  assertAvailable(): Promise<void>;
}

export class ExistingCodexLoginAuthProvider implements CodexAuthProvider {
  public constructor(private readonly codexCommand = "codex") {}

  public async assertAvailable(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.codexCommand, ["login", "status"], {
        stdio: "ignore",
        shell: false,
      });
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        finish(() => reject(new Error("Timed out while checking the existing Codex login")));
      }, 10_000);
      child.once("error", (error) => {
        finish(() => reject(new Error(`Codex CLI is unavailable: ${error.message}`)));
      });
      child.once("close", (code) => {
        finish(() => {
          if (code === 0) resolve();
          else reject(new Error("No usable existing Codex login was found"));
        });
      });
    });
  }
}

export class NoopCodexAuthProvider implements CodexAuthProvider {
  public async assertAvailable(): Promise<void> {}
}
