/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供Composition的外部入口、参数转换与响应处理。
 */
import { AgentExampleService } from '../../application/services/AgentExample.ts';
import { NODE_BY_AGENT } from '../../domain/services/workflow/AgentDefinitions.ts';
import { assertModelOutput, modelExecutionFactory } from '../../infrastructure/agentAdapters/ModelExecution.ts';
import { appendFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ContentGovernanceApp, EvalRunnerApp, FlywheelApp, KnowledgeDiscoveryApp, KnowledgeSearchApp,
  OperationalMetricsApp, Orchestrator, ProviderOperationsApp,
} from '../../application/apps/ApplicationApps.ts';
import {
  AGENT_COMMAND_SCHEMA_ID, AGENT_RESULT_SCHEMA_ID, AgentCatalogService,
  AutomatedProjectWorkflowService, DeterministicQualityPolicy, ProjectWorkflowStages,
  RegistryRunConfigurationService, RegistryWorkflowObserver,
} from '../../application/services/ApplicationServices.ts';
import { createEvent, sha256 } from '../../domain/Domain.ts';
import type { AutomatedProjectScenario } from '../../application/services/ApplicationServices.ts';
import type {
  OperationalMetricsPort, ProviderConnectionProbe, ProviderEndpointPolicy, ProviderSettingsStore,
} from '../../application/ports/ApplicationPorts.ts';
import { DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS } from '../../infrastructure/langgraph/LangGraph.ts';
import { createDomainKnowledgeInfrastructure } from '../../infrastructure/langgraph/LangGraph.ts';
import { TrustedProjectEvaluator } from '../../infrastructure/evaluation/project/TrustedProjectEvaluator.ts';
import {
  DeepSeekHarnessHeadlessAgent, DeepSeekHarnessSdkAgent,
} from '../../infrastructure/agentAdapters/deepSeekHarness/DeepSeekHarnessSdkAgent.ts';
import {
  CompanyCodeAgentCliAdapter, FileCodeAgentSessionStore,
  type CompanyCodeAgentAuditRecord,
} from '../../infrastructure/agentAdapters/companyCodeAgent/CompanyCodeAgentCliAdapter.ts';
import {
  LocalCasArtifactStore, SQLiteFlywheelRepository,
} from '../../infrastructure/sqlite/SqliteCas.ts';
import { SQLiteContentGovernance } from '../../infrastructure/sqlite/SqliteContentGovernance.ts';
import { SourceScanner } from '../../domain/sourceScan/SourceScan.ts';
import { LocalAgentWorkspace } from '../../domain/workspace/LocalAgentWorkspace.ts';
import {
  EncryptedFileProviderSettingsStore, OpenAiCompatibleProviderProbe,
  PublicHttpsEndpointPolicy,
} from '../../infrastructure/agentAdapters/provider/ProviderSettings.ts';
import { ConfiguredDshProvider, DSH_DEFAULT_CONTEXT_WINDOW, DSH_DEFAULT_MAX_SCHEMA_ATTEMPTS, DSH_DEFAULT_MAX_TOKENS } from '../../infrastructure/agentAdapters/deepSeekHarness/ConfiguredProvider.ts';
import { ConcurrentTasks } from '../../infrastructure/agentAdapters/ConcurrentTasks.ts';
import { FixtureProjectWorkflowStages } from '../../infrastructure/agentAdapters/scenario/ProjectWorkflowFixture.ts';
import { writeOpenCodeGoPatch } from '../../infrastructure/agentAdapters/deepSeekHarness/OpencodeGo.ts';
import { JsonSchemaAgentContractValidator } from '../../infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { SQLiteOperationalMetrics } from '../../infrastructure/observability/SqliteOperationalMetrics.ts';
import { migrateLegacyOkf } from '../../domain/migration/LegacyOkf.ts';
import { ConsoleReadModel } from './ConsoleReadModel.ts';
import { buildDemoReport } from './DemoReport.ts';

/** 定义WorkpanelConfig的数据结构与类型约束。 */
export interface WorkpanelConfig {
  /** 提供Schema版本信息，供调用方读取或传入。 */
  schemaVersion: '1.0';
  /** 提供runtimeDir信息，供调用方读取或传入。 */
  runtimeDir: string;
  /** 提供质量门禁信息，供调用方读取或传入。 */
  qualityGate: { threshold: number };
  /** 提供发布门禁信息，供调用方读取或传入。 */
  publicationGate: {
    policyId: string;
    minimumStability: number;
    requireAllTests: boolean;
    maxIterations: number;
  };
  /** 提供server信息，供调用方读取或传入。 */
  server: { host: string; port: number };
  /** 提供acquisition信息，供调用方读取或传入。 */
  acquisition: { roots: string[]; maxCandidates: number };
  /** 提供legacy信息，供调用方读取或传入。 */
  legacy: { knowledgeDir: string };
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
/** 对外提供component根目录，作为调用方使用的统一约定。 */
export const componentRoot = resolve(moduleDirectory, '../../..');
/** 对外提供默认仓库根目录，作为调用方使用的统一约定。 */
export const defaultRepositoryRoot = resolve(
  process.env.WP_KNOWLEDGE_REPOSITORY?.trim() || componentRoot,
);

/** 加载WorkpanelConfig。 */
export function loadWorkpanelConfig(_repositoryRoot = defaultRepositoryRoot): WorkpanelConfig {
  const configPath = process.env.WP_FLYWHEEL_CONFIG
    || join(componentRoot, 'Runner.config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as WorkpanelConfig;
  if (config.schemaVersion !== '1.0') throw new Error(`CONFIG_INVALID: unsupported schemaVersion ${config.schemaVersion}`);
  if (!Number.isFinite(config.qualityGate?.threshold) || config.qualityGate.threshold < 0 || config.qualityGate.threshold > 100) {
    throw new Error('CONFIG_INVALID: qualityGate.threshold must be 0..100');
  }
  if (!config.publicationGate?.policyId) throw new Error('CONFIG_INVALID: publicationGate.policyId is required');
  if (config.publicationGate.minimumStability < 0 || config.publicationGate.minimumStability > 1) {
    throw new Error('CONFIG_INVALID: publicationGate.minimumStability must be 0..1');
  }
  if (!Number.isSafeInteger(config.publicationGate.maxIterations) || config.publicationGate.maxIterations < 0) {
    throw new Error('CONFIG_INVALID: publicationGate.maxIterations must be a non-negative integer');
  }
  if (!Number.isSafeInteger(config.server?.port) || config.server.port < 1 || config.server.port > 65535) {
    throw new Error('CONFIG_INVALID: server.port must be 1..65535');
  }
  if (!Array.isArray(config.acquisition?.roots) || !config.acquisition.roots.every((root) => typeof root === 'string')) {
    throw new Error('CONFIG_INVALID: acquisition.roots must be an array of paths');
  }
  if (!Number.isSafeInteger(config.acquisition.maxCandidates) || config.acquisition.maxCandidates < 1) {
    throw new Error('CONFIG_INVALID: acquisition.maxCandidates must be a positive integer');
  }
  return config;
}

/** 创建Composition。 */
export function createComposition(input: {
  repositoryRoot?: string;
  fixtureAssetRoot?: string;
  agentProviderMode?: 'fixture' | 'deepseek-harness' | 'company-codeagent-cli';
  runtimeDir?: string;
  clock?: () => string;
  providerSettingsStore?: ProviderSettingsStore;
  providerEndpointPolicy?: ProviderEndpointPolicy;
  sourceEndpointPolicy?: ProviderEndpointPolicy;
  allowedSourceHosts?: string[];
  providerProbe?: ProviderConnectionProbe;
  operationalMetrics?: OperationalMetricsPort;
} = {}) {
  const repositoryRoot = resolve(input.repositoryRoot ?? defaultRepositoryRoot);
  const config = loadWorkpanelConfig(repositoryRoot);
  const configuredRuntime = input.runtimeDir ?? process.env.WP_FLYWHEEL_HOME ?? config.runtimeDir;
  const runtimeDir = isAbsolute(configuredRuntime) ? configuredRuntime : join(componentRoot, configuredRuntime);
  const artifacts = new LocalCasArtifactStore(join(runtimeDir, 'cas'));
  const repository = new SQLiteFlywheelRepository(join(runtimeDir, 'registry.sqlite'));
  const runProjections = new ConsoleReadModel(repository.database);
  const flywheelApp = new FlywheelApp({
    artifacts,
    repository,
    qualityPolicy: new DeterministicQualityPolicy(config.qualityGate.threshold),
    runProjections,
    clock: input.clock,
  });
  const evalRunnerApp = new EvalRunnerApp(flywheelApp);
  const knowledgeSearchApp = new KnowledgeSearchApp(artifacts, repository);
  const scanner = new SourceScanner(repositoryRoot, repository);
  const knowledgeDiscoveryApp = new KnowledgeDiscoveryApp(scanner, undefined, {
    migrate: (legacyKnowledgeRoot) => migrateLegacyOkf({
      legacyKnowledgeRoot,
      service: flywheelApp,
    }),
  });
  const contentGovernance = new ContentGovernanceApp(new SQLiteContentGovernance({
    database: repository.database,
    artifacts,
    repositoryRoot,
    configuredRoots: config.acquisition.roots,
    allowedRemoteHosts: input.allowedSourceHosts ?? (process.env.WP_SOURCE_ALLOWED_HOSTS ?? '')
      .split(',').map((host) => host.trim()).filter(Boolean),
    remoteEndpointPolicy: input.sourceEndpointPolicy,
    defaultRule: {
      policyId: config.publicationGate.policyId,
      minimumStability: config.publicationGate.minimumStability,
      requireAllTests: config.publicationGate.requireAllTests,
      maxIterations: config.publicationGate.maxIterations,
    },
    clock: input.clock,
  }));
  const metrics = input.operationalMetrics ?? new SQLiteOperationalMetrics(
    repository.database,
    () => new Date(input.clock?.() ?? Date.now()),
  );
  const operationalMetricsApp = new OperationalMetricsApp(metrics);
  const providerEndpointPolicy = input.providerEndpointPolicy ?? new PublicHttpsEndpointPolicy();
  const configuredMaxTokens = Number(process.env.WP_DSH_MAX_TOKENS ?? DSH_DEFAULT_MAX_TOKENS);
  const configuredMaxSchemaAttempts = Number(
    process.env.WP_DSH_MAX_SCHEMA_ATTEMPTS ?? DSH_DEFAULT_MAX_SCHEMA_ATTEMPTS,
  );
  const configuredContextWindow = Number(
    process.env.WP_DSH_CONTEXT_WINDOW ?? DSH_DEFAULT_CONTEXT_WINDOW,
  );
  if (!Number.isSafeInteger(configuredMaxTokens) || configuredMaxTokens < 1) {
    throw new Error('CONFIG_INVALID: WP_DSH_MAX_TOKENS must be a positive integer');
  }
  if (!Number.isSafeInteger(configuredMaxSchemaAttempts)
    || configuredMaxSchemaAttempts < 1 || configuredMaxSchemaAttempts > 3) {
    throw new Error('CONFIG_INVALID: WP_DSH_MAX_SCHEMA_ATTEMPTS must be 1..3');
  }
  if (!Number.isSafeInteger(configuredContextWindow) || configuredContextWindow < configuredMaxTokens) {
    throw new Error('CONFIG_INVALID: WP_DSH_CONTEXT_WINDOW must be an integer at least WP_DSH_MAX_TOKENS');
  }
  const configuredExecutionParameters = {
    api: 'openai-completions' as const,
    maxTokens: configuredMaxTokens,
    maxSchemaAttempts: configuredMaxSchemaAttempts,
    contextWindow: configuredContextWindow,
  };
  const providerOperations = new ProviderOperationsApp({
    store: input.providerSettingsStore ?? new EncryptedFileProviderSettingsStore(
      join(runtimeDir, 'secrets', 'dsh-provider-settings.enc'),
      join(runtimeDir, 'secrets', 'dsh-provider-settings.key'),
      new EncryptedFileProviderSettingsStore(join(runtimeDir, 'secrets', 'provider-settings.enc'), join(runtimeDir, 'secrets', 'provider-settings.key')),
    ),
    endpointPolicy: providerEndpointPolicy,
    probe: input.providerProbe ?? new OpenAiCompatibleProviderProbe(),
    executionParameters: configuredExecutionParameters,
    clock: input.clock,
    audit: (event) => {
      const domainEvent = createEvent(
        'provider-settings:deepseek-harness', event.eventType, event.payload, event.occurredAt,
      );
      repository.recordOperationalEvent({ ...domainEvent, eventId: event.eventId });
    },
  });
  const agents = new AgentCatalogService({
    definitions: DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS,
    repository,
    clock: input.clock,
  });
  const workflowObserver = new RegistryWorkflowObserver(repository, input.clock);
  const agentProviderMode = input.agentProviderMode || process.env.WP_FLYWHEEL_AGENT_PROVIDER?.trim() || 'deepseek-harness';
  if (!['fixture', 'deepseek-harness', 'deepseek-harness-headless', 'company-codeagent-cli'].includes(agentProviderMode)) {
    throw new Error('CONFIG_INVALID: WP_FLYWHEEL_AGENT_PROVIDER must be fixture, deepseek-harness, deepseek-harness-headless, or company-codeagent-cli');
  }
  const sdkProvider = process.env.WP_DSH_PROVIDER?.trim() || 'deepseek-official';
  const providerModel = agentProviderMode === 'fixture'
    ? 'schema-validated-fixture-v1'
    : agentProviderMode === 'company-codeagent-cli'
      ? process.env.WP_CODEAGENT_MODEL?.trim() || 'company-default'
      : process.env.WP_DSH_MODEL?.trim() || 'deepseek-v4-flash';
  const processIsolation = process.env.WP_DSH_PROCESS_ISOLATION?.trim() || 'bubblewrap';
  if (processIsolation !== 'none' && processIsolation !== 'bubblewrap') {
    throw new Error('CONFIG_INVALID: WP_DSH_PROCESS_ISOLATION must be none or bubblewrap');
  }
  const profile = process.env.WP_DSH_PROFILE?.trim() || 'sdk-minimal';
  const dshBin = process.env.WP_DSH_BIN?.trim() || 'dsh';
  const dshHome = process.env.DSH_HOME?.trim() || join(runtimeDir, 'dsh');
  const bubblewrapCommand = process.env.WP_DSH_BWRAP_COMMAND?.trim() || 'bwrap';
  const timeoutMs = Number(process.env.WP_DSH_TIMEOUT_MS ?? 600_000);
  const maxOutputBytes = Number(process.env.WP_DSH_MAX_OUTPUT_BYTES ?? 2 * 1024 * 1024);
  const maxTokens = Number(process.env.WP_DSH_MAX_TOKENS ?? 32_768);
  const maxSchemaAttempts = Number(process.env.WP_DSH_MAX_SCHEMA_ATTEMPTS ?? 2);
  const allowedRoots = (process.env.WP_DSH_ALLOWED_ROOTS?.split(delimiter) ?? [repositoryRoot])
    .map((root) => root.trim()).filter(Boolean).map((root) => resolve(root));
  const agentWorkspaceRoot = join(runtimeDir, 'agent-workspaces');
  const sdkPatches = process.env.WP_DSH_PATCHES_JSON
    ? JSON.parse(process.env.WP_DSH_PATCHES_JSON) as string[]
    : agentProviderMode === 'deepseek-harness' && sdkProvider === 'opencode-go'
      ? [writeOpenCodeGoPatch({
          runtimeDir, profile, baseURL: process.env.OPENCODE_GO_BASE_URL, model: providerModel, maxTokens,
          contextWindow: process.env.WP_DSH_CONTEXT_WINDOW
            ? Number(process.env.WP_DSH_CONTEXT_WINDOW) : undefined,
        })]
      : [];
  const headlessCommand = process.env.WP_DSH_COMMAND?.trim() || 'dsh';
  const headlessArgs = process.env.WP_DSH_ARGS_JSON
    ? JSON.parse(process.env.WP_DSH_ARGS_JSON) as string[]
    : ['--profile', 'headless'];
  const codeAgentCommand = process.env.WP_CODEAGENT_BIN?.trim() || 'codeagent';
  const codeAgentRunArgs = process.env.WP_CODEAGENT_RUN_ARGS_JSON
    ? JSON.parse(process.env.WP_CODEAGENT_RUN_ARGS_JSON) as string[]
    : ['run'];
  const codeAgentTimeoutMs = Number(process.env.WP_CODEAGENT_TIMEOUT_MS ?? 600_000);
  const codeAgentAuthTimeoutMs = Number(process.env.WP_CODEAGENT_AUTH_TIMEOUT_MS ?? 15_000);
  const codeAgentMaxOutputBytes = Number(process.env.WP_CODEAGENT_MAX_OUTPUT_BYTES ?? 2 * 1024 * 1024);
  const codeAgentAllowedRoots = (process.env.WP_CODEAGENT_ALLOWED_ROOTS?.split(delimiter) ?? [repositoryRoot])
    .map((root) => root.trim()).filter(Boolean).map((root) => resolve(root));
  const patchDigests = agentProviderMode === 'deepseek-harness'
    ? sdkPatches.map((path) => ({ path, sha256: sha256(readFileSync(path)) }))
    : [];
  const providerParameters = agentProviderMode === 'fixture'
    ? { mode: 'fixture', fixtureVersion: '1' }
    : agentProviderMode === 'deepseek-harness'
      ? {
          mode: agentProviderMode,
          dshBin,
          profile,
          patches: patchDigests,
          dshHome,
          provider: sdkProvider,
          model: providerModel,
          maxTokens,
          maxSchemaAttempts,
          processIsolation,
          bubblewrapCommand,
          timeoutMs,
          maxOutputBytes,
          allowedWorkspaceRoots: [...allowedRoots, agentWorkspaceRoot],
        }
      : agentProviderMode === 'deepseek-harness-headless' ? {
          mode: agentProviderMode,
          command: headlessCommand,
          args: headlessArgs,
          timeoutMs,
          maxOutputBytes,
          allowedWorkspaceRoots: [...allowedRoots, agentWorkspaceRoot],
        } : {
          mode: agentProviderMode,
          command: codeAgentCommand,
          runArgs: codeAgentRunArgs,
          model: providerModel,
          timeoutMs: codeAgentTimeoutMs,
          authTimeoutMs: codeAgentAuthTimeoutMs,
          maxOutputBytes: codeAgentMaxOutputBytes,
          allowedWorkspaceRoots: [...codeAgentAllowedRoots, agentWorkspaceRoot],
        };
  providerOperations.executionParameters.runtimeSha256 = sha256(JSON.stringify({
    profile: 'sdk-minimal', processIsolation, bubblewrapCommand, timeoutMs, maxOutputBytes,
    allowedWorkspaceRoots: [...allowedRoots, agentWorkspaceRoot],
    toolPolicy: sha256(readFileSync(new URL('../../infrastructure/agentAdapters/deepSeekHarness/RoleTools.mjs', import.meta.url))),
    runtimeVersion: '0.1.2-alpha.4',
  }));
  const schemaRoot = join(componentRoot, 'docs', 'specs', 'schemas');
  const artifactRefSchemaSha256 = sha256(readFileSync(join(schemaRoot, 'ArtifactRef.schema.json')));
  const correctionSchemaSha256 = sha256(readFileSync(join(schemaRoot, 'Correction.schema.json')));
  const fallbackRunProvider = {
    kind: agentProviderMode,
    model: providerModel,
    parametersSha256: sha256(JSON.stringify(providerParameters)),
  };
  let runConfiguration!: RegistryRunConfigurationService;
  runConfiguration = new RegistryRunConfigurationService({
    definitions: DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS,
    repository,
    artifacts,
    provider: fallbackRunProvider,
    providerResolver: () => providerOperations.runConfigurationProvider(runConfiguration.provider),
    contracts: {
      commandSchema: AGENT_COMMAND_SCHEMA_ID,
      resultSchema: AGENT_RESULT_SCHEMA_ID,
      commandSchemaSha256: sha256(JSON.stringify({
        command: sha256(readFileSync(join(schemaRoot, 'AgentCommand.schema.json'))),
        artifactRef: artifactRefSchemaSha256,
      })),
      resultSchemaSha256: sha256(JSON.stringify({
        result: sha256(readFileSync(join(schemaRoot, 'AgentResult.schema.json'))),
        artifactRef: artifactRefSchemaSha256,
        correction: correctionSchemaSha256,
      })),
    },
    clock: input.clock,
  });
  const projectStages = () => {
      const auditDirectory = join(runtimeDir, 'demo');
      const auditPath = join(auditDirectory, 'agent-runs.jsonl');
      const writeAudit = async (record: Parameters<NonNullable<ConstructorParameters<typeof DeepSeekHarnessSdkAgent>[0]['onAudit']>>[0] | CompanyCodeAgentAuditRecord) => {
        await mkdir(auditDirectory, { recursive: true });
        await appendFile(auditPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
        const auditMetadata = 'metadata' in record ? record.metadata : { runId: record.runId };
        metrics.recordProviderInvocation({
          invocationId: `pinv_${sha256(JSON.stringify({
            provider: record.provider,
            idempotencyKey: record.idempotencyKey,
            startedAt: record.startedAt,
            providerAttempt: auditMetadata.providerAttempt ?? 0,
          })).slice(0, 32)}`,
          runId: String(auditMetadata.runId ?? ''),
          agentId: record.role,
          provider: record.provider,
          model: String(auditMetadata.model ?? providerModel),
          startedAt: record.startedAt,
          completedAt: record.completedAt,
          durationMs: record.durationMs,
          status: record.status,
          retryCount: Number(auditMetadata.providerAttempt ?? 1) > 1 ? 1 : 0,
          inputTokens: null,
          outputTokens: null,
          cacheReadTokens: null,
          cacheWriteTokens: null,
          estimatedCostUsd: null,
          fixture: false,
          errorCode: record.errorCode,
        });
      };
      const agent = agentProviderMode === 'deepseek-harness'
        ? new DeepSeekHarnessSdkAgent({
            dshBin: dshBin === 'dsh' ? undefined : dshBin,
            profile,
            patches: sdkPatches,
            dshHome,
            provider: sdkProvider,
            model: providerModel,
            maxTokens,
            maxSchemaAttempts,
            processIsolation,
            bubblewrapCommand,
            timeoutMs,
            maxOutputBytes,
            allowedWorkspaceRoots: [...allowedRoots, agentWorkspaceRoot],
            onAudit: writeAudit,
          })
        : agentProviderMode === 'deepseek-harness-headless'
          ? new DeepSeekHarnessHeadlessAgent({
            command: headlessCommand,
            args: headlessArgs,
            timeoutMs,
            maxOutputBytes,
            allowedWorkspaceRoots: [...allowedRoots, agentWorkspaceRoot],
            onAudit: writeAudit,
          })
          : agentProviderMode === 'company-codeagent-cli'
            ? new CompanyCodeAgentCliAdapter({
                command: codeAgentCommand,
                runArgs: codeAgentRunArgs,
                model: providerModel,
                timeoutMs: codeAgentTimeoutMs,
                authTimeoutMs: codeAgentAuthTimeoutMs,
                maxOutputBytes: codeAgentMaxOutputBytes,
                allowedWorkspaceRoots: [...codeAgentAllowedRoots, agentWorkspaceRoot],
                sessionStore: new FileCodeAgentSessionStore(join(runtimeDir, 'codeagent', 'sessions')),
                onAudit: writeAudit,
              })
            : undefined;
      const stageOptions: ConstructorParameters<typeof ProjectWorkflowStages>[0] = {
        workerRuntime: { prompts: runConfiguration, observer: workflowObserver, tasks: new ConcurrentTasks() },
        nodeByAgent: NODE_BY_AGENT,
        flywheel: flywheelApp,
        evalRunner: evalRunnerApp,
        evaluator: new TrustedProjectEvaluator(artifacts),
        contracts: new JsonSchemaAgentContractValidator(schemaRoot),
        ...(agent ? { agent } : {}),
        agentResolver: (runId) => {
          const snapshot = runConfiguration.get(runId);
          if (snapshot?.provider.kind === 'pi-agent') throw new Error('RUN_CONFIGURATION_INCOMPATIBLE: legacy Pi Run is read-only');
          if (snapshot?.provider.kind !== 'deepseek-harness' || snapshot.provider.parametersSha256 === fallbackRunProvider.parametersSha256) return undefined;
          return new ConfiguredDshProvider({
            ...providerOperations.requireRuntimeConfiguration(snapshot.provider),
            dshHome: join(runtimeDir, 'dsh-configured'),
            runtime: { processIsolation, bubblewrapCommand, timeoutMs, maxOutputBytes, allowedWorkspaceRoots: [...allowedRoots, agentWorkspaceRoot] },
            onAudit: async (record) => {
              await mkdir(auditDirectory, { recursive: true });
              await appendFile(auditPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
            },
            endpointPolicy: providerEndpointPolicy,
            onInvocation: (record) => metrics.recordProviderInvocation(record),
          });
        },
        modelFactory: modelExecutionFactory(new LocalAgentWorkspace({
          workspaceRoot: agentWorkspaceRoot,
          allowedSourceRoots: allowedRoots,
        })),
      };
      const executor = agentProviderMode === 'fixture'
        ? new FixtureProjectWorkflowStages({
            ...stageOptions, assetRoot: input.fixtureAssetRoot ?? repositoryRoot,
          })
        : new ProjectWorkflowStages(stageOptions);
      return executor;
  };
  const agentExample = new AgentExampleService({
    tasks: new ConcurrentTasks(),
    flywheel: flywheelApp, runConfiguration, evaluator: new TrustedProjectEvaluator(artifacts),
    contracts: new JsonSchemaAgentContractValidator(schemaRoot), observer: workflowObserver,
    nodeByAgent: NODE_BY_AGENT,
    configurePrompt: (role, addon) => { agents.updatePromptAddon(role, addon); },
    model: (request) => {
      const stages = projectStages();
      const executor = stages instanceof FixtureProjectWorkflowStages ? stages.executor : stages;
      return executor.modelFactory({ ...request, provider: executor.agentResolver?.(request.command.runId) ?? executor.agent });
    },
    fixtureModel: (output) => ({ assertOutput: assertModelOutput, execute: async () => structuredClone(output) }),
  });
  let workflowPromise: Promise<AutomatedProjectWorkflowService> | null = null;
  const workflow = () => {
    workflowPromise ??= (async () => {
      const infrastructure = await createDomainKnowledgeInfrastructure({
        executor: projectStages(),
        observer: workflowObserver,
        prompts: runConfiguration,
        checkpoint: { kind: 'sqlite', filename: join(runtimeDir, 'workflow', 'checkpoints.sqlite') },
        clock: input.clock,
      });
      return new AutomatedProjectWorkflowService(flywheelApp, infrastructure.engine, runConfiguration);
    })();
    return workflowPromise;
  };
  const orchestrator = new Orchestrator({
    workflow,
    agents,
    runConfiguration,
    reports: {
      build: (runId) => buildDemoReport({
        runId, runtimeDir, repository, service: flywheelApp, artifacts,
      }),
    },
  });
  return {
    repositoryRoot,
    runtimeDir,
    config,
    artifacts,
    repository,
    apps: {
      agentExample,
      flywheel: flywheelApp,
      evalRunner: evalRunnerApp,
      knowledgeSearch: knowledgeSearchApp,
      knowledgeDiscovery: knowledgeDiscoveryApp,
      contentGovernance,
      providerOperations,
      operationalMetrics: operationalMetricsApp,
      orchestrator,
    },
    // Compatibility surface for existing CLI and integrations. New entrypoints use apps.
    service: flywheelApp,
    query: knowledgeSearchApp,
    scanner,
    agents,
    workflowObserver,
    runConfiguration,
    agentProviderMode,
    automatedWorkflow: workflow,
    close: () => repository.close(),
  };
}
