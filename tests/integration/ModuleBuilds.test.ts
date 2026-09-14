/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证同语言模块冻结不同构建配置与工具链指纹，旧快照保持原身份。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeToolchain } from '../../src/infrastructure/evaluation/project/NativeToolchain.ts';
import { NativeCaseExecutor } from '../../src/infrastructure/evaluation/project/NativeCaseExecutor.ts';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { moduleBuild, moduleFingerprintKey, projectModuleBuilds } from '../../src/domain/workbench/WorkbenchProject.ts';
import type { NativeBehaviorSuite } from '../../src/domain/evaluation/NativeBehaviorSuite.ts';
import { canonicalJson, createStageTask, type JsonValue } from '../../src/domain/workbench/StageTask.ts';
import { sha256, type ArtifactRef } from '../../src/domain/Domain.ts';
const nativeMode = process.env.WP_TEST_NATIVE_MODULE_BUILDS === '1';
test(`two C modules freeze separate settings and execute fixed cases (${nativeMode ? 'real gcc' : 'controlled runner'})`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'module-builds-')); const repository = join(root, 'repo');
  execFileSync('git', ['init', '-q', repository]);
  for (const name of ['first', 'second']) writeFileSync(join(repository, name + '.c'), `int ${name}(void) { return VALUE; }`);
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: repository });
  git('add', '.'); git('commit', '-qm', 'modules');
  const composition = createComposition({ runtimeDir: join(root, 'runtime') });
  try {
    const projects = composition.apps.workbenchProjects;
    const legacy = await projects.create({ directory: repository });
    const empty = await projects.create({ directory: repository, moduleBuilds: {} });
    assert.equal(legacy.snapshotId, empty.snapshotId); assert.equal(legacy.moduleBuilds, undefined);
    assert.equal(moduleFingerprintKey(legacy, 'first', 'c'), 'c');
    const project = await projects.create({ directory: repository, moduleBuilds: { first: { cStandard: 'c99', definitions: ['VALUE=1'] }, second: { cStandard: 'c17', definitions: ['VALUE=2'] } } });
    assert.notEqual(project.snapshotId, legacy.snapshotId);
    assert.equal(moduleBuild(project, 'first').cStandard, 'c99'); assert.equal(moduleBuild(project, 'second').cStandard, 'c17');
    assert.throws(() => projectModuleBuilds({ unknown: {} }, project.modules, project.build), /PROJECT_MODULE_BUILD_INVALID/);
    assert.throws(() => projectModuleBuilds({ first: { includeDirectories: ['../secret'] } }, project.modules, project.build), /PROJECT_BUILD_INVALID/);
    const ids: string[] = []; const interfaces = new Map<string, ArtifactRef>();
    for (const module of project.modules) {
      const interfaceRef = await composition.artifacts.put(Buffer.from(JSON.stringify({ schemaVersion: 'native-interface-v1', language: 'c', astFilter: null, declarations: [{ kind: 'FunctionDecl', name: module.moduleId, type: 'int (void)', parameters: [] }], sourcePath: module.sourcePaths[0] })), 'application/json');
      const card = await composition.apps.flywheel.ingestCandidate({ moduleId: `unit-${module.moduleId}`, title: module.moduleId, description: 'module', body: '# Module\n## Behavior\nReturns one.',
        provenance: [{ path: module.sourcePaths[0]!, commit: project.commit, pinned: true }], metadata: { cardId: `card-${module.moduleId}`, language: 'c', sourceModule: module.moduleId, projectSnapshotId: project.snapshotId, repositoryId: project.repositoryId, interfaceRef } });
      ids.push(card.version.versionId); interfaces.set(module.moduleId, interfaceRef);
    }
    const seen: string[][] = [];
    composition.apps.workbenchReconstruction.dependencies.snapshot = async (language, build) => {
      seen.push(build.definitions); return { schemaVersion: 'native-toolchain-v1', language, build, architecture: 'fixture', files: [], digest: sha256(canonicalJson(build)) };
    };
    const input = await composition.apps.workbenchReconstruction.prepare(project.snapshotId, ids);
    assert.deepEqual(seen, [['VALUE=1'], ['VALUE=2']]);
    const refs = input.parameters.fingerprints as unknown as Record<string, ArtifactRef>;
    const first = moduleFingerprintKey(project, 'first', 'c'), second = moduleFingerprintKey(project, 'second', 'c');
    assert.deepEqual(Object.keys(refs).sort(), [first, second].sort()); assert.notEqual(refs[first]!.sha256, refs[second]!.sha256);
    const frozen = JSON.parse(Buffer.from(await composition.artifacts.get(refs[first]!)).toString('utf8'));
    assert.deepEqual(frozen.build.definitions, ['VALUE=1']);
    // The default checks application handoff; the explicit native acceptance mode runs gcc in isolation.
    const native = new NativeToolchain(); const executor = new NativeCaseExecutor(native);
    composition.apps.nativeEvaluation.dependencies.snapshot = composition.apps.workbenchReconstruction.dependencies.snapshot;
    const observed: Array<{ target: string; value: string; phase: string }> = [];
    composition.apps.workbenchEvaluation.dependencies.native = {
      compileAndRun: async () => { throw new Error('UNEXPECTED_BASELINE_CALL'); },
      publicInterface: async input => {
        const id = input.entryPath.replace(/\.c$/, '');
        assert.deepEqual(input.build, moduleBuild(project, id));
        if (nativeMode) return native.publicInterface(input);
        return JSON.parse(Buffer.from(await composition.artifacts.get(interfaces.get(id)!)).toString('utf8'));
      }
    };
    const command = { exitCode: 0, timedOut: false, outputLimitExceeded: false, durationMs: 0, stdout: '', stderr: '' };
    composition.apps.nativeEvaluation.dependencies.runner = { execute: async (input, contract, sample) => {
      const target = contract.targetFunctions[0]!; const value = input.build.definitions[0]!.split('=')[1]!;
      observed.push({ target, value, phase: input.files.some(file => file.content.includes('GENERATED')) ? 'generated' : 'reference' });
      if (nativeMode) return executor.execute(input, contract, sample);
      return { caseId: sample.caseId, status: 'PASSED', reasonCode: null, mismatches: [], actual: { value }, report: { build: command, execution: command } };
    } };
    const modules = [];
    for (const [index, module] of project.modules.entries()) {
      const codeRef = await composition.artifacts.put(Buffer.from(JSON.stringify({ files: [{ path: module.sourcePaths[0], content: `/* GENERATED */ int ${module.moduleId}(void) { return VALUE; }` }] })), 'application/json');
      modules.push({ moduleId: module.moduleId, language: 'c', cardVersionIds: [ids[index]!], interfaceRef: interfaces.get(module.moduleId)!, codeRef });
    }
    const stages = composition.apps.workbenchStages;
    const parent = stages.store.insert(createStageTask(input, {}, new Date().toISOString()));
    const claim = stages.store.claim(parent.taskId)!;
    stages.store.finish(parent.taskId, claim.leaseId, 'SUCCEEDED', { artifactRefs: modules.flatMap(module => [module.interfaceRef, module.codeRef]), summary: { modules: modules as unknown as JsonValue } }, null);
    const suites = project.modules.map((module, index) => ({ moduleId: module.moduleId, suite: {
      schemaVersion: 'native-cases-v1', cases: [{ caseId: 'value', description: 'module macro', sections: [`${module.moduleId}#Behavior`], variables: [],
        calls: [{ function: module.moduleId, arguments: [], result: 'value' }], observations: [{ name: 'value', kind: 'integer', read: { variable: 'value' } }], expected: { value: String(index + 1) } }]
    } as NativeBehaviorSuite }));
    const fixed = await composition.apps.workbenchFixedEvaluation.start(parent.taskId, suites);
    const completed = await stages.wait(fixed.taskId); assert.equal(completed.status, 'SUCCEEDED', completed.reasonCode ?? '');
    assert.deepEqual((completed.result!.summary.modules as Array<{ status: string }>).map(module => module.status), ['FIXED_PASSED', 'FIXED_PASSED']);
    assert.deepEqual(observed, [
      { target: 'first', value: '1', phase: 'reference' }, { target: 'first', value: '1', phase: 'generated' },
      { target: 'second', value: '2', phase: 'reference' }, { target: 'second', value: '2', phase: 'generated' }
    ]);
    const before = observed.length;
    assert.equal((await composition.apps.workbenchFixedEvaluation.start(parent.taskId, suites)).taskId, fixed.taskId);
    assert.equal(observed.length, before);
  } finally { await composition.close(); rmSync(root, { recursive: true, force: true }); }
});
