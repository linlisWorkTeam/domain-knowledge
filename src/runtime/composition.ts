import type { AgentKind } from "../domain/types.js";
import { ExistingCodeAgentLoginAuthProvider } from "../agents/codeagent-auth.js";
import { CompanyCodeAgentCliRunner } from "../agents/codeagent-cli-runner.js";
import { FakeAgentRunner } from "../agents/fake-runner.js";
import { MapAgentRunnerRegistry } from "../agents/registry.js";
import { ScenarioEvaluator } from "../eval/scenario-evaluator.js";
import { buildKnowledgeGraph } from "../graph/build-graph.js";
import {
  InMemoryCheckpointerFactory,
  SqliteCheckpointerFactory,
  type CheckpointerFactory,
} from "../platform/checkpointers.js";
import { LocalFileArtifactStore } from "../platform/local-artifact-store.js";
import { LocalWorkspaceProvider } from "../platform/local-workspace-provider.js";
import { RunService } from "./run-service.js";

const RUNNER_AGENT_KINDS = [
  "doc-gen",
  "doc-worker",
  "test-gen",
  "code",
  "check",
  "review",
] as const satisfies readonly AgentKind[];

export interface RuntimeOptions {
  artifactRoot?: string;
  checkpointer?: "sqlite" | "memory";
  sqlitePath?: string;
  codeAgentAgent?: Exclude<AgentKind, "orchestrator">;
  codeAgentCliPath?: string;
  codeAgentTimeoutMs?: number;
  codeAgentBare?: boolean;
  codeAgentDangerouslySkipPermissions?: boolean;
  configureRunners?: (
    runners: MapAgentRunnerRegistry,
  ) => void | Promise<void>;
}

export async function createRuntime(options: RuntimeOptions = {}) {
  const fakeRunner = new FakeAgentRunner();
  const runners = new MapAgentRunnerRegistry();
  for (const kind of RUNNER_AGENT_KINDS) {
    runners.register(kind, fakeRunner);
  }
  if (options.codeAgentAgent) {
    const cliPath = options.codeAgentCliPath ?? "codeagent";
    runners.register(
      options.codeAgentAgent,
      new CompanyCodeAgentCliRunner(
        new ExistingCodeAgentLoginAuthProvider(cliPath),
        {
          cliPath,
          ...(options.codeAgentTimeoutMs ? { timeoutMs: options.codeAgentTimeoutMs } : {}),
          ...(options.codeAgentBare ? { bare: true } : {}),
          ...(options.codeAgentDangerouslySkipPermissions
            ? { dangerouslySkipPermissions: true }
            : {}),
        },
      ),
    );
  }
  await options.configureRunners?.(runners);

  const artifactStore = new LocalFileArtifactStore(options.artifactRoot);
  const workspaceProvider = new LocalWorkspaceProvider(artifactStore.root);
  let checkpointerFactory: CheckpointerFactory;
  if (options.checkpointer === "memory") {
    checkpointerFactory = new InMemoryCheckpointerFactory();
  } else {
    checkpointerFactory = new SqliteCheckpointerFactory(options.sqlitePath);
  }
  const checkpointer = await checkpointerFactory.create();
  const graph = buildKnowledgeGraph(
    {
      runners,
      evaluator: new ScenarioEvaluator(),
      artifactStore,
      workspaceProvider,
    },
    checkpointer,
  );

  return {
    graph,
    service: new RunService(graph),
    fakeRunner,
    artifactStore,
    runners,
  };
}
