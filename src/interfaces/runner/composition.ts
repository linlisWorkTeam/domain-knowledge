import { appendFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ContentGovernanceApp, EvalRunnerApp, FlywheelApp, KnowledgeDiscoveryApp, KnowledgeSearchApp,
  Orchestrator,
} from '../../application/apps/index.ts';
import {
  AGENT_COMMAND_SCHEMA_ID, AGENT_RESULT_SCHEMA_ID, AgentCatalogService,
  AutomatedProjectWorkflowService, DeterministicQualityPolicy, OhMyWorkPanelWorkflowExecutor,
  RegistryRunConfigurationService, RegistryWorkflowObserver,
} from '../../application/services/index.ts';
import { sha256 } from '../../domain/index.ts';
import type { AutomatedProjectScenario } from '../../application/services/index.ts';
import { DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS } from '../../infrastructure/workflow/langgraph/index.ts';
import { createDomainKnowledgeInfrastructure } from '../../infrastructure/workflow/langgraph/index.ts';
import { TrustedProjectEvaluator } from '../../infrastructure/evaluation/project/index.ts';
import {
  DeepSeekHarnessHeadlessAgent, DeepSeekHarnessSdkAgent,
} from '../../infrastructure/agents/deepseek-harness/index.ts';
import {
  LocalCasArtifactStore, SQLiteFlywheelRepository,
} from '../../infrastructure/persistence/sqlite-cas/index.ts';
import { SQLiteContentGovernance } from '../../infrastructure/persistence/sqlite-content-governance/index.ts';
import { SourceScanner } from '../../infrastructure/source-scan/index.ts';
import { LocalAgentWorkspace } from '../../infrastructure/agents/workspace/index.ts';
import { JsonSchemaAgentContractValidator } from '../../infrastructure/agents/contracts/index.ts';
import { migrateLegacyOkf } from '../../infrastructure/migration/legacy-okf/index.ts';
import { ConsoleReadModel } from './console-read-model.ts';
import { buildDemoReport } from './demo-report.ts';

export interface WorkpanelConfig {
  schemaVersion: '1.0';
  runtimeDir: string;
  qualityGate: { threshold: number };
  publicationGate: {
    policyId: string;
    minimumStability: number;
    requireAllTests: boolean;
    maxIterations: number;
  };
  server: { host: string; port: number };
  acquisition: { roots: string[]; maxCandidates: number };
  legacy: { knowledgeDir: string };
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const componentRoot = resolve(moduleDirectory, '../../..');
export const defaultRepositoryRoot = resolve(
  process.env.WP_KNOWLEDGE_REPOSITORY?.trim() || componentRoot,
);

export function loadOhMyWorkPanelScenario(repositoryRoot: string): AutomatedProjectScenario {
  const scenarioPath = join(componentRoot, 'acceptance', 'ohmyworkpanel', 'scenario.json');
  const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8')) as Omit<AutomatedProjectScenario, 'repositoryRoot'>;
  return { ...scenario, repositoryRoot: resolve(repositoryRoot) };
}

export function loadWorkpanelConfig(_repositoryRoot = defaultRepositoryRoot): WorkpanelConfig {
  const configPath = process.env.WP_FLYWHEEL_CONFIG
    || join(componentRoot, 'runner.config.json');
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

export function createComposition(input: {
  repositoryRoot?: string;
  runtimeDir?: string;
  clock?: () => string;
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
    allowedRemoteHosts: (process.env.WP_SOURCE_ALLOWED_HOSTS ?? '')
      .split(',').map((host) => host.trim()).filter(Boolean),
    defaultRule: {
      policyId: config.publicationGate.policyId,
      minimumStability: config.publicationGate.minimumStability,
      requireAllTests: config.publicationGate.requireAllTests,
      maxIterations: config.publicationGate.maxIterations,
    },
    clock: input.clock,
  }));
  const agents = new AgentCatalogService({
    definitions: DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS,
    repository,
    clock: input.clock,
  });
  const workflowObserver = new RegistryWorkflowObserver(repository, input.clock);
  const agentProviderMode = process.env.WP_FLYWHEEL_AGENT_PROVIDER?.trim() || 'fixture';
  if (!['fixture', 'deepseek-harness', 'deepseek-harness-headless'].includes(agentProviderMode)) {
    throw new Error('CONFIG_INVALID: WP_FLYWHEEL_AGENT_PROVIDER must be fixture, deepseek-harness, or deepseek-harness-headless');
  }
  const sdkProvider = process.env.WP_DSH_PROVIDER?.trim()
    || (process.env.OPENCODE_GO_API_KEY ? 'opencode-go' : 'deepseek-official');
  const providerModel = agentProviderMode === 'fixture'
    ? 'schema-validated-fixture-v1'
    : process.env.WP_DSH_MODEL?.trim() || 'deepseek-v4-flash';
  const processIsolation = process.env.WP_DSH_PROCESS_ISOLATION?.trim() || 'bubblewrap';
  if (processIsolation !== 'none' && processIsolation !== 'bubblewrap') {
    throw new Error('CONFIG_INVALID: WP_DSH_PROCESS_ISOLATION must be none or bubblewrap');
  }
  const profile = process.env.WP_DSH_PROFILE?.trim() || 'sdk';
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
    : sdkProvider === 'opencode-go'
      ? [join(componentRoot, 'deploy', 'deepseek-harness', 'opencode-go.cordis.yml')]
      : [];
  const headlessCommand = process.env.WP_DSH_COMMAND?.trim() || 'dsh';
  const headlessArgs = process.env.WP_DSH_ARGS_JSON
    ? JSON.parse(process.env.WP_DSH_ARGS_JSON) as string[]
    : ['--profile', 'headless'];
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
      : {
          mode: agentProviderMode,
          command: headlessCommand,
          args: headlessArgs,
          timeoutMs,
          maxOutputBytes,
          allowedWorkspaceRoots: [...allowedRoots, agentWorkspaceRoot],
        };
  const schemaRoot = join(componentRoot, 'specs', 'schemas');
  const artifactRefSchemaSha256 = sha256(readFileSync(join(schemaRoot, 'artifact-ref.schema.json')));
  const correctionSchemaSha256 = sha256(readFileSync(join(schemaRoot, 'correction.schema.json')));
  const runConfiguration = new RegistryRunConfigurationService({
    definitions: DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS,
    repository,
    artifacts,
    provider: {
      kind: agentProviderMode,
      model: providerModel,
      parametersSha256: sha256(JSON.stringify(providerParameters)),
    },
    contracts: {
      commandSchema: AGENT_COMMAND_SCHEMA_ID,
      resultSchema: AGENT_RESULT_SCHEMA_ID,
      commandSchemaSha256: sha256(JSON.stringify({
        command: sha256(readFileSync(join(schemaRoot, 'agent-command.schema.json'))),
        artifactRef: artifactRefSchemaSha256,
      })),
      resultSchemaSha256: sha256(JSON.stringify({
        result: sha256(readFileSync(join(schemaRoot, 'agent-result.schema.json'))),
        artifactRef: artifactRefSchemaSha256,
        correction: correctionSchemaSha256,
      })),
    },
    clock: input.clock,
  });
  let workflowPromise: Promise<AutomatedProjectWorkflowService> | null = null;
  const workflow = () => {
    workflowPromise ??= (async () => {
      const auditDirectory = join(runtimeDir, 'demo');
      const auditPath = join(auditDirectory, 'agent-runs.jsonl');
      const writeAudit = async (record: Parameters<NonNullable<ConstructorParameters<typeof DeepSeekHarnessSdkAgent>[0]['onAudit']>>[0]) => {
        await mkdir(auditDirectory, { recursive: true });
        await appendFile(auditPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
      };
      const agent = agentProviderMode === 'deepseek-harness'
        ? new DeepSeekHarnessSdkAgent({
            dshBin,
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
          : undefined;
      const executor = new OhMyWorkPanelWorkflowExecutor({
        flywheel: flywheelApp,
        evalRunner: evalRunnerApp,
        evaluator: new TrustedProjectEvaluator(artifacts),
        assetRoot: join(componentRoot, 'acceptance', 'ohmyworkpanel'),
        contracts: new JsonSchemaAgentContractValidator(schemaRoot),
        ...(agent ? { agent } : {}),
        ...(agent ? { agentWorkspaces: new LocalAgentWorkspace({
          workspaceRoot: agentWorkspaceRoot,
          allowedSourceRoots: allowedRoots,
        }) } : {}),
      });
      const infrastructure = await createDomainKnowledgeInfrastructure({
        executor,
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
      flywheel: flywheelApp,
      evalRunner: evalRunnerApp,
      knowledgeSearch: knowledgeSearchApp,
      knowledgeDiscovery: knowledgeDiscoveryApp,
      contentGovernance,
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
