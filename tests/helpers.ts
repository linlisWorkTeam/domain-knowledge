import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { createRuntime } from "../src/runtime/composition.js";
import type { RuntimeOptions } from "../src/runtime/composition.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

export async function createTestRuntime(options: RuntimeOptions = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "domain-knowledge-test-"));
  temporaryRoots.push(root);
  const runtime = await createRuntime({
    ...options,
    checkpointer: "memory",
    artifactRoot: path.join(root, "runs"),
  });
  return { root, ...runtime };
}

export async function createSqliteTestRuntime(root?: string) {
  const actualRoot = root ?? (await mkdtemp(path.join(os.tmpdir(), "domain-knowledge-sqlite-")));
  if (!root) temporaryRoots.push(actualRoot);
  const runtime = await createRuntime({
    artifactRoot: path.join(actualRoot, "runs"),
    sqlitePath: path.join(actualRoot, "checkpoint.sqlite"),
  });
  return { root: actualRoot, ...runtime };
}
