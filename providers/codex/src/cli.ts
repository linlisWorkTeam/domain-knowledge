#!/usr/bin/env node
import {
  createRuntime,
  type AgentKind,
} from "domain-knowledge-agent-framework";
import { configureCodexProvider } from "./provider.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function printHelp(): void {
  console.log(`Usage:
  npm --prefix providers/codex run demo -- run --codex-agent KIND
      [--workers N] [--max-iterations N]
  npm --prefix providers/codex run demo -- resume <runId> --codex-agent KIND
  npm --prefix providers/codex run demo -- status <runId>
  npm --prefix providers/codex run demo -- artifacts <runId>

KIND: doc-gen | doc-worker | test-gen | code | check | review`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }
  const codexAgent = valueAfter(args, "--codex-agent") as
    | Exclude<AgentKind, "orchestrator">
    | undefined;
  const runtime = await createRuntime({
    ...(codexAgent ? { configureRunners: configureCodexProvider(codexAgent) } : {}),
  });

  switch (command) {
    case "run": {
      if (!codexAgent) throw new Error("run requires --codex-agent KIND");
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
      if (!runId || !codexAgent) throw new Error("resume requires runId and --codex-agent KIND");
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
