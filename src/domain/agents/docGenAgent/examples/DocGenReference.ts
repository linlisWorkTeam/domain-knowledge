/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：在 DocGen 样例测试中核验固定源码、七项参考测试和文档数据例子；不提供 CLI。
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from '../../../Domain.ts';

/** 固定参考源码的 Git 提交，不跟随工作树修改。 */
export const DOCGEN_SOURCE_COMMIT = '3f999204f988697cc5bb9473c5a10ad5b4fc1f78';
/** 参考测试与源码分别固定，当前单元测试的合法重构不会改变历史样例。 */
export const DOCGEN_REFERENCE_TEST_COMMIT = '75d22094ad8e946a6118d441bb7a7c8258140639';
// 固定提交中的路径属于历史证据，不能随当前工作树的文件重命名而改变。
export const DOCGEN_SOURCE_PATH = 'src/domain/services/markdown-diff.ts';
/** 固定源码的正文摘要，防止材料静默改变。 */
export const DOCGEN_SOURCE_SHA256 = '58ac3ba8b93fb94fa9c8abedb7c6cb8017b28ccfa4dfec2f9923f767ab52eb80';
const REFERENCE_TEST_SHA256 = '17ed0b564ffcfc6387ecb57ac1e33d4dd8fb72694b69694eab31ace7b973f199';

type Diff = (before: string, after: string) => { hunks: unknown[]; changedSections: string[] };

/** Deterministic checks execute data examples, never model-generated code. */
/** 核对文档引用范围和可执行数据例子；正文语义仍需人工审阅。 */
export function checkDocGenDocument(body: string, diff: Diff, sourceLines: number) {
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

/** 仅供样例测试准备固定源码并执行七项参考测试，不属于生产角色阶段。 */
export async function prepareDocGenReference(repositoryRoot: string, outputRoot: string) {
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(outputRoot, 'reference-'));
  try {
    const archive = spawnSync('git', ['archive', DOCGEN_SOURCE_COMMIT, 'src/domain'], { cwd: repositoryRoot, maxBuffer: 16 * 1024 * 1024 });
    if (archive.status !== 0) throw new Error('DOCGEN_REFERENCE_COMMIT_MISSING');
    const unpack = spawnSync('tar', ['-xf', '-', '-C', directory], { input: archive.stdout });
    if (unpack.status !== 0) throw new Error('DOCGEN_REFERENCE_EXPORT_FAILED');
    const source = readFileSync(join(directory, DOCGEN_SOURCE_PATH));
    assert.equal(sha256(source), DOCGEN_SOURCE_SHA256, 'DOCGEN_REFERENCE_SOURCE_CHANGED');
    // 从不可变提交读取参考测试，不以 SHA 冻结当前工作树的测试实现。
    const archivedTest = spawnSync('git', ['show', `${DOCGEN_REFERENCE_TEST_COMMIT}:tests/unit/MarkdownDiff.test.ts`],
      { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 });
    if (archivedTest.status !== 0) throw new Error('DOCGEN_REFERENCE_TEST_COMMIT_MISSING');
    const referenceTest = Buffer.from(archivedTest.stdout
      .replace(/^\/\*\*\n \* Copyright \(c\) 2026 linlisWorkTeam[\s\S]*?\*\/\n/, '')
      .replace('../../src/domain/knowledge/MarkdownDiff.ts', '../../src/domain/services/markdown-diff.ts'));
    assert.equal(sha256(referenceTest), REFERENCE_TEST_SHA256, 'DOCGEN_REFERENCE_TEST_CHANGED');
    mkdirSync(join(directory, 'tests/unit'), { recursive: true });
    writeFileSync(join(directory, 'tests/unit/MarkdownDiff.test.ts'), referenceTest);
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    const test = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/unit/MarkdownDiff.test.ts'], { cwd: directory, encoding: 'utf8', timeout: 60_000, env: environment });
    writeFileSync(join(directory, 'reference.tap'), test.stdout ?? '');
    if (test.status !== 0 || !/^# tests 7$/m.test(test.stdout) || !/^# pass 7$/m.test(test.stdout)) throw new Error('DOCGEN_REFERENCE_TEST_FAILED');
    const { structuredMarkdownDiff } = await import(pathToFileURL(join(directory, DOCGEN_SOURCE_PATH)).href);
    return { directory, diff: structuredMarkdownDiff as Diff, sourceLines: source.toString().split('\n').length,
      evidence: { commit: DOCGEN_SOURCE_COMMIT, sourceSha256: DOCGEN_SOURCE_SHA256, referenceTestSha256: REFERENCE_TEST_SHA256, testsPassed: 7, testsTotal: 7 } };
  } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
}
