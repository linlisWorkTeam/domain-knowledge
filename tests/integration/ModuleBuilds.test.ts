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
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { moduleBuild, moduleFingerprintKey, projectModuleBuilds } from '../../src/domain/services/workbench/WorkbenchProject.ts';
import { canonicalJson } from '../../src/domain/services/workbench/StageTask.ts';
import { sha256, type ArtifactRef } from '../../src/domain/Domain.ts';
test('two C modules freeze separate compiler settings and reconstruction fingerprints without changing legacy defaults', async () => {
  const root = mkdtempSync(join(tmpdir(), 'module-builds-')); const repository = join(root, 'repo');
  execFileSync('git', ['init', '-q', repository]);
  for (const name of ['first', 'second']) writeFileSync(join(repository, name + '.c'), `int ${name}(void) { return 1; }`);
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
    const ids: string[] = [];
    for (const module of project.modules) {
      const interfaceRef = await composition.artifacts.put(Buffer.from(JSON.stringify({ declarations: [], sourcePath: module.sourcePaths[0] })), 'application/json');
      const card = await composition.apps.flywheel.ingestCandidate({ moduleId: `unit-${module.moduleId}`, title: module.moduleId, description: 'module', body: '# Module\n## Behavior\nReturns one.',
        provenance: [{ path: module.sourcePaths[0]!, commit: project.commit, pinned: true }], metadata: { cardId: `card-${module.moduleId}`, language: 'c', sourceModule: module.moduleId, projectSnapshotId: project.snapshotId, repositoryId: project.repositoryId, interfaceRef } });
      ids.push(card.version.versionId);
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
  } finally { await composition.close(); rmSync(root, { recursive: true, force: true }); }
});
