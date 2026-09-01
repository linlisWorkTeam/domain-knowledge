import type { AgentRunInput, AgentRunResult } from "../domain/types.js";
import { AgentExecutionError, type AgentRunner } from "./contracts.js";

export interface FakeAgentCall {
  kind: AgentRunInput["kind"];
  node: string;
  runId: string;
  iteration: number;
  attempt: number;
  workerId?: string;
  startedAt: number;
  completedAt: number;
}

export class FakeAgentRunner implements AgentRunner {
  public readonly calls: FakeAgentCall[] = [];

  public async run(input: AgentRunInput): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const delayMs = input.scenario?.agentDelayMs[input.kind] ?? 0;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (input.scenario?.failAgent === input.kind) {
      throw new AgentExecutionError(`Injected failure in ${input.kind}`);
    }

    if (input.signal?.aborted) {
      throw new AgentExecutionError("Run cancelled", "infrastructure");
    }

    const safeWorker = input.workerId ? `-${input.workerId}` : "";
    const finalResponse = `${input.kind} completed iteration ${input.iteration}${safeWorker}`;
    const completedAt = Date.now();
    this.calls.push({
      kind: input.kind,
      node: input.node,
      runId: input.runId,
      iteration: input.iteration,
      attempt: input.attempt,
      ...(input.workerId ? { workerId: input.workerId } : {}),
      startedAt,
      completedAt,
    });

    return {
      finalResponse,
      files: [
        {
          relativePath: `${input.kind}${safeWorker}.md`,
          content: `# ${input.kind}\n\n${finalResponse}\n`,
          mediaType: "text/markdown",
        },
      ],
      metadata: { fake: true },
    };
  }
}
