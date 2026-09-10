/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：按冻结提交和声明式固定用例执行参考验收，不替代知识发布门禁。
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { sha256 } from '../../src/domain/Domain.ts';
import { buildConstraints } from '../../src/domain/services/workbench/WorkbenchProject.ts';
import { assertNativeBehaviorSuite, nativeFunctions, type NativeContract } from '../../src/domain/services/evaluation/NativeBehaviorSuite.ts';
import { NativeToolchain } from '../../src/infrastructure/evaluation/project/NativeToolchain.ts';
import { NativeCaseExecutor } from '../../src/infrastructure/evaluation/project/NativeCaseExecutor.ts';
import { nativeFingerprint } from '../../src/infrastructure/evaluation/project/NativeFingerprint.ts';
import type { NativeCaseObservation } from '../../src/application/ports/NativeEvaluationPorts.ts';
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]!, value = process.argv[i + 1];
  if (!['--target', '--repository', '--report'].includes(key) || !value || args.has(key)) throw new Error('FIXED_ACCEPTANCE_ARGUMENTS_INVALID');
  args.set(key, value);
}
if (args.size !== 3) throw new Error('FIXED_ACCEPTANCE_ARGUMENTS_REQUIRED');
const root = fileURLToPath(new URL('../../tests/fixtures/nativeTargets/', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'Targets.json'), 'utf8')) as { targets: Array<{
  name: string; language: 'c' | 'cpp'; commit: string; scope: string[]; files: Record<string, string>;
  fixedSuite: { path: string; sha256: string; caseCount: number; profile: string };
}> };
const target = manifest.targets.find(item => item.name === args.get('--target'));
if (!target) throw new Error('FIXED_ACCEPTANCE_TARGET_INVALID');
const bytes = readFileSync(resolve(root, target.fixedSuite.path));
if (sha256(bytes) !== target.fixedSuite.sha256) throw new Error('FIXED_ACCEPTANCE_SUITE_CHANGED');
const suite: unknown = JSON.parse(bytes.toString('utf8'));
const repository = resolve(args.get('--repository')!);
const git = (...parameters: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...parameters], { cwd: repository, maxBuffer: 4_194_304 });
if (git('rev-parse', `${target.commit}^{commit}`).toString().trim() !== target.commit) throw new Error('FIXED_ACCEPTANCE_COMMIT_CHANGED');
const files = Object.entries(target.files).map(([path, digest]) => {
  const content = git('show', `${target.commit}:${path}`);
  if (sha256(content) !== digest) throw new Error('FIXED_ACCEPTANCE_SOURCE_CHANGED');
  return { path, content: content.toString('utf8') };
}).filter(file => /\.(h|c|cpp)$/.test(file.path) && !file.path.startsWith('test/') && file.path !== 'xmltest.cpp');
const build = buildConstraints(); const native = new NativeToolchain(); const runner = new NativeCaseExecutor(native);
const controller = new AbortController(); const cancel = () => controller.abort(new Error('FIXED_ACCEPTANCE_CANCELLED'));
process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
const path = resolve(args.get('--report')!); mkdirSync(dirname(path), { recursive: true });
const report: Record<string, unknown> = { schemaVersion: 'native-fixed-reference-v1', target: target.name,
  commit: target.commit, sourceFiles: target.files, suiteDigest: target.fixedSuite.sha256, profile: target.fixedSuite.profile,
  startedAt: new Date().toISOString(), status: 'RUNNING', publicationVerified: false, knowledgeEvaluated: false };
const observations: NativeCaseObservation[] = []; report.observations = observations;
const save = () => { writeFileSync(`${path}.tmp`, JSON.stringify(report, null, 2), { mode: 0o600 }); renameSync(`${path}.tmp`, path); };
save();
try {
  const input = { language: target.language, build, files };
  report.fingerprint = await nativeFingerprint(target.language, build, controller.signal); save();
  const api = await native.publicInterface({ ...input, entryPath: target.language === 'c' ? 'jsmn.h' : 'tinyxml2.h',
    ...(target.language === 'cpp' ? { astFilter: 'tinyxml2::XMLUtil', symbols: target.scope.map(symbol => `tinyxml2::${symbol}`) } : {}) }, controller.signal);
  const contract: NativeContract = { schemaVersion: 'native-contract-v1', language: target.language, includePath: api.sourcePath,
    entryPaths: files.filter(file => /\.(c|cpp)$/.test(file.path)).map(file => file.path), declarations: api.declarations, targetFunctions: [] };
  contract.targetFunctions = [...nativeFunctions(contract).keys()];
  assertNativeBehaviorSuite(suite, contract);
  if (suite.cases.length !== target.fixedSuite.caseCount) throw new Error('FIXED_ACCEPTANCE_SUITE_CHANGED');
  report.contract = contract; report.total = suite.cases.length; save();
  for (const test of suite.cases) {
    controller.signal.throwIfAborted();
    const observation = await runner.execute(input, contract, test, controller.signal); observations.push(observation); save();
    console.log(JSON.stringify({ target: target.name, caseId: test.caseId, status: observation.status, reasonCode: observation.reasonCode }));
    if (observation.status !== 'PASSED') throw new Error('FIXED_REFERENCE_REJECTED');
  }
  report.status = 'REFERENCE_VALIDATED';
} catch (error) {
  report.status = controller.signal.aborted ? 'CANCELLED' : 'FAILED';
  report.reasonCode = error instanceof Error ? /^[A-Z][A-Z0-9_]+/.exec(error.message)?.[0] ?? 'FIXED_ACCEPTANCE_FAILED' : 'FIXED_ACCEPTANCE_FAILED';
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString(); report.passed = observations.filter(item => item.status === 'PASSED').length; save();
  process.off('SIGINT', cancel); process.off('SIGTERM', cancel);
}
