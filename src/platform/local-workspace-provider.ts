import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceHandle } from "../domain/types.js";
import type { WorkspaceProvider, WorkspaceRequest } from "./contracts.js";

export class LocalWorkspaceProvider implements WorkspaceProvider {
  public constructor(private readonly artifactRoot = path.resolve(".agent-runs")) {}

  public async prepare(input: WorkspaceRequest): Promise<WorkspaceHandle> {
    const suffix = input.workerId ? `${input.node}-${input.workerId}` : input.node;
    const root = path.join(
      this.artifactRoot,
      input.runId,
      "workspaces",
      suffix,
      `iteration-${input.iteration}`,
      `attempt-${input.attempt}`,
    );
    await mkdir(root, { recursive: true });
    const inputRoot = path.join(root, "inputs");
    const outputRoot = path.join(root, "outputs");
    await mkdir(inputRoot, { recursive: true });
    await mkdir(outputRoot, { recursive: true });
    const projectedArtifacts: Array<{
      id: string;
      sourceNode: string;
      sourcePath: string;
      projectedPath: string;
      sha256: string;
    }> = [];
    for (const [index, artifact] of input.visibleArtifacts.entries()) {
      const filename = `${String(index).padStart(3, "0")}-${path.basename(artifact.relativePath)}`;
      const projectedPath = path.join(inputRoot, filename);
      await copyFile(artifact.absolutePath, projectedPath);
      await chmod(projectedPath, 0o444);
      projectedArtifacts.push({
        id: artifact.id,
        sourceNode: artifact.node,
        sourcePath: artifact.relativePath,
        projectedPath,
        sha256: artifact.sha256,
      });
    }
    for (const writableRoot of input.writableRoots) {
      await mkdir(path.join(outputRoot, writableRoot), { recursive: true });
    }
    await writeFile(
      path.join(root, ".workspace-policy.json"),
      `${JSON.stringify(
        {
          node: input.node,
          readableRoots: input.readableRoots,
          writableRoots: input.writableRoots,
          projectedArtifacts,
          interactiveApprovals: false,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    return {
      root,
      readableRoots: [inputRoot],
      writableRoots: input.writableRoots.map((entry) => path.join(outputRoot, entry)),
    };
  }
}
