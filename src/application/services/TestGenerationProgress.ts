/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：持久化 TestGen 计划及批次，恢复时复用相同冻结输入下的已提交进度。
 */
import type { TestGenerationProgress } from '../../domain/agents/testGenAgent/TestGenAgentContract.ts';
import type { AgentCommand } from '../../domain/agents/AgentContracts.ts';
import { assertActive } from '../../domain/agents/AgentExecution.ts';
import type { ArtifactRef } from '../../domain/Domain.ts';
import type { KnowledgeFlywheelService } from './ApplicationServices.ts';

export class PersistentTestGeneration implements TestGenerationProgress {
  readonly flywheel: KnowledgeFlywheelService;
  readonly command: AgentCommand;
  readonly nodeId: string;
  readonly commandRef: ArtifactRef;
  readonly signal?: AbortSignal;
  constructor(flywheel: KnowledgeFlywheelService, command: AgentCommand,
    nodeId: string, commandRef: ArtifactRef, signal?: AbortSignal) {
    this.flywheel = flywheel; this.command = command; this.nodeId = nodeId;
    this.commandRef = commandRef; this.signal = signal;
  }

  async run(step: string, input: unknown, operation: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> {
    assertActive(this.signal);
    if (!/^(plan|batch-[1-9][0-9]*)$/.test(step)) throw new Error('TESTGEN_STEP_INVALID');
    const requestRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(input)), 'application/json');
    const checkpoint = await this.flywheel.executeNode({ runId: this.command.runId, nodeId: `${this.nodeId}/${step}`,
      generationKey: `${this.command.generationKey}:testgen-${step}:batches-v1`, inputRefs: [this.commandRef, requestRef],
    }, async () => {
      const output = await operation();
      assertActive(this.signal);
      const outputRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(output)), 'application/json');
      assertActive(this.signal);
      return [outputRef];
    });
    assertActive(this.signal);
    const ref = checkpoint.outputRefs[0];
    if (!ref || !(await this.flywheel.artifacts.verify(ref))) throw new Error('TESTGEN_PROGRESS_INTEGRITY_INVALID');
    return JSON.parse(Buffer.from(await this.flywheel.getArtifact(ref)).toString('utf8'));
  }
}
