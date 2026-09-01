import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRuntime } from "domain-knowledge-agent-framework";
import { configureCodexProvider } from "../dist/index.js";

test("injects a Codex-compatible runner without changing the core graph", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-provider-test-"));
  let calls = 0;
  try {
    const runtime = await createRuntime({
      checkpointer: "memory",
      artifactRoot: path.join(root, "runs"),
      configureRunners: configureCodexProvider("doc-gen", {
        runner: {
          async run() {
            calls += 1;
            return { finalResponse: "provider-result", files: [] };
          },
        },
      }),
    });
    const handle = await runtime.service.startRun({ runId: "codex-provider" });
    const result = await runtime.service.waitForRun(handle.runId);

    assert.equal(result.status, "completed");
    assert.equal(calls, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
