/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：阶段角色只接收已校验内联工件，模型工作区不包含参考仓库。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentProvider } from '../../application/ports/ApplicationPorts.ts';
import type { AgentCommand } from '../../domain/agents/AgentContracts.ts';
import type { ModelExecutionPort } from '../../domain/agents/AgentExecution.ts';
import { sha256 } from '../../domain/Domain.ts';
import { assertModelOutput } from './ModelExecution.ts';
import { modelProcessLane } from './ModelProcessLane.ts';
export function materialModelExecution(provider: AgentProvider, command: AgentCommand, root: string): ModelExecutionPort {
  return { assertOutput: assertModelOutput, execute: async (request, signal) => {
    signal?.throwIfAborted();
    if (request.role !== command.agentType || request.readablePaths.length || request.tools.some((tool) => tool !== 'read_material')) throw new Error('AGENT_CAPABILITY_DENIED');
    const key = `${command.generationKey}:${request.stage ?? 'execute'}`;
    const workspaceRoot = join(root, sha256(key));
    await mkdir(workspaceRoot, { recursive: true, mode: 0o700 });
    const path = join(workspaceRoot, '.flywheel-workspace.json');
    const manifest = JSON.stringify({ schemaVersion: '1.0', role: request.role, readablePaths: [], files: [] });
    try { await writeFile(path, manifest, { flag: 'wx', mode: 0o400 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(path, 'utf8') !== manifest) throw error; }
    return modelProcessLane.execute(() => provider.run({ role: request.role, prompt: request.prompt, outputSchema: request.outputSchema,
      maxTokens: request.maxTokens, authorizedTools: [], idempotencyKey: key, command, workspaceRoot,
      metadata: { runId: command.runId, nodeId: request.role, stage: request.stage ?? 'execute', commandId: command.commandId },
    }, signal), signal);
  } };
}
