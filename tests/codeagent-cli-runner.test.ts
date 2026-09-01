import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NoopCodeAgentAuthProvider } from "../src/agents/codeagent-auth.js";
import {
  CodeAgentCliError,
  CompanyCodeAgentCliRunner,
} from "../src/agents/codeagent-cli-runner.js";
import type { AgentKind, AgentRunInput } from "../src/domain/types.js";

const roots: string[] = [];
const fixture = path.resolve("tests/fixtures/fake-codeagent.sh");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function inputFor(kind: Exclude<AgentKind, "orchestrator">, prompt = "RUN") {
  const root = await mkdtemp(path.join(os.tmpdir(), "codeagent-runner-test-"));
  roots.push(root);
  const readable = path.join(root, "inputs");
  const writable = path.join(root, "outputs", "knowledge");
  await mkdir(readable, { recursive: true });
  await mkdir(writable, { recursive: true });
  return {
    runId: "run-1",
    kind,
    node: kind,
    iteration: 1,
    attempt: 1,
    prompt,
    workspace: { root, readableRoots: [readable], writableRoots: [writable] },
    artifacts: [],
  } satisfies AgentRunInput;
}

function runner(options: ConstructorParameters<typeof CompanyCodeAgentCliRunner>[1] = {}) {
  return new CompanyCodeAgentCliRunner(new NoopCodeAgentAuthProvider(), {
    cliPath: "bash",
    cliArgsPrefix: [fixture],
    ...options,
  });
}

describe("CompanyCodeAgentCliRunner", () => {
  it("runs through stdin, extracts the session, and snapshots changed files", async () => {
    const result = await runner().run(await inputFor("doc-gen"));
    const final = JSON.parse(result.finalResponse) as Record<string, unknown>;

    expect(final.tools).toBe("Read,Write,Glob,Grep");
    expect(final.dontAsk).toBe(true);
    expect(final.dangerous).toBe(false);
    expect(final.bare).toBe(false);
    expect(result.threadId).toBe("fake-session-id");
    expect(result.files).toEqual([
      expect.objectContaining({
        relativePath: "outputs/knowledge/generated.md",
        mediaType: "text/markdown",
      }),
    ]);
    expect(result.metadata?.reportedFileChanges).toHaveLength(1);
  });

  it("resumes a session and only enables dangerous switches explicitly", async () => {
    const input = await inputFor("code");
    const result = await runner({ bare: true, dangerouslySkipPermissions: true }).resume({
      ...input,
      existingThreadId: "existing-session",
    });
    const final = JSON.parse(result.finalResponse) as Record<string, unknown>;

    expect(final.tools).toBe("Read,Write,Edit,Bash,Glob,Grep");
    expect(final.resumed).toBe(true);
    expect(final.bare).toBe(true);
    expect(final.dangerous).toBe(true);
    expect(result.threadId).toBe("existing-session");
  });

  it("keeps review nodes read-only", async () => {
    const result = await runner().run(await inputFor("review"));
    const final = JSON.parse(result.finalResponse) as Record<string, unknown>;

    expect(final.tools).toBe("Read,Glob,Grep");
    expect(result.files).toEqual([]);
  });

  it("classifies invalid sessions", async () => {
    await expect(runner().run(await inputFor("doc-gen", "CLI_FAILURE"))).rejects.toMatchObject({
      name: "CodeAgentCliError",
      kind: "invalid_session",
    } satisfies Partial<CodeAgentCliError>);
  });

  it("terminates a timed-out process", async () => {
    await expect(
      runner({ timeoutMs: 50, terminateGraceMs: 50 }).run(await inputFor("doc-gen", "DELAY")),
    ).rejects.toMatchObject({ kind: "timeout" } satisfies Partial<CodeAgentCliError>);
  });
});
