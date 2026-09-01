import type {
  AgentKind,
  AgentResumeInput,
  AgentRunInput,
  AgentRunResult,
} from "../domain/types.js";

export interface AgentRunner {
  run(input: AgentRunInput): Promise<AgentRunResult>;
  resume?(input: AgentResumeInput): Promise<AgentRunResult>;
}

export interface AgentRunnerRegistry {
  get(kind: AgentKind): AgentRunner;
}

export interface CodexAuthProvider {
  assertAvailable(): Promise<void>;
}

export interface CodeAgentAuthProvider {
  assertAvailable(): Promise<void>;
}

export class AgentExecutionError extends Error {
  public readonly category: "business" | "infrastructure" | "permission";

  public constructor(
    message: string,
    category: "business" | "infrastructure" | "permission" = "infrastructure",
  ) {
    super(message);
    this.name = "AgentExecutionError";
    this.category = category;
  }
}
