/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证生成失败的依赖诊断持久化与匿名受限下载。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';
import { nativeBuildIssues } from '../../src/infrastructure/evaluation/project/NativeBuildDiagnostics.ts';
import type { ArtifactRef } from '../../src/domain/Domain.ts';
test('missing header stops generation before model usage and its diagnostic remains downloadable without login', async () => {
  const root = mkdtempSync(join(tmpdir(), 'generation-diagnostics-')), repository = join(root, 'repo');
  execFileSync('git', ['init', '-q', repository]); writeFileSync(join(repository, 'api.c'), '#include "vendor/api.h"\n');
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: repository });
  git('add', '.'); git('commit', '-qm', 'missing header');
  const instance = createKnowledgeServer({ runtimeDir: join(root, 'runtime'), anonymousAccess: true, writeToken: 'unused-legacy-token' });
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const diagnostic = { exitCode: 1, timedOut: false, outputLimitExceeded: false, stderr: "api.c:1:10: fatal error: 'vendor/api.h' file not found", issues: nativeBuildIssues("fatal error: 'vendor/api.h' file not found") };
    instance.composition.apps.workbenchGeneration.dependencies.native = { publicInterface: async () => { throw new Error('NATIVE_INTERFACE_COMPILE_FAILED', { cause: diagnostic }); }, compileAndRun: async () => { throw new Error('UNEXPECTED_COMPILE'); } };
    instance.composition.apps.workbenchGeneration.dependencies.model = () => { throw new Error('UNEXPECTED_MODEL_CALL'); };
    const project = await instance.composition.apps.workbenchProjects.create({ directory: repository });
    const task = await instance.composition.apps.workbenchGeneration.start(project.snapshotId);
    const done = await instance.composition.apps.workbenchStages.wait(task.taskId);
    assert.equal(done.reasonCode, 'NATIVE_INTERFACE_COMPILE_FAILED'); assert.equal(done.usage.modelCalls, 0);
    const events = instance.composition.apps.workbenchStages.store.events(task.taskId);
    const detail = events.map(event => event.detail).find(detail => detail && typeof detail === 'object' && !Array.isArray(detail) && detail.phase === 'interface-failed') as Record<string, unknown>;
    assert.deepEqual(detail.issues, [{ kind: 'MISSING_HEADER', name: 'vendor/api.h' }]);
    const ref = detail.diagnosticRef as unknown as ArtifactRef;
    const response = await fetch(`${base}/api/v1/stage-tasks/${task.taskId}/artifacts/${ref.sha256}`);
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), diagnostic);
    const other = await instance.composition.artifacts.put(Buffer.from('unrelated'), 'text/plain');
    assert.equal((await fetch(`${base}/api/v1/stage-tasks/${task.taskId}/artifacts/${other.sha256}`)).status, 404);
  } finally { instance.server.closeAllConnections(); await new Promise<void>(resolve => instance.server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});
