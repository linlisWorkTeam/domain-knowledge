/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：交接固定源码、接口和现有DocGen角色，逐卡提交并保留恢复材料。
 */
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import { executeAgent } from '../../domain/services/workflow/AgentExecutionService.ts';
import type { AgentCommand } from '../../domain/agents/AgentContracts.ts';
import type { Material, StageAttempt } from '../../domain/agents/AgentExecution.ts';
import { knowledgeUnits, cardBodyWithSource } from '../../domain/services/knowledge/KnowledgeUnits.ts';
import { canonicalJson, type JsonValue } from '../../domain/services/workbench/StageTask.ts';
import type { ArtifactStore, AgentContractValidator } from '../ports/ApplicationPorts.ts';
import type { NativeLanguageToolchain } from '../ports/LanguageToolchainPorts.ts';
import type { StageConfigurationProvider, StageModelConfiguration, StageModelFactory } from '../ports/WorkbenchGenerationPorts.ts';
import type { WorkbenchProjectStore } from '../ports/WorkbenchProjectPorts.ts';
import type { KnowledgeFlywheelService } from './ApplicationServices.ts';
import type { WorkbenchStages, StageExecutionContext } from './WorkbenchStages.ts';
import { commitRoleArtifacts } from './RoleArtifacts.ts';

export interface GenerationScope { entryPath?: string; astFilter?: string; symbols?: string[] }
interface Dependencies {
  projects: WorkbenchProjectStore; artifacts: ArtifactStore; configuration: StageConfigurationProvider;
  native: NativeLanguageToolchain; model: StageModelFactory; contracts: AgentContractValidator;
  flywheel: KnowledgeFlywheelService; stages: WorkbenchStages;
}
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export class WorkbenchGeneration {
  readonly dependencies: Dependencies;
  constructor(dependencies: Dependencies) { this.dependencies = dependencies; }
  async start(snapshotId: string, scopes: Record<string, GenerationScope> = {}) {
    const { projects, artifacts, configuration, stages } = this.dependencies;
    const project = projects.get(snapshotId); if (!project) throw new Error('PROJECT_INPUT_NOT_FOUND');
    if (!scopes || typeof scopes !== 'object' || Array.isArray(scopes)) throw new Error('GENERATION_SCOPE_INVALID');
    for (const [moduleId, scope] of Object.entries(scopes)) {
      if (!project.modules.some((module) => module.moduleId === moduleId) || !scope || typeof scope !== 'object' || Array.isArray(scope)
        || Object.keys(scope).some((key) => !['entryPath', 'astFilter', 'symbols'].includes(key))
        || (scope.entryPath !== undefined && typeof scope.entryPath !== 'string') || (scope.astFilter !== undefined && typeof scope.astFilter !== 'string')
        || (scope.symbols !== undefined && (!Array.isArray(scope.symbols) || scope.symbols.some((symbol) => typeof symbol !== 'string')))) throw new Error('GENERATION_SCOPE_INVALID');
    }
    const frozen = await configuration.captureStage();
    const configurationRef = await artifacts.put(Buffer.from(canonicalJson(frozen)), 'application/json');
    return stages.start({ projectId: project.projectId, stage: 'GENERATE', sourceRevision: project.commit, sourceDigest: project.sourceDigest,
      cardVersionIds: [], configurationDigest: configurationRef.sha256, parameters: { snapshotId, configurationRef: json(configurationRef), scopes: json(scopes) } });
  }
  async generate(context: StageExecutionContext) {
    const { projects, artifacts, configuration, native, model, contracts, flywheel, stages } = this.dependencies;
    const start = performance.now(); const now = () => context.task.usage.elapsedMs + Math.floor(performance.now() - start);
    const project = projects.get(String(context.task.input.parameters.snapshotId)); if (!project) throw new Error('PROJECT_INPUT_NOT_FOUND');
    if (project.commit !== context.task.input.sourceRevision || project.sourceDigest !== context.task.input.sourceDigest) throw new Error('STAGE_INPUT_CHANGED');
    const load = async (ref: ArtifactRef) => {
      if (!await artifacts.verify(ref)) throw new Error('GENERATION_ARTIFACT_CORRUPT');
      return Buffer.from(await artifacts.get(ref)).toString('utf8');
    };
    const configurationRef = context.task.input.parameters.configurationRef as unknown as ArtifactRef;
    if (configurationRef.sha256 !== context.task.input.configurationDigest) throw new Error('STAGE_INPUT_CHANGED');
    const frozen = JSON.parse(await load(configurationRef)) as StageModelConfiguration;
    await configuration.assertStageCompatible(frozen);
    const prompt = frozen.agents.find((agent) => agent.agentId === 'doc-gen'); if (!prompt) throw new Error('RUN_CONFIGURATION_INCOMPATIBLE');
    const effectivePrompt = await load(prompt.effectivePromptRef);
    if (sha256(effectivePrompt) !== prompt.effectivePromptSha256) throw new Error('GENERATION_ARTIFACT_CORRUPT');
    const scopes = context.task.input.parameters.scopes as unknown as Record<string, GenerationScope>;
    const allSources: Array<{ path: string; content: string }> = [];
    for (const file of project.sourceFiles.filter((file) => file.kind === 'source')) allSources.push({ path: file.path, content: await load(file.ref) });
    const cards: JsonValue[] = []; const resultRefs: ArtifactRef[] = [];
    for (const module of project.modules) {
      context.signal.throwIfAborted();
      if (!['c', 'cpp'].includes(module.language)) throw new Error('GENERATION_LANGUAGE_UNSUPPORTED');
      const scope = scopes[module.moduleId] ?? {};
      const entryPath = scope.entryPath ?? module.sourcePaths.find((path) => /\.(h|hpp|hh|hxx)$/.test(path)) ?? module.sourcePaths[0]!;
      if (!module.sourcePaths.includes(entryPath)) throw new Error('GENERATION_SCOPE_INVALID');
      context.progress({ phase: 'interfaces', module: module.moduleId });
      const prepared = await context.step(`interface:${sha256(module.moduleId)}`, async () => {
        try {
          const value = await native.publicInterface({ language: module.language as 'c' | 'cpp', files: allSources, build: project.build, entryPath,
            ...(scope.symbols ? { symbols: scope.symbols } : {}), ...(scope.astFilter ? { astFilter: scope.astFilter } : {}) }, context.signal);
          const ref = await artifacts.put(Buffer.from(JSON.stringify(value)), 'application/json');
          return { artifactRefs: [ref], summary: { module: module.moduleId, declarations: value.declarations.length } };
        } catch (error) {
          if (error instanceof Error && error.cause) {
            const ref = await artifacts.put(Buffer.from(JSON.stringify(error.cause)), 'application/json');
            context.progress({ phase: 'interface-failed', module: module.moduleId, diagnosticRef: json(ref) });
          }
          throw error;
        }
      });
      const interfaceRef = prepared.artifactRefs[0]!;
      const publicInterface = JSON.parse(await load(interfaceRef)) as Awaited<ReturnType<NativeLanguageToolchain['publicInterface']>>;
      const units = knowledgeUnits(project.repositoryId, module.moduleId, publicInterface.declarations);
      if (!units.length || units.length > 100) throw new Error('GENERATION_UNITS_INVALID');
      const sourceFiles = project.sourceFiles.filter((file) => module.sourcePaths.includes(file.path));
      if (sourceFiles.reduce((sum, file) => sum + file.ref.size, 0) > 1_048_576) throw new Error('GENERATION_MATERIAL_TOO_LARGE');
      for (const unit of units) {
        context.progress({ phase: 'card', cardId: unit.cardId, symbol: unit.symbol, completed: cards.length });
        const completed = await context.step(`card:${unit.cardId}`, async (key) => {
          const unitFact = { schemaVersion: 'knowledge-unit-v1', unit, repositoryId: project.repositoryId, commit: project.commit,
            sourceFiles, build: project.build, interfaceRef };
          const unitRef = await artifacts.put(Buffer.from(JSON.stringify(unitFact)), 'application/json');
          const payload = { moduleId: unit.storageModuleId, sourceRefs: sourceFiles.map((file) => file.ref), publicInterfaceRefs: [interfaceRef], workerFragmentRefs: [unitRef] };
          const command: AgentCommand = { schemaVersion: '1.0', runId: context.task.taskId, agentType: 'doc-gen', commandId: `cmd-${sha256(key)}`, generationKey: key, payload };
          contracts.assertCommand(command);
          const commandRef = await artifacts.put(Buffer.from(JSON.stringify(command, null, 2)), 'application/json');
          const materials: Material[] = [{ ref: unitRef, content: unitFact }, { ref: interfaceRef, content: publicInterface }];
          for (const file of sourceFiles) materials.push({ ref: file.ref, content: await load(file.ref) });
          const underlying = model(command, frozen, (operationId, tokens) => {
            if (tokens !== null) context.account(`provider:${operationId}`, { tokens });
            context.progress({ phase: 'usage', cardId: unit.cardId, tokensReported: tokens !== null });
          });
          const role = await executeAgent({ payload, materials, sourcePaths: [], publicInterfacePaths: [], provenance: payload.sourceRefs, moduleId: unit.storageModuleId }, {
            command, effectivePrompt, iteration: 0, signal: context.signal, now, resumeOperationalFailures: frozen.policy.resumeOperationalFailures,
            model: { assertOutput: (output, schema) => underlying.assertOutput(output, schema), execute: async (request, signal) => {
              context.account(`${unit.cardId}:${request.stage}`, { modelCalls: 1, reservedTokens: Buffer.byteLength(request.prompt) + (request.maxTokens ?? 32768) + 4096 });
              return underlying.execute(request, signal);
            } },
            stageJournal: {
              read: async (stage) => {
                const latest = new Map<number, StageAttempt>();
                for (const event of stages.store.events(context.task.taskId)) {
                  const detail = event.detail;
                  if (!detail || Array.isArray(detail) || typeof detail !== 'object' || detail.phase !== 'role-attempt' || detail.cardId !== unit.cardId || detail.roleStage !== stage) continue;
                  const attempt = JSON.parse(await load(detail.attemptRef as unknown as ArtifactRef)) as StageAttempt;
                  if (attempt.schemaVersion !== 'role-stage-v1' || attempt.stage !== stage) throw new Error('AGENT_STAGE_JOURNAL_INVALID');
                  latest.set(attempt.attempt, attempt);
                }
                return [...latest.values()].sort((a, b) => a.attempt - b.attempt);
              },
              record: async (attempt) => {
                const ref = await artifacts.put(Buffer.from(JSON.stringify(attempt)), 'application/json');
                context.progress({ phase: 'role-attempt', cardId: unit.cardId, roleStage: attempt.stage, status: attempt.status, attemptRef: json(ref) });
              },
            },
          });
          const committed = await commitRoleArtifacts(artifacts, contracts, command, commandRef, role, (agent) => agent,
            () => { throw new Error('WORKBENCH_AGENT_GENERATION_UNBOUND'); }, context.signal);
          const output = role.output as { body: string; title: string; description: string };
          const candidate = await flywheel.ingestCandidate({ moduleId: unit.storageModuleId,
            body: cardBodyWithSource(output.body, project.commit, unit.symbol), title: output.title, description: output.description,
            tags: [module.language, module.moduleId, unit.symbol], provenance: sourceFiles.map((file) => ({ path: file.path, commit: project.commit, symbol: unit.symbol, pinned: true })),
            metadata: { cardId: unit.cardId, repositoryId: project.repositoryId, sourceModule: module.moduleId, language: module.language,
              symbol: unit.symbol, projectSnapshotId: project.snapshotId, stageTaskId: context.task.taskId, interfaceRef, roleResultRef: committed.resultRef } });
          return { artifactRefs: [committed.resultRef, candidate.version.bodyRef], summary: { cardId: unit.cardId, versionId: candidate.version.versionId,
            title: candidate.version.title, quality: candidate.quality.outcome, evaluated: false } };
        });
        cards.push(completed.summary); resultRefs.push(...completed.artifactRefs);
      }
    }
    return { artifactRefs: resultRefs, summary: { snapshotId: project.snapshotId, cards, generated: cards.length, evaluated: false } };
  }
}
