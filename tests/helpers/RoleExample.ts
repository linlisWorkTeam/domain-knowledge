/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护Role样例相关的项目配置与工程说明。
 */
import { readFileSync } from 'node:fs';
import { sha256, type ArtifactRef } from '../../src/domain/Domain.ts';
import type { AgentId } from '../../src/domain/agents/AgentContracts.ts';
import type { ExecutionContext, Material, ModelRequest } from '../../src/domain/agents/AgentExecution.ts';
import { roleDefinitions } from '../../src/domain/agents/AgentRegistry.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';

export function roleExamplePath(role: AgentId): string {
  const name = role.split('-').map((part) => part[0]!.toUpperCase() + part.slice(1)).join('') + 'Agent';
  const directory = name[0]!.toLowerCase() + name.slice(1);
  return `src/domain/agents/${directory}/examples/${name}Sample.json`;
}

export function roleExample<I>(role: AgentId) {
  const sample = JSON.parse(readFileSync(roleExamplePath(role), 'utf8'));
  const materials: Material[] = [];
  const named = new Map<string, ArtifactRef>();
  for (const [name, value] of Object.entries(sample.materials)) {
    const material = value as { content: unknown; mediaType: string };
    const bytes = JSON.stringify(material.content);
    const ref: ArtifactRef = { artifactId: `sha256:${sha256(bytes)}`, sha256: sha256(bytes), mediaType: material.mediaType, size: Buffer.byteLength(bytes) };
    named.set(name, ref); materials.push({ ref, content: material.content });
  }
  const bind = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    if ('material' in value) return named.get(String(value.material));
    if (Array.isArray(value)) return value.map(bind);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, bind(item)]));
  };
  const payload = bind(sample.payload) as Record<string, unknown>;
  const requests: ModelRequest[] = [];
  const phases: string[] = [];
  const controller = new AbortController();
  const context: ExecutionContext = {
    command: { schemaVersion: '1.0', commandId: 'command', runId: 'run', agentType: role, generationKey: 'development-command-0', payload },
    model: { execute: async (request) => { phases.push('model'); requests.push(request); return structuredClone(sample.modelStages?.[request.stage?.split(':')[0] ?? 'execute'] ?? sample.modelOutput); },
      assertOutput: (output, schema) => { phases.push('validate'); assertModelOutput(output, schema); } },
    effectivePrompt: roleDefinitions.find((definition) => definition.agentId === role)!.basePrompt,
    iteration: sample.iteration, signal: controller.signal,
  };
  const input = { payload, materials, sourcePaths: sample.scenario.sourcePaths,
    publicInterfacePaths: sample.scenario.publicInterfacePaths, provenance: materials.map(({ ref }) => ref), moduleId: sample.scenario.moduleId } as I;
  return { input, context, requests, phases, controller, output: sample.modelOutput, expectedOutput: sample.expectedOutput ?? sample.modelOutput, modelStages: sample.modelStages };
}
