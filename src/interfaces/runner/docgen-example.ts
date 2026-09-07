#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from '../../domain/index.ts';
import type { AutomatedProjectScenario } from '../../application/services/automated-project-workflow.ts';
import { componentRoot, createComposition } from './composition.ts';

export const DOCGEN_SOURCE_COMMIT = '3f999204f988697cc5bb9473c5a10ad5b4fc1f78';
export const DOCGEN_SOURCE_PATH = 'src/domain/services/markdown-diff.ts';
export const DOCGEN_SOURCE_SHA256 = '58ac3ba8b93fb94fa9c8abedb7c6cb8017b28ccfa4dfec2f9923f767ab52eb80';
const REFERENCE_TEST_SHA256 = '17ed0b564ffcfc6387ecb57ac1e33d4dd8fb72694b69694eab31ace7b973f199';

type Diff = (before: string, after: string) => { hunks: unknown[]; changedSections: string[] };

/** Deterministic checks execute data examples, never model-generated code. */
export function checkDocgenDocument(body: string, diff: Diff, sourceLines: number) {
  const citations = [...body.matchAll(/src\/domain\/services\/markdown-diff\.ts:L(\d+)-L(\d+)/g)];
  assert.ok(citations.length > 0, 'DOCGEN_SOURCE_CITATION_REQUIRED');
  for (const citation of citations) assert.ok(Number(citation[1]) >= 1
    && Number(citation[2]) >= Number(citation[1]) && Number(citation[2]) <= sourceLines, 'DOCGEN_CITATION_RANGE_INVALID');
  const blocks = [...body.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  assert.equal(blocks.length, 1, 'DOCGEN_EXAMPLES_REQUIRED');
  const examples: unknown = JSON.parse(blocks[0]![1]!).examples;
  assert.ok(Array.isArray(examples) && examples.length >= 3 && examples.length <= 12, 'DOCGEN_EXAMPLE_COUNT_INVALID');
  const categories = new Set<string>();
  for (const example of examples) {
    assert.ok(typeof example.before === 'string' && typeof example.after === 'string', 'DOCGEN_EXAMPLE_INPUT_INVALID');
    assert.ok(example.before.length <= 10_000 && example.after.length <= 10_000, 'DOCGEN_EXAMPLE_INPUT_LIMIT');
    const actual = diff(example.before, example.after);
    assert.equal(example.expectedHunkCount, actual.hunks.length, 'DOCGEN_EXAMPLE_HUNKS_MISMATCH');
    assert.deepEqual(example.expectedChangedSections, actual.changedSections, 'DOCGEN_EXAMPLE_SECTIONS_MISMATCH');
    if (example.before === example.after) categories.add('identical');
    else if (example.before.replaceAll('\r\n', '\n') === example.after.replaceAll('\r\n', '\n')) categories.add('crlf');
    else if (actual.hunks.length > 0 && actual.changedSections.some((section) => section.startsWith('#'))) categories.add('section-edit');
  }
  assert.deepEqual([...categories].sort(), ['crlf', 'identical', 'section-edit'], 'DOCGEN_EXAMPLE_COVERAGE_MISSING');
  return { status: 'PASS', examples: examples.length, citations: citations.length, semanticReview: 'REQUIRED', publication: 'NOT_EVALUATED' };
}

export async function prepareDocgenReference(repositoryRoot: string, outputRoot: string) {
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(outputRoot, 'reference-'));
  try {
    const archive = spawnSync('git', ['archive', DOCGEN_SOURCE_COMMIT, 'src/domain'], { cwd: repositoryRoot, maxBuffer: 16 * 1024 * 1024 });
    if (archive.status !== 0) throw new Error('DOCGEN_REFERENCE_COMMIT_MISSING');
    const unpack = spawnSync('tar', ['-xf', '-', '-C', directory], { input: archive.stdout });
    if (unpack.status !== 0) throw new Error('DOCGEN_REFERENCE_EXPORT_FAILED');
    const source = readFileSync(join(directory, DOCGEN_SOURCE_PATH));
    assert.equal(sha256(source), DOCGEN_SOURCE_SHA256, 'DOCGEN_REFERENCE_SOURCE_CHANGED');
    const referenceTest = readFileSync(join(componentRoot, 'tests/unit/markdown-diff.test.ts'));
    assert.equal(sha256(referenceTest), REFERENCE_TEST_SHA256, 'DOCGEN_REFERENCE_TEST_CHANGED');
    mkdirSync(join(directory, 'tests/unit'), { recursive: true });
    writeFileSync(join(directory, 'tests/unit/markdown-diff.test.ts'), referenceTest);
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    const test = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/unit/markdown-diff.test.ts'], { cwd: directory, encoding: 'utf8', timeout: 60_000, env: environment });
    writeFileSync(join(directory, 'reference.tap'), test.stdout ?? '');
    if (test.status !== 0 || !/^# tests 7$/m.test(test.stdout) || !/^# pass 7$/m.test(test.stdout)) throw new Error('DOCGEN_REFERENCE_TEST_FAILED');
    const { structuredMarkdownDiff } = await import(pathToFileURL(join(directory, DOCGEN_SOURCE_PATH)).href);
    return { directory, diff: structuredMarkdownDiff as Diff, sourceLines: source.toString().split('\n').length,
      evidence: { commit: DOCGEN_SOURCE_COMMIT, sourceSha256: DOCGEN_SOURCE_SHA256, referenceTestSha256: REFERENCE_TEST_SHA256, testsPassed: 7, testsTotal: 7 } };
  } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
}

export async function main(argv = process.argv.slice(2)) {
  const mode = argv.shift() ?? 'run';
  if (!['prepare', 'run', 'check'].includes(mode)) throw new Error('ARGUMENT_INVALID: use prepare, run, or check');
  const options = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--runtime', '--prompt-file', '--document'].includes(argv[i]!) || !argv[i + 1] || argv[i + 1]!.startsWith('--')) throw new Error('ARGUMENT_INVALID');
    options.set(argv[i]!, argv[i + 1]!);
  }
  const runtimeDir = resolve(options.get('--runtime') ?? join(componentRoot, '.workpanel/docgen-example'));
  const reference = await prepareDocgenReference(componentRoot, join(runtimeDir, 'reference-checks'));
  if (mode === 'prepare') return reference.evidence;
  if (mode === 'check') {
    const path = options.get('--document');
    if (!path) throw new Error('ARGUMENT_REQUIRED: --document');
    return { reference: reference.evidence, checks: checkDocgenDocument(readFileSync(resolve(path), 'utf8'), reference.diff, reference.sourceLines) };
  }
  const composition = createComposition({ runtimeDir });
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const settings = composition.apps.providerOperations.getSettings();
    if (settings.verification.status === 'NOT_CONFIGURED' && !process.env.DEEPSEEK_API_KEY) {
      throw new Error('DOCGEN_LIVE_CONFIGURATION_REQUIRED: configure DSH in this runtime or set DEEPSEEK_API_KEY');
    }
    const prompt = readFileSync(resolve(options.get('--prompt-file') ?? join(componentRoot, 'examples/docgen/prompt.txt')), 'utf8');
    composition.apps.orchestrator.updatePromptAddon('doc-gen', prompt);
    const scenario: AutomatedProjectScenario = { schemaVersion: '1.0', name: 'markdown-diff-docgen',
      moduleId: 'markdown-diff', repositoryRoot: componentRoot, expectedCommit: DOCGEN_SOURCE_COMMIT,
      sourcePaths: [DOCGEN_SOURCE_PATH], publicInterfacePaths: [DOCGEN_SOURCE_PATH],
      allowedGeneratedPaths: [DOCGEN_SOURCE_PATH], prepareCommands: [], referenceCommands: [], firstIterationCommands: [], finalCommands: [] };
    const result = await composition.apps.docgenExample.run(scenario, abort.signal);
    const { body, ...metadata } = result;
    const destination = join(runtimeDir, 'examples', result.runId);
    mkdirSync(destination, { recursive: true, mode: 0o700 });
    writeFileSync(join(destination, 'document.md'), body, { flag: 'wx', mode: 0o600 });
    const audit = await composition.apps.orchestrator.buildDemoReport(result.runId);
    writeFileSync(join(destination, 'audit.json'), JSON.stringify(audit, null, 2), { mode: 0o600 });
    const report = { ...metadata, reference: reference.evidence, checks: { status: 'NOT_RUN' } as Record<string, unknown> };
    try { report.checks = checkDocgenDocument(body, reference.diff, reference.sourceLines); }
    catch (error) { report.checks = { status: 'FAIL', reason: error instanceof Error ? error.message.split('\n')[0] : 'DOCGEN_CHECK_FAILED' }; throw error; }
    finally { writeFileSync(join(destination, 'result.json'), JSON.stringify(report, null, 2), { mode: 0o600 }); }
    return { ...report, outputDirectory: destination };
  } finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    composition.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message.split('\n')[0] : 'DOCGEN_EXAMPLE_FAILED'}\n`);
    process.exitCode = 1;
  });
}
