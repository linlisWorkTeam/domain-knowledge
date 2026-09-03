#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runRealSourceFlow } from '../../application/services/project-flow.ts';
import type { RealSourceScenario } from '../../application/services/project-flow.ts';
import { TrustedProjectEvaluator } from '../../infrastructure/evaluation/project/index.ts';
import {
  SchemaValidatedScenarioAgent, type ScenarioResponse,
} from '../../infrastructure/agents/scenario/index.ts';
import { createComposition } from './composition.ts';

interface ScenarioFile extends Omit<RealSourceScenario, 'repositoryRoot'> {
  assets: {
    knowledgeV1: string;
    knowledgeV2: string;
    codeV1: string;
    codeV2: string;
    correction: string;
    generatedPath: string;
    title: string;
    description: string;
  };
}

function options(argv: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const allowed = new Set(['repository', 'runtime', 'output']);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`ARGUMENT_INVALID: ${key ?? '<missing>'}`);
    }
    const name = key.slice(2);
    if (!allowed.has(name)) throw new Error(`ARGUMENT_UNKNOWN: --${name}`);
    result.set(name, value);
  }
  return result;
}

function asset(root: string, path: string): string {
  const resolvedRoot = resolve(root);
  const resolved = resolve(resolvedRoot, path);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`SCENARIO_ASSET_DENIED: ${path}`);
  }
  return readFileSync(resolved, 'utf8');
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = options(argv);
  const repositoryRoot = args.get('repository') || process.env.OHMYWORKPANEL_REPO;
  if (!repositoryRoot) throw new Error('ARGUMENT_REQUIRED: --repository or OHMYWORKPANEL_REPO');
  const outputMode = args.get('output') ?? 'full';
  if (!['full', 'summary'].includes(outputMode)) throw new Error(`ARGUMENT_INVALID: --output ${outputMode}`);
  const scenarioPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../acceptance/ohmyworkpanel/scenario.json');
  const scenarioRoot = dirname(scenarioPath);
  const file = JSON.parse(readFileSync(scenarioPath, 'utf8')) as ScenarioFile;
  const { assets, ...scenarioConfig } = file;
  const correction = JSON.parse(asset(scenarioRoot, assets.correction)) as Record<string, unknown>;
  const responses: ScenarioResponse[] = [
    { role: 'docgen', output: {
      body: asset(scenarioRoot, assets.knowledgeV1),
      title: assets.title, description: assets.description,
    } },
    { role: 'codegen', output: { files: [{
      path: assets.generatedPath, content: asset(scenarioRoot, assets.codeV1),
    }] } },
    { role: 'review', output: { correction } },
    { role: 'docgen', output: {
      body: asset(scenarioRoot, assets.knowledgeV2),
      title: assets.title, description: assets.description,
    } },
    { role: 'codegen', output: { files: [{
      path: assets.generatedPath, content: asset(scenarioRoot, assets.codeV2),
    }] } },
  ];
  const scenario: RealSourceScenario = {
    ...scenarioConfig,
    repositoryRoot: isAbsolute(repositoryRoot) ? repositoryRoot : resolve(repositoryRoot),
  };
  const composition = createComposition({ runtimeDir: args.get('runtime') });
  const agent = new SchemaValidatedScenarioAgent(responses);
  try {
    const report = await runRealSourceFlow({
      scenario,
      service: composition.service,
      artifacts: composition.artifacts,
      agent,
      evaluator: new TrustedProjectEvaluator(composition.artifacts),
      policy: composition.config.publicationGate,
    });
    agent.assertConsumed();
    const output = outputMode === 'summary' ? {
      ok: true,
      runId: report.runId,
      commit: report.snapshot.commit,
      firstGate: report.firstDecision.outcome,
      finalGate: report.finalDecision.outcome,
      finalStatus: report.finalVersion.status,
      tests: {
        reference: `${report.referenceEvaluation.testsPassed}/${report.referenceEvaluation.testsTotal}`,
        first: `${report.firstEvaluation.testsPassed}/${report.firstEvaluation.testsTotal}`,
        final: `${report.finalEvaluation.testsPassed}/${report.finalEvaluation.testsTotal}`,
      },
      publication: report.publication,
      reportRef: report.reportRef,
    } : report;
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    composition.close();
  }
}

const directEntry = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (directEntry) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
