import type {
  ArtifactRef,
  ArtifactWrite,
  WorkspaceHandle,
} from "../domain/types.js";

export interface ArtifactStore {
  put(input: ArtifactWrite): Promise<ArtifactRef>;
  get(ref: ArtifactRef): Promise<Uint8Array>;
  verify(ref: ArtifactRef): Promise<boolean>;
  commitNode(input: {
    runId: string;
    node: string;
    iteration: number;
    attempt: number;
    artifacts: ArtifactRef[];
  }): Promise<string>;
}

export interface WorkspaceRequest {
  runId: string;
  node: string;
  iteration: number;
  attempt: number;
  workerId?: string;
  visibleArtifacts: ArtifactRef[];
  readableRoots: string[];
  writableRoots: string[];
}

export interface WorkspaceProvider {
  prepare(input: WorkspaceRequest): Promise<WorkspaceHandle>;
}

export interface ApprovalRequest {
  runId: string;
  node: string;
  action: string;
}

export type ApprovalDecision = "approved" | "denied";

export interface ApprovalProvider {
  request(input: ApprovalRequest): Promise<ApprovalDecision>;
}

export class DenyAllApprovalProvider implements ApprovalProvider {
  public async request(_input: ApprovalRequest): Promise<ApprovalDecision> {
    return "denied";
  }
}
