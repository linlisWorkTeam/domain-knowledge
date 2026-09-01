import { spawn } from "node:child_process";
import type { CodeAgentAuthProvider } from "./contracts.js";

interface CodeAgentAuthStatus {
  loggedIn?: boolean;
  expired?: boolean;
  expiresAt?: number;
}

export class ExistingCodeAgentLoginAuthProvider implements CodeAgentAuthProvider {
  private validUntil = 0;

  public constructor(
    private readonly cliPath = "codeagent",
    private readonly timeoutMs = 10_000,
  ) {}

  public async assertAvailable(): Promise<void> {
    if (Date.now() < this.validUntil) return;

    const status = await new Promise<CodeAgentAuthStatus>((resolve, reject) => {
      const child = spawn(this.cliPath, ["auth", "status", "--json"], {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        finish(() => reject(new Error("Timed out while checking CodeAgent login")));
      }, this.timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.once("error", (error) => {
        finish(() => reject(new Error(`CodeAgent CLI is unavailable: ${error.message}`)));
      });
      child.once("close", (code) => {
        finish(() => {
          if (code !== 0) {
            reject(new Error(`CodeAgent login check failed: ${stderr.trim() || `exit ${code}`}`));
            return;
          }
          try {
            resolve(JSON.parse(stdout) as CodeAgentAuthStatus);
          } catch {
            reject(new Error("CodeAgent login check returned invalid JSON"));
          }
        });
      });
    });

    if (!status.loggedIn || status.expired) {
      throw new Error("No usable CodeAgent IDAAS login was found");
    }
    const expiry = typeof status.expiresAt === "number" ? status.expiresAt : Date.now() + 60_000;
    this.validUntil = Math.max(Date.now(), Math.min(expiry - 60_000, Date.now() + 60_000));
  }
}

export class NoopCodeAgentAuthProvider implements CodeAgentAuthProvider {
  public async assertAvailable(): Promise<void> {}
}
