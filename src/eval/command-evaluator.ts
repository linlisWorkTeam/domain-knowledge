import { spawn } from "node:child_process";
import type { EvaluationInput, EvaluationReport } from "../domain/types.js";
import type { Evaluator } from "./contracts.js";

export interface EvaluationCommand {
  command: string;
  args?: string[];
  cwd: string;
  timeoutMs?: number;
}

export class CommandEvaluator implements Evaluator {
  public constructor(private readonly commands: EvaluationCommand[]) {}

  public async evaluate(input: EvaluationInput): Promise<EvaluationReport> {
    const evidence: string[] = [];
    for (const command of this.commands) {
      const result = await this.runCommand(command, input.signal);
      evidence.push(`${command.command}: exit=${result.exitCode}\n${result.output}`);
      if (result.infrastructureError) {
        return {
          outcome: "infra-error",
          summary: `Could not execute ${command.command}`,
          evidence,
          infrastructureError: true,
          criticalRegression: false,
        };
      }
      if (result.exitCode !== 0) {
        return {
          outcome: "fail",
          summary: `${command.command} failed`,
          evidence,
          infrastructureError: false,
          criticalRegression: false,
        };
      }
    }
    return {
      outcome: "pass",
      summary: "All configured evaluation commands passed",
      evidence,
      infrastructureError: false,
      criticalRegression: false,
    };
  }

  private async runCommand(
    command: EvaluationCommand,
    signal?: AbortSignal,
  ): Promise<{ exitCode: number; output: string; infrastructureError: boolean }> {
    return new Promise((resolve) => {
      const child = spawn(command.command, command.args ?? [], {
        cwd: command.cwd,
        shell: false,
        signal,
      });
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      const timeout = setTimeout(() => child.kill("SIGTERM"), command.timeoutMs ?? 60_000);
      child.once("error", (error) => {
        clearTimeout(timeout);
        resolve({ exitCode: -1, output: `${output}\n${error.message}`, infrastructureError: true });
      });
      child.once("exit", (code, signalName) => {
        clearTimeout(timeout);
        resolve({
          exitCode: code ?? -1,
          output: signalName ? `${output}\nterminated by ${signalName}` : output,
          infrastructureError: code === null,
        });
      });
    });
  }
}
