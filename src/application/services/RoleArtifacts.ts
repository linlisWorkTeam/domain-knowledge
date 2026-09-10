/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：旧飞轮与新阶段共用角色结果和待提交工件的引用绑定。
 */
import type { ArtifactStore, AgentContractValidator } from '../ports/ApplicationPorts.ts';
import type { AgentCommand, AgentResult, AgentId } from '../../domain/agents/AgentContracts.ts';
import type { RoleResult } from '../../domain/agents/AgentExecution.ts';
import { assertActive } from '../../domain/agents/AgentExecution.ts';
import type { ArtifactRef } from '../../domain/Domain.ts';
export async function commitRoleArtifacts(artifacts: ArtifactStore, contracts: AgentContractValidator, command: AgentCommand,
  commandRef: ArtifactRef, roleResult: RoleResult<unknown>, nodeFor: (role: AgentId) => string,
  generationFor: (role: AgentId) => string, signal?: AbortSignal) {
  const rawRef = await artifacts.put(Buffer.from(JSON.stringify(roleResult.output, null, 2)), 'application/json');
  // 先保存标准化角色结果与声明工件；阶段模型原文已由 stageJournal 单独留证。
  const refs = new Map<string, ArtifactRef>([['raw', rawRef]]);
  for (const artifact of roleResult.artifacts) {
    if (refs.has(artifact.key)) throw new Error('AGENT_PENDING_ARTIFACT_DUPLICATED');
    refs.set(artifact.key, await artifacts.put(Buffer.from(artifact.content), artifact.mediaType));
  }
  // 只做通用引用绑定，不在这里维护七角色的业务分支或决定图连接。
  const bind = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    if ('agentNode' in value) return nodeFor(value.agentNode as AgentId);
    if ('agentGeneration' in value) return generationFor(value.agentGeneration as AgentId);
    if ('pendingArtifact' in value) {
      const ref = refs.get(String(value.pendingArtifact));
      if (!ref) throw new Error('AGENT_PENDING_ARTIFACT_MISSING');
      return ref;
    }
    if (Array.isArray(value)) return value.map(bind);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, bind(item)]));
  };
  const result: AgentResult = {
    rawOutputRef: rawRef,
    schemaVersion: '1.0', commandId: command.commandId, commandRef,
    runId: command.runId, agentType: command.agentType, status: 'SUCCEEDED',
    outputRefs: uniqueRefs([...refs.values()]), payload: bind(roleResult.payload) as Record<string, unknown>,
  };
  // 保存结果信封前再次校验对外契约，取消或失败时不能提交成功 checkpoint。
  contracts.assertResult(result);
  const resultRef = await artifacts.put(Buffer.from(JSON.stringify(result, null, 2)), 'application/json');
  assertActive(signal);
  return { result, resultRef, rawRef };
}
function uniqueRefs(refs: ArtifactRef[]): ArtifactRef[] {
  return [...new Map(refs.map((ref) => [ref.artifactId, ref])).values()].sort((a, b) => a.artifactId.localeCompare(b.artifactId));
}
