/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：按冻结提交和声明式固定用例执行参考验收，不替代知识发布门禁。
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { compareNativeInterfaces } from '../../src/domain/services/evaluation/NativeInterfaceComparison.ts';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { canonicalJson } from '../../src/domain/services/workbench/StageTask.ts';
import type { ArtifactRef } from '../../src/domain/Domain.ts';
import type { ToolchainFile, NativeToolchainInput } from '../../src/application/ports/LanguageToolchainPorts.ts';
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
  if (!['--target', '--repository', '--report', '--runtime', '--reconstruction-task'].includes(key) || !value || args.has(key)) throw new Error('FIXED_ACCEPTANCE_ARGUMENTS_INVALID');
  args.set(key, value);
}
if (['--target', '--repository', '--report'].some(key => !args.has(key)) || args.has('--runtime') !== args.has('--reconstruction-task')) throw new Error('FIXED_ACCEPTANCE_ARGUMENTS_REQUIRED');
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
let composition: ReturnType<typeof createComposition> | undefined;
const report: Record<string, unknown> = { schemaVersion: args.has('--runtime') ? 'native-fixed-generated-v1' : 'native-fixed-reference-v1', target: target.name,
  commit: target.commit, sourceFiles: target.files, suiteDigest: target.fixedSuite.sha256, profile: target.fixedSuite.profile,
  startedAt: new Date().toISOString(), status: 'RUNNING', publicationVerified: false, knowledgeEvaluated: false };
const observations: NativeCaseObservation[] = []; report.observations = observations;
const save = () => { writeFileSync(`${path}.tmp`, JSON.stringify(report, null, 2), { mode: 0o600 }); renameSync(`${path}.tmp`, path); };
save();
try {
  let generatedInput: NativeToolchainInput | undefined;
  if (args.has('--runtime')) {
    composition = createComposition({ runtimeDir: resolve(args.get('--runtime')!) });
    const task = composition.apps.workbenchStages.get(args.get('--reconstruction-task')!);
    if (task.status !== 'SUCCEEDED' || task.input.stage !== 'FLYWHEEL' || task.input.parameters.operation !== undefined || !task.result
      || task.inputDigest !== sha256(canonicalJson({ contractVersion: task.contractVersion, input: task.input, limits: task.limits }))) throw new Error('FIXED_RECONSTRUCTION_REQUIRED');
    const project = composition.apps.workbenchProjects.store.get(String(task.input.parameters.snapshotId));
    if (!project || project.commit !== target.commit || project.sourceDigest !== task.input.sourceDigest || task.input.sourceRevision !== target.commit
      || canonicalJson(project.build) !== canonicalJson(build)) throw new Error('FIXED_RECONSTRUCTION_INPUT_MISMATCH');
    for (const file of files) {
      const pinned = project.sourceFiles.find(item => item.path === file.path);
      if (!pinned || pinned.ref.sha256 !== sha256(file.content) || !await composition.artifacts.verify(pinned.ref)) throw new Error('FIXED_RECONSTRUCTION_SOURCE_MISMATCH');
    }
    const modules = task.result.summary.modules as unknown as Array<{ moduleId: string; language: string; cardVersionIds: string[]; codeRef: ArtifactRef }>;
    const module = modules.find(item => item.moduleId === target.name && item.language === target.language);
    if (!module || !module.cardVersionIds.length || !await composition.artifacts.verify(module.codeRef)) throw new Error('FIXED_RECONSTRUCTION_MODULE_MISMATCH');
    const cards = [];
    for (const id of module.cardVersionIds) {
      const card = composition.repository.getKnowledgeVersion(id);
      if (!card || !task.input.cardVersionIds.includes(id) || card.metadata.projectSnapshotId !== project.snapshotId
        || !await composition.artifacts.verify(card.bodyRef)) throw new Error('FIXED_RECONSTRUCTION_KNOWLEDGE_MISMATCH');
      cards.push({ cardId: card.metadata.cardId, versionId: id, bodyRef: card.bodyRef });
    }
    const output = JSON.parse(Buffer.from(await composition.artifacts.get(module.codeRef)).toString('utf8')) as { files: ToolchainFile[] };
    if (!Array.isArray(output.files) || !output.files.length) throw new Error('FIXED_RECONSTRUCTION_CODE_MISSING');
    report.reconstruction = { taskId: task.taskId, inputDigest: task.inputDigest, snapshotId: project.snapshotId,
      sourceDigest: project.sourceDigest, moduleId: module.moduleId, codeRef: module.codeRef, cards }; save();
    generatedInput = { language: target.language, build, files: output.files };
  }
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
  report.status = 'REFERENCE_VALIDATED'; save();
  if (generatedInput) {
    const generatedApi = await native.publicInterface({ ...generatedInput, entryPath: api.sourcePath,
      ...(api.astFilter ? { astFilter: api.astFilter } : {}), symbols: api.declarations.map(item => item.name) }, controller.signal);
    const comparison = compareNativeInterfaces(api.declarations, generatedApi.declarations);
    report.interfaceComparison = comparison; save();
    if (!comparison.compatible) throw new Error('FIXED_RECONSTRUCTION_INTERFACE_MISMATCH');
    const generatedContract = { ...contract, entryPaths: generatedInput.files.filter(file => /\.(c|cc|cpp|cxx)$/.test(file.path)).map(file => file.path) };
    const generatedObservations: NativeCaseObservation[] = []; report.generatedObservations = generatedObservations;
    report.status = 'GENERATED_RUNNING'; save();
    for (const test of suite.cases) {
      controller.signal.throwIfAborted();
      const observation = await runner.execute(generatedInput, generatedContract, test, controller.signal);
      generatedObservations.push(observation); report.generatedPassed = generatedObservations.filter(item => item.status === 'PASSED').length; save();
      console.log(JSON.stringify({ target: target.name, phase: 'generated', caseId: test.caseId, status: observation.status, reasonCode: observation.reasonCode }));
      if (observation.status !== 'PASSED') throw new Error('FIXED_GENERATED_REJECTED');
    }
    report.status = 'FIXED_GENERATED_VALIDATED';
  }
} catch (error) {
  report.status = controller.signal.aborted ? 'CANCELLED' : 'FAILED';
  report.reasonCode = error instanceof Error ? /^[A-Z][A-Z0-9_]+/.exec(error.message)?.[0] ?? 'FIXED_ACCEPTANCE_FAILED' : 'FIXED_ACCEPTANCE_FAILED';
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString(); report.passed = observations.filter(item => item.status === 'PASSED').length; save();
  if (composition) await composition.close();
  process.off('SIGINT', cancel); process.off('SIGTERM', cancel);
}
