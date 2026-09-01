import { describe, expect, it } from "vitest";
import { CommandEvaluator } from "../src/eval/command-evaluator.js";

describe("CommandEvaluator", () => {
  it("uses configured commands rather than a hard-coded toolchain", async () => {
    const passing = new CommandEvaluator([
      { command: process.execPath, args: ["-e", "process.exit(0)"], cwd: process.cwd() },
    ]);
    const failing = new CommandEvaluator([
      { command: process.execPath, args: ["-e", "process.exit(7)"], cwd: process.cwd() },
    ]);
    const input = { runId: "command", iteration: 1, artifacts: [] };

    expect((await passing.evaluate(input)).outcome).toBe("pass");
    expect((await failing.evaluate(input)).outcome).toBe("fail");
  });

  it("classifies a missing executable as infrastructure error", async () => {
    const evaluator = new CommandEvaluator([
      { command: "definitely-not-a-real-command-domain-knowledge", cwd: process.cwd() },
    ]);
    expect(
      (await evaluator.evaluate({ runId: "missing", iteration: 1, artifacts: [] })).outcome,
    ).toBe("infra-error");
  });
});
