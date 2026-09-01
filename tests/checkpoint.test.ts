import { describe, expect, it } from "vitest";
import { createSqliteTestRuntime } from "./helpers.js";

describe("SQLite checkpoint", () => {
  it("restores status and artifacts in a new runtime without rerunning completed nodes", async () => {
    const first = await createSqliteTestRuntime();
    const handle = await first.service.startRun({ runId: "sqlite-run", workerCount: 1 });
    const completed = await first.service.waitForRun(handle.runId);
    const firstArtifacts = await first.service.getRunArtifacts(handle.runId);
    expect(completed.status).toBe("completed");

    const second = await createSqliteTestRuntime(first.root);
    const restored = await second.service.getRunStatus(handle.runId);
    const secondArtifacts = await second.service.getRunArtifacts(handle.runId);
    expect(restored.status).toBe("completed");
    expect(secondArtifacts.map((item) => item.sha256)).toEqual(
      firstArtifacts.map((item) => item.sha256),
    );

    await second.service.resumeRun(handle.runId);
    expect(second.fakeRunner.calls).toHaveLength(0);
  });
});
