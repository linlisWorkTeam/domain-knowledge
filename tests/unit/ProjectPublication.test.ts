/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证项目发布不能拼接不同分析清单或遗漏构建输入。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../../src/domain/Domain.ts';
import { buildConstraints, createProjectSnapshot } from '../../src/domain/services/workbench/WorkbenchProject.ts';
import { assertProjectPublication, type ProjectPublicationManifest } from '../../src/domain/services/workbench/ProjectPublication.ts';
function fixture() {
  const ref = { artifactId: `sha256:${sha256('x')}`, sha256: sha256('x'), size: 1, mediaType: 'text/plain' };
  const module = { moduleId: 'm', language: 'c' as const, sourcePaths: ['a.c'], testPaths: [], selectedByDefault: true, reasons: [] };
  const manifest: ProjectPublicationManifest = { schemaVersion: 'repository-analysis-v1', repositoryId: 'repo', directory: '/repo', commit: 'commit', sourceDigest: sha256('source'), modules: [module],
    files: [{ path: 'a.c', objectId: 'source-object', size: 1, language: 'c', kind: 'source' }, { path: 'Makefile', objectId: 'build-object', size: 1, language: 'unsupported', kind: 'build' }] };
  const snapshot = createProjectSnapshot({ repositoryId: 'repo', directory: '/repo', commit: 'commit', sourceDigest: manifest.sourceDigest, modules: [module], build: buildConstraints(),
    sourceFiles: [{ path: 'a.c', objectId: 'source-object', kind: 'source', ref }, { path: 'Makefile', objectId: 'build-object', kind: 'build', ref }], manifestRef: ref }, 'now');
  return { snapshot, manifest };
}
test('project publication recomputes identity and requires all selected source and build objects', () => {
  const f = fixture(); assert.doesNotThrow(() => assertProjectPublication(f.snapshot, f.manifest));
  f.snapshot.build.definitions = ['OTHER=1'];
  assert.throws(() => assertProjectPublication(f.snapshot, f.manifest), /PUBLICATION_PROJECT_IDENTITY_CHANGED/);
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.manifest.files[0]!.objectId = 'other'; },
    (f: ReturnType<typeof fixture>) => { f.manifest.files[0]!.size = 2; },
    (f: ReturnType<typeof fixture>) => { f.manifest.commit = 'other'; },
    (f: ReturnType<typeof fixture>) => { f.manifest.files.push({ ...f.manifest.files[0]! }); },
  ]) { const f = fixture(); mutate(f); assert.throws(() => assertProjectPublication(f.snapshot, f.manifest)); }
  const g = fixture(); g.snapshot.sourceFiles.pop();
  const { schemaVersion: _schema, projectId: _project, snapshotId: _snapshot, createdAt, ...input } = g.snapshot;
  const rewritten = createProjectSnapshot(input, createdAt);
  assert.throws(() => assertProjectPublication(rewritten, g.manifest), /PUBLICATION_PROJECT_FILES_CHANGED/);
});
