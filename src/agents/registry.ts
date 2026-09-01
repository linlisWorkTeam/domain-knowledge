import type { AgentKind } from "../domain/types.js";
import type { AgentRunner, AgentRunnerRegistry } from "./contracts.js";

export class MapAgentRunnerRegistry implements AgentRunnerRegistry {
  private readonly runners = new Map<AgentKind, AgentRunner>();

  public register(kind: AgentKind, runner: AgentRunner): this {
    this.runners.set(kind, runner);
    return this;
  }

  public get(kind: AgentKind): AgentRunner {
    const runner = this.runners.get(kind);
    if (!runner) {
      throw new Error(`No AgentRunner registered for ${kind}`);
    }
    return runner;
  }
}
