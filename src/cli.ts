#!/usr/bin/env node
import type { AgentKind } from "./domain/types.js";
import { createRuntime } from "./runtime/composition.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function printHelp(): void {
  console.log(`Usage:
  npm run cli -- run [--workers N] [--max-iterations N]
                     [--codeagent-agent KIND] [--codeagent-cli PATH]
                     [--codeagent-timeout-ms N] [--codeagent-bare]
                     [--codeagent-dangerously-skip-permissions]
  npm run cli -- resume <runId>
  npm run cli -- status <runId>
  npm run cli -- cancel <runId>
  npm run cli -- artifacts <runId>

KIND: doc-gen | doc-worker | test-gen | code | check | review`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  const codeAgentAgent = valueAfter(args, "--codeagent-agent") as
    | Exclude<AgentKind, "orchestrator">
    | undefined;
  const codeAgentCliPath = valueAfter(args, "--codeagent-cli");
  const codeAgentTimeout = valueAfter(args, "--codeagent-timeout-ms");
  const runtime = await createRuntime({
    ...(codeAgentAgent ? { codeAgentAgent } : {}),
    ...(codeAgentCliPath ? { codeAgentCliPath } : {}),
    ...(codeAgentTimeout ? { codeAgentTimeoutMs: Number(codeAgentTimeout) } : {}),
    ...(args.includes("--codeagent-bare") ? { codeAgentBare: true } : {}),
    ...(args.includes("--codeagent-dangerously-skip-permissions")
      ? { codeAgentDangerouslySkipPermissions: true }
      : {}),
  });

  switch (command) {
    case "run": {
      const workers = Number(valueAfter(args, "--workers") ?? 0);
      const maxIterations = Number(valueAfter(args, "--max-iterations") ?? 5);
      const handle = await runtime.service.startRun({ workerCount: workers, maxIterations });
      console.log(JSON.stringify({ event: "started", ...handle }));
      const result = await runtime.service.waitForRun(handle.runId);
      console.log(JSON.stringify(result, null, 2));
      if (result.status !== "completed") process.exitCode = 1;
      break;
    }
    case "resume": {
      const runId = args[1];
      if (!runId) throw new Error("resume requires runId");
      await runtime.service.resumeRun(runId);
      console.log(JSON.stringify(await runtime.service.waitForRun(runId), null, 2));
      break;
    }
    case "status": {
      const runId = args[1];
      if (!runId) throw new Error("status requires runId");
      console.log(JSON.stringify(await runtime.service.getRunStatus(runId), null, 2));
      break;
    }
    case "cancel": {
      const runId = args[1];
      if (!runId) throw new Error("cancel requires runId");
      await runtime.service.cancelRun(runId);
      console.log(JSON.stringify({ runId, status: "cancelled" }));
      break;
    }
    case "artifacts": {
      const runId = args[1];
      if (!runId) throw new Error("artifacts requires runId");
      console.log(JSON.stringify(await runtime.service.getRunArtifacts(runId), null, 2));
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
