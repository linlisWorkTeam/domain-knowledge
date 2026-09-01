import { Codex } from "@openai/codex-sdk";
import {
  AgentExecutionError,
  type AgentResumeInput,
  type AgentRunInput,
  type AgentRunner,
  type AgentRunResult,
} from "domain-knowledge-agent-framework";
import type { CodexAuthProvider } from "./auth.js";

export interface CodexAgentRunnerOptions {
  model?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
}

export class CodexAgentRunner implements AgentRunner {
  private readonly codex = new Codex();

  public constructor(
    private readonly auth: CodexAuthProvider,
    private readonly options: CodexAgentRunnerOptions = {},
  ) {}

  public async run(input: AgentRunInput): Promise<AgentRunResult> {
    return this.execute(input);
  }

  public async resume(input: AgentResumeInput): Promise<AgentRunResult> {
    return this.execute(input);
  }

  private async execute(input: AgentRunInput): Promise<AgentRunResult> {
    await this.auth.assertAvailable();
    try {
      const threadOptions = {
        workingDirectory: input.workspace.root,
        sandboxMode: "workspace-write" as const,
        approvalPolicy: "never" as const,
        networkAccessEnabled: false,
        skipGitRepoCheck: true,
        ...(this.options.model ? { model: this.options.model } : {}),
        ...(this.options.reasoningEffort
          ? { modelReasoningEffort: this.options.reasoningEffort }
          : {}),
      };
      const thread = input.existingThreadId
        ? this.codex.resumeThread(input.existingThreadId, threadOptions)
        : this.codex.startThread(threadOptions);
      const result = await thread.run(
        input.prompt,
        input.signal ? { signal: input.signal } : undefined,
      );
      return {
        finalResponse: result.finalResponse,
        files: [{
          relativePath: "final-response.md",
          content: result.finalResponse,
          mediaType: "text/markdown",
        }],
        ...(thread.id ? { threadId: thread.id } : {}),
        metadata: { usage: result.usage, backend: "codex-sdk" },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AgentExecutionError(`Codex execution failed: ${message}`);
    }
  }
}
