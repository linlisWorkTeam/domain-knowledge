/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：代码复用只能忽略新增诊断，不能忽略源码、知识、模型或工具链变化。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeCodeReuseKey } from '../../src/domain/evaluation/NativeCodeReuse.ts';
import type { StageInput } from '../../src/domain/workbench/StageTask.ts';
test('code cache binds every execution input except the known diagnostic version', () => {
  const input: StageInput = { projectId: 'p', stage: 'FLYWHEEL', sourceRevision: 'commit', sourceDigest: 'source', cardVersionIds: ['v1'], configurationDigest: 'model', parameters: { snapshotId: 'project-and-build', selectionDigest: 'knowledge', configurationRef: 'model', fingerprints: 'tools' } };
  const original = nativeCodeReuseKey(input); assert.ok(original);
  assert.equal(nativeCodeReuseKey({ ...input, parameters: { ...input.parameters, comparisonContract: 'native-source-comparison-v1' } }), original);
  for (const changed of [{ ...input, sourceDigest: 'other-source' }, { ...input, cardVersionIds: ['v2'] }, { ...input, configurationDigest: 'other-model' },
    ...['snapshotId', 'selectionDigest', 'configurationRef', 'fingerprints'].map((key) => ({ ...input, parameters: { ...input.parameters, [key]: 'changed' } }))]) assert.notEqual(nativeCodeReuseKey(changed), original);
  assert.equal(nativeCodeReuseKey({ ...input, parameters: { ...input.parameters, comparisonContract: 'unknown-future' } }), null);
});
