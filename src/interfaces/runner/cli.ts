#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrateLegacyOkf } from '../../infrastructure/migration/legacy-okf/index.ts';
import type { ArtifactRef, RunState } from '../../domain/index.ts';
import { createComposition, loadOhMyWorkPanelScenario } from './composition.ts';

interface ParsedArgs {
  command: string;
  options: Map<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? 'help';
  const options = new Map<string, string | boolean>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`ARGUMENT_INVALID: unexpected ${token}`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      options.set(key, next);
      index += 1;
    } else {
      options.set(key, true);
    }
  }
  return { command, options };
}

function option(args: ParsedArgs, key: string, fallback = ''): string {
  const value = args.options.get(key);
  return typeof value === 'string' ? value : fallback;
}

function required(args: ParsedArgs, key: string): string {
  const value = option(args, key).trim();
  if (!value) throw new Error(`ARGUMENT_REQUIRED: --${key}`);
  return value;
}

function numberOption(args: ParsedArgs, key: string, fallback: number): number {
  const raw = option(args, key, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`ARGUMENT_INVALID: --${key} must be a number`);
  return value;
}

function jsonOutput(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function help(): void {
  process.stdout.write(`domain-knowledge · Knowledge Flywheel\n\n`);
  process.stdout.write(`Commands:\n`);
  process.stdout.write(`  init\n`);
  process.stdout.write(`  ingest --module ID (--file PATH | --content TEXT) --source PATH [--title T --description D --tags a,b]\n`);
  process.stdout.write(`  migrate-legacy [--root knowledge]\n`);
  process.stdout.write(`  scan\n`);
  process.stdout.write(`  list [--status CANDIDATE,VERIFIED]\n`);
  process.stdout.write(`  get (--version ID | --module ID)\n`);
  process.stdout.write(`  query --q TEXT [--top 8 --status VERIFIED]\n`);
  process.stdout.write(`  feedback (--version ID | --module ID) --action hit|rate|correct [--rating 0..5 --note TEXT]\n`);
  process.stdout.write(`  create-run --module ID [--policy local-v1]\n`);
  process.stdout.write(`  transition --run ID --state STATE\n`);
  process.stdout.write(`  evaluate --run ID --version ID --tests-passed N --tests-total N --stability 1 --evidence-file PATH\n`);
  process.stdout.write(`  publish --run ID --version ID --decision ID\n`);
  process.stdout.write(`  workflow-run --repository PATH [--workers 1 --max-iterations 3]\n`);
  process.stdout.write(`  workflow-resume --run ID\n`);
  process.stdout.write(`  workflow-status --run ID\n`);
  process.stdout.write(`  workflow-report --run ID [--output PATH]\n`);
  process.stdout.write(`  workflow-cancel --run ID\n`);
  process.stdout.write(`  agents\n`);
  process.stdout.write(`  set-agent-prompt --agent ID --prompt TEXT\n`);
  process.stdout.write(`  status\n`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.command === 'help' || args.options.has('help')) {
    help();
    return;
  }
  const composition = createComposition();
  try {
    if (args.command === 'init') {
      jsonOutput({ ok: true, runtimeDir: composition.runtimeDir, ...composition.service.status() });
      return;
    }
    if (args.command === 'ingest') {
      const file = option(args, 'file');
      const content = file
        ? readFileSync(isAbsolute(file) ? file : join(composition.repositoryRoot, file), 'utf8')
        : required(args, 'content');
      const source = required(args, 'source');
      const result = await composition.service.ingestCandidate({
        moduleId: required(args, 'module'),
        body: content,
        title: option(args, 'title'),
        description: option(args, 'description'),
        category: option(args, 'category'),
        tags: option(args, 'tags').split(',').map((tag) => tag.trim()).filter(Boolean),
        provenance: [{
          path: source,
          lines: option(args, 'source-lines') || undefined,
          commit: option(args, 'source-commit') || undefined,
          symbol: option(args, 'source-symbol') || undefined,
          url: /^https?:\/\//.test(source) ? source : undefined,
          pinned: args.options.has('pinned'),
        }],
      });
      jsonOutput(result);
      return;
    }
    if (args.command === 'migrate-legacy') {
      const configured = option(args, 'root', composition.config.legacy.knowledgeDir);
      const legacyRoot = isAbsolute(configured) ? configured : join(composition.repositoryRoot, configured);
      jsonOutput(await migrateLegacyOkf({ legacyKnowledgeRoot: legacyRoot, service: composition.service }));
      return;
    }
    if (args.command === 'scan') {
      jsonOutput(composition.scanner.scan(
        composition.config.acquisition.roots,
        composition.config.acquisition.maxCandidates,
      ));
      return;
    }
    if (args.command === 'list') {
      const statuses = option(args, 'status').split(',').map((value) => value.trim()).filter(Boolean);
      jsonOutput({ knowledge: composition.service.listKnowledgeVersions(statuses.length ? statuses : undefined) });
      return;
    }
    if (args.command === 'get') {
      const explicitVersion = option(args, 'version');
      const moduleId = option(args, 'module');
      const versionId = explicitVersion || (moduleId ? composition.repository.latestKnowledgeVersion(moduleId)?.versionId : '');
      if (!versionId) throw new Error('ARGUMENT_REQUIRED: --version or an existing --module');
      const value = await composition.query.get(versionId);
      if (!value) throw new Error('NOT_FOUND: knowledge version');
      jsonOutput(value);
      return;
    }
    if (args.command === 'query') {
      const statuses = option(args, 'status', 'VERIFIED').split(',').map((value) => value.trim()).filter(Boolean);
      jsonOutput(await composition.query.search({
        query: required(args, 'q'),
        top: numberOption(args, 'top', 8),
        statuses,
        category: option(args, 'category') || undefined,
      }));
      return;
    }
    if (args.command === 'feedback') {
      const explicitVersion = option(args, 'version');
      const moduleId = option(args, 'module');
      const versionId = explicitVersion || (moduleId ? composition.repository.latestKnowledgeVersion(moduleId)?.versionId : '');
      if (!versionId) throw new Error('ARGUMENT_REQUIRED: --version or an existing --module');
      composition.service.recordFeedback(
        versionId,
        required(args, 'action'),
        args.options.has('rating') ? numberOption(args, 'rating', 0) : null,
        option(args, 'note'),
      );
      jsonOutput({ ok: true });
      return;
    }
    if (args.command === 'create-run') {
      jsonOutput(composition.service.createRun(required(args, 'module'), option(args, 'policy', composition.config.publicationGate.policyId)));
      return;
    }
    if (args.command === 'transition') {
      jsonOutput(composition.service.transition(required(args, 'run'), required(args, 'state') as RunState));
      return;
    }
    if (args.command === 'evaluate') {
      const evidenceFile = required(args, 'evidence-file');
      const evidenceBytes = readFileSync(isAbsolute(evidenceFile) ? evidenceFile : join(composition.repositoryRoot, evidenceFile));
      const evidenceRef = await composition.artifacts.put(evidenceBytes, option(args, 'evidence-media-type', 'application/json'));
      const result = await composition.service.recordEvaluation({
        runId: required(args, 'run'),
        versionId: required(args, 'version'),
        evidenceRefs: [evidenceRef],
        toolchainFingerprint: required(args, 'toolchain'),
        criticalFailures: numberOption(args, 'critical-failures', 0),
        testsPassed: numberOption(args, 'tests-passed', 0),
        testsTotal: numberOption(args, 'tests-total', 0),
        stability: numberOption(args, 'stability', 0),
        infrastructureFailure: args.options.has('infrastructure-failure'),
      }, composition.config.publicationGate);
      jsonOutput(result);
      return;
    }
    if (args.command === 'publish') {
      jsonOutput(await composition.service.publish(
        required(args, 'run'), required(args, 'version'), required(args, 'decision'),
      ));
      return;
    }
    if (args.command === 'status') {
      jsonOutput({ ...composition.service.status(), runtimeDir: composition.runtimeDir });
      return;
    }
    if (args.command === 'agents') {
      jsonOutput({ agents: composition.agents.list() });
      return;
    }
    if (args.command === 'set-agent-prompt') {
      jsonOutput(composition.agents.updatePromptAddon(
        required(args, 'agent') as never,
        option(args, 'prompt'),
      ));
      return;
    }
    if (args.command === 'workflow-run') {
      const workflow = await composition.automatedWorkflow();
      const handle = await workflow.start(
        loadOhMyWorkPanelScenario(required(args, 'repository')),
        {
          policyId: option(args, 'policy', composition.config.publicationGate.policyId),
          minimumStability: composition.config.publicationGate.minimumStability,
          requireAllTests: composition.config.publicationGate.requireAllTests,
          maxIterations: numberOption(args, 'max-iterations', composition.config.publicationGate.maxIterations),
          workerCount: numberOption(args, 'workers', 1),
        },
      );
      jsonOutput({ event: 'started', ...handle });
      jsonOutput(await workflow.wait(handle.runId));
      return;
    }
    if (args.command === 'workflow-resume') {
      const workflow = await composition.automatedWorkflow();
      const handle = await workflow.resume(required(args, 'run'));
      jsonOutput({ event: 'resumed', ...handle });
      jsonOutput(await workflow.wait(handle.runId));
      return;
    }
    if (args.command === 'workflow-status') {
      jsonOutput(await (await composition.automatedWorkflow()).status(required(args, 'run')));
      return;
    }
    if (args.command === 'workflow-report') {
      const { buildDemoReport } = await import('./demo-report.ts');
      const report = await buildDemoReport({
        runId: required(args, 'run'), runtimeDir: composition.runtimeDir,
        repository: composition.repository, service: composition.service,
        artifacts: composition.artifacts,
      });
      const outputPath = option(args, 'output');
      if (!outputPath) {
        jsonOutput(report);
        return;
      }
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const { dirname } = await import('node:path');
      const target = isAbsolute(outputPath) ? outputPath : join(composition.repositoryRoot, outputPath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      jsonOutput({ ok: true, runId: required(args, 'run'), output: target });
      return;
    }
    if (args.command === 'workflow-cancel') {
      const runId = required(args, 'run');
      await (await composition.automatedWorkflow()).cancel(runId);
      jsonOutput({ runId, executionStatus: 'CANCELLED' });
      return;
    }
    throw new Error(`COMMAND_UNKNOWN: ${args.command}`);
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
