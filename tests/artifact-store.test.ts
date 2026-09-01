import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalFileArtifactStore } from "../src/platform/local-artifact-store.js";
import { createTestRuntime } from "./helpers.js";

describe("LocalFileArtifactStore", () => {
  it("writes atomically and detects tampering by SHA-256", async () => {
    const { root } = await createTestRuntime();
    const store = new LocalFileArtifactStore(path.join(root, "artifact-test"));
    const ref = await store.put({
      runId: "run-1",
      node: "doc-gen",
      relativePath: "knowledge.md",
      content: "verified content",
      mediaType: "text/markdown",
      iteration: 1,
      attempt: 1,
    });

    expect(await store.verify(ref)).toBe(true);
    await mkdir(path.dirname(ref.absolutePath), { recursive: true });
    await writeFile(ref.absolutePath, "tampered", "utf8");
    expect(await store.verify(ref)).toBe(false);
  });

  it("rejects paths escaping the node directory", async () => {
    const { root } = await createTestRuntime();
    const store = new LocalFileArtifactStore(path.join(root, "artifact-test"));
    await expect(
      store.put({
        runId: "run-1",
        node: "doc-gen",
        relativePath: "../../escape.txt",
        content: "bad",
        iteration: 1,
        attempt: 1,
      }),
    ).rejects.toThrow("escapes");
  });
});
