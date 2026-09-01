import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ArtifactRef, ArtifactWrite } from "../domain/types.js";
import type { ArtifactStore } from "./contracts.js";

function safeSegment(value: string, label: string): string {
  if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\")) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

function ensureInside(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Artifact path escapes its node workspace: ${target}`);
  }
}

export class LocalFileArtifactStore implements ArtifactStore {
  public readonly root: string;

  public constructor(root = path.resolve(".agent-runs")) {
    this.root = path.resolve(root);
  }

  public async put(input: ArtifactWrite): Promise<ArtifactRef> {
    const runId = safeSegment(input.runId, "runId");
    const node = safeSegment(input.node, "node");
    if (path.isAbsolute(input.relativePath)) {
      throw new Error("Artifact relativePath must be relative");
    }

    const nodeRoot = path.join(
      this.root,
      runId,
      node,
      `iteration-${input.iteration}`,
      `attempt-${input.attempt}`,
    );
    const target = path.resolve(nodeRoot, input.relativePath);
    ensureInside(nodeRoot, target);
    await mkdir(path.dirname(target), { recursive: true });

    const bytes =
      typeof input.content === "string"
        ? Buffer.from(input.content, "utf8")
        : Buffer.from(input.content);
    const temporary = `${target}.tmp-${randomUUID()}`;
    await writeFile(temporary, bytes);
    await rename(temporary, target);

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return {
      id: randomUUID(),
      runId,
      node,
      relativePath: path.relative(path.join(this.root, runId), target),
      absolutePath: target,
      mediaType: input.mediaType ?? "application/octet-stream",
      size: bytes.byteLength,
      sha256,
      iteration: input.iteration,
      attempt: input.attempt,
      createdAt: new Date().toISOString(),
    };
  }

  public async get(ref: ArtifactRef): Promise<Uint8Array> {
    return readFile(ref.absolutePath);
  }

  public async verify(ref: ArtifactRef): Promise<boolean> {
    try {
      const bytes = await readFile(ref.absolutePath);
      const digest = createHash("sha256").update(bytes).digest("hex");
      return bytes.byteLength === ref.size && digest === ref.sha256;
    } catch {
      return false;
    }
  }

  public async commitNode(input: {
    runId: string;
    node: string;
    iteration: number;
    attempt: number;
    artifacts: ArtifactRef[];
  }): Promise<string> {
    const markerRoot = path.join(
      this.root,
      safeSegment(input.runId, "runId"),
      safeSegment(input.node, "node"),
      `iteration-${input.iteration}`,
      `attempt-${input.attempt}`,
    );
    await mkdir(markerRoot, { recursive: true });
    const markerPath = path.join(markerRoot, ".complete.json");
    const marker = {
      runId: input.runId,
      node: input.node,
      iteration: input.iteration,
      attempt: input.attempt,
      artifacts: input.artifacts.map(({ id, relativePath, sha256 }) => ({
        id,
        relativePath,
        sha256,
      })),
      committedAt: new Date().toISOString(),
    };
    const temporary = `${markerPath}.tmp-${randomUUID()}`;
    await writeFile(temporary, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
    await rename(temporary, markerPath);
    return markerPath;
  }
}
