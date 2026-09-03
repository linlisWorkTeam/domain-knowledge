import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runRealSourceFlow } from '../../src/application/services/project-flow.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/index.ts';
import { SchemaValidatedScenarioAgent } from '../../src/infrastructure/agents/scenario/index.ts';
import { createComposition } from '../../src/interfaces/runner/composition.ts';
import { GOOD_BODY } from '../helpers/fixture.ts';

function git(repositoryRoot: string, args: string[]): string {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot, encoding: 'utf8', shell: false, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('real source flow fails, corrects, fresh-generates, evaluates and publishes', async () => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'wp-real-source-repo-'));
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-real-source-runtime-'));
  mkdirSync(join(repositoryRoot, 'src'));
  writeFileSync(join(repositoryRoot, 'package.json'), '{"name":"real-source","type":"module"}\n');
  writeFileSync(join(repositoryRoot, 'src', 'contract.js'), 'export const expected = 4;\n');
  writeFileSync(join(repositoryRoot, 'src', 'module.js'), 'export const calculate = () => 4;\n');
  writeFileSync(join(repositoryRoot, 'src', 'module.test.js'), `
import assert from 'node:assert/strict';
import test from 'node:test';
import { expected } from './contract.js';
import { calculate } from './module.js';
test('generated behavior matches the public contract', () => assert.equal(calculate(), expected));
`.trimStart());
  git(repositoryRoot, ['init']);
  git(repositoryRoot, ['config', 'user.email', 'acceptance@example.invalid']);
  git(repositoryRoot, ['config', 'user.name', 'Acceptance Fixture']);
  git(repositoryRoot, ['add', '.']);
  git(repositoryRoot, ['commit', '-m', 'fixture']);
  const commit = git(repositoryRoot, ['rev-parse', 'HEAD']);
  const realUserDirectories = [
    process.env.HOME, process.env.USERPROFILE, process.env.APPDATA, process.env.LOCALAPPDATA,
  ].filter((value): value is string => Boolean(value));
  const realUserDirectoryDigests = realUserDirectories.map((value) =>
    createHash('sha256').update(value).digest('hex'));
  const isolationProbe = [
    "const { createHash } = process.getBuiltinModule('node:crypto');",
    `const forbidden = ${JSON.stringify(realUserDirectoryDigests)};`,
    "const keys = ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP'];",
    "const digest = (value) => createHash('sha256').update(value).digest('hex');",
    "if (keys.some((key) => !process.env[key] || forbidden.includes(digest(process.env[key])))) process.exit(2);",
  ].join(' ');

  const composition = createComposition({ runtimeDir });
  const agent = new SchemaValidatedScenarioAgent([
    { role: 'docgen', output: {
      body: `${GOOD_BODY}\n\n## 行为契约\n\n第一版只声明返回数值，没有固定公开契约中的精确结果。`,
      title: 'Real source module', description: 'Knowledge-driven executable behavior.',
    } },
    { role: 'codegen', output: { files: [{ path: 'src/module.js', content: 'export const calculate = () => 3;\n' }] } },
    { role: 'review', output: { correction: {
      correctionId: 'COR-FIXTURE-001', knowledgePath: '行为契约',
      criterion: '返回值必须等于公开契约 expected', risk: '生成实现不能通过真实测试',
    } } },
    { role: 'docgen', output: {
      body: `${GOOD_BODY}\n\n## 行为契约\n\n增量修订：生成函数必须返回公开契约固定的数值 4，并由真实 Node 测试验证。`,
      title: 'Real source module', description: 'Knowledge-driven executable behavior.',
    } },
    { role: 'codegen', output: { files: [{ path: 'src/module.js', content: 'export const calculate = () => 4;\n' }] } },
  ]);
  try {
    const report = await runRealSourceFlow({
      scenario: {
        schemaVersion: '1.0', name: 'fixture-two-iteration', moduleId: 'real-source-module',
        repositoryRoot, expectedCommit: commit,
        sourcePaths: ['src/module.js', 'src/module.test.js'],
        publicInterfacePaths: ['src/contract.js', 'package.json'],
        allowedGeneratedPaths: ['src/module.js'], prepareCommands: [],
        referenceCommands: [{ tool: 'node', purpose: 'test', args: ['--test', 'src/module.test.js'] }],
        firstIterationCommands: [{ tool: 'node', purpose: 'test', args: ['--test', 'src/module.test.js'] }],
        finalCommands: [
          { tool: 'node', purpose: 'test', args: ['--test', 'src/module.test.js'], repetitions: 2 },
          { tool: 'node', purpose: 'check', args: ['--check', 'src/module.js'] },
          { tool: 'node', purpose: 'check', args: ['-e', isolationProbe] },
        ],
      },
      service: composition.service,
      artifacts: composition.artifacts,
      agent,
      evaluator: new TrustedProjectEvaluator(composition.artifacts),
      policy: composition.config.publicationGate,
    });
    agent.assertConsumed();
    const docgenPrompts = agent.requests
      .filter((request) => request.role === 'docgen')
      .map((request) => JSON.parse(request.prompt) as Record<string, unknown>);
    assert.equal(docgenPrompts.length, 2);
    for (const prompt of docgenPrompts) {
      const guide = prompt.writingGuide as { locale?: string; principles?: unknown[]; priority?: string };
      assert.equal(guide.locale, 'zh-CN');
      assert.ok((guide.principles?.length ?? 0) >= 4);
      assert.match(guide.priority ?? '', /事实/);
    }
    assert.equal(report.referenceEvaluation.passed, true);
    assert.equal(report.firstEvaluation.passed, false);
    assert.equal(report.firstDecision.outcome, 'ITERATE');
    assert.equal(report.finalEvaluation.passed, true);
    const isolationResult = report.finalEvaluation.results.filter((result) => result.purpose === 'check').at(-1);
    assert.equal(isolationResult?.exitCode, 0);
    assert.equal(report.finalDecision.outcome, 'PASS');
    assert.equal(report.finalVersion.parentVersionId, report.firstVersion.versionId);
    assert.equal(composition.service.getKnowledgeVersion(report.firstVersion.versionId)?.status, 'CANDIDATE');
    assert.equal(composition.service.getKnowledgeVersion(report.finalVersion.versionId)?.status, 'VERIFIED');
    assert.equal(composition.repository.listEvents(report.runId).at(-1)?.eventType, 'KnowledgePublished');
  } finally {
    composition.close();
    rmSync(repositoryRoot, { recursive: true, force: true });
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test('scenario agent rejects output outside the requested schema', async () => {
  const agent = new SchemaValidatedScenarioAgent([
    { role: 'docgen', output: { body: 'too short', title: 'invalid', description: 'invalid' } },
  ]);
  await assert.rejects(
    agent.run({
      role: 'docgen', prompt: '{}', idempotencyKey: 'invalid-output',
      outputSchema: {
        type: 'object', required: ['body'],
        properties: { body: { type: 'string', minLength: 200 } },
        additionalProperties: false,
      },
    }),
    /AGENT_OUTPUT_INVALID/,
  );
});

test('project evaluator rejects generated paths outside its archived workspace', async () => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'wp-path-safety-repo-'));
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-path-safety-runtime-'));
  writeFileSync(join(repositoryRoot, 'package.json'), '{"name":"path-safety","type":"module"}\n');
  git(repositoryRoot, ['init']);
  git(repositoryRoot, ['config', 'user.email', 'acceptance@example.invalid']);
  git(repositoryRoot, ['config', 'user.name', 'Acceptance Fixture']);
  git(repositoryRoot, ['add', '.']);
  git(repositoryRoot, ['commit', '-m', 'fixture']);
  const commit = git(repositoryRoot, ['rev-parse', 'HEAD']);
  const composition = createComposition({ runtimeDir });
  const evaluator = new TrustedProjectEvaluator(composition.artifacts);
  try {
    const snapshot = await evaluator.inspect({
      repositoryRoot, expectedCommit: commit,
      sourcePaths: ['package.json'], publicInterfacePaths: [],
    });
    await assert.rejects(
      evaluator.evaluate({
        label: 'path-safety', snapshot,
        generatedFiles: [{ path: '../escape.js', content: 'export default true;\n' }],
        prepareCommands: [], commands: [{ tool: 'node', purpose: 'check', args: ['--version'] }],
      }),
      /PROJECT_PATH_DENIED/,
    );
    const redacted = await evaluator.evaluate({
      label: 'argument-redaction', snapshot, generatedFiles: [], prepareCommands: [],
      commands: [{ tool: 'node', purpose: 'check', args: ['-e', 'process.exit(0)', '--', '--token', 'super-secret-value'] }],
    });
    assert.equal(redacted.passed, false);
    assert.equal(redacted.testsTotal, 0);
    assert.deepEqual(redacted.results[0]?.args.slice(-2), ['--token', '<redacted>']);
    assert.equal(JSON.stringify(redacted).includes('super-secret-value'), false);
    const mutated = await evaluator.evaluate({
      label: 'prepare-mutation', snapshot,
      generatedFiles: [{ path: 'generated.js', content: 'export default true;\n' }],
      prepareCommands: [{
        tool: 'node', purpose: 'setup',
        args: ['-e', "require('node:fs').writeFileSync('generated.js', 'tampered')"],
      }],
      commands: [{ tool: 'node', purpose: 'test', args: ['--test', 'generated.js'] }],
    });
    assert.equal(mutated.passed, false);
    assert.equal(mutated.infrastructureFailure, true);
    assert.equal(mutated.results.some((result) => result.phase === 'gate'), false);
    const mutationEvidence = JSON.parse(Buffer.from(await composition.artifacts.get(mutated.evidenceRef)).toString('utf8')) as {
      generatedFilesIntact?: boolean;
    };
    assert.equal(mutationEvidence.generatedFilesIntact, false);
  } finally {
    composition.close();
    rmSync(repositoryRoot, { recursive: true, force: true });
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
