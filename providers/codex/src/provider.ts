import type {
  AgentKind,
  AgentRunner,
  RuntimeOptions,
} from "domain-knowledge-agent-framework";
import { ExistingCodexLoginAuthProvider } from "./auth.js";
import { CodexAgentRunner, type CodexAgentRunnerOptions } from "./runner.js";

export interface CodexProviderOptions extends CodexAgentRunnerOptions {
  runner?: AgentRunner;
  codexCommand?: string;
}

export function configureCodexProvider(
  kind: Exclude<AgentKind, "orchestrator">,
  options: CodexProviderOptions = {},
): NonNullable<RuntimeOptions["configureRunners"]> {
  return (registry) => {
    const runner = options.runner ?? new CodexAgentRunner(
      new ExistingCodexLoginAuthProvider(options.codexCommand),
      {
        ...(options.model ? { model: options.model } : {}),
        ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
      },
    );
    registry.register(kind, runner);
  };
}
