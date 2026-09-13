/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证实际构建证据的绑定与单配置范围，不制造跨平台覆盖。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceExecutionScope } from '../../src/domain/services/knowledge/SourceExecutionScope.ts';
import { createPublicationPreparationFixture } from '../helpers/PublicationPreparationFixture.ts';
async function fixture() {
  const { set, contents, project, put } = await createPublicationPreparationFixture();
  const reference = JSON.parse(contents.get(set.referenceRef.sha256)!.toString());
  const toolchain = { schemaVersion: 'native-toolchain-v1', language: 'c' as const, build: project.build,
    architecture: 'x64', digest: set.binding.toolchainDigest };
  set.fingerprintRef = await put(Buffer.from(JSON.stringify(toolchain)), 'application/json');
  return { set, reference, toolchain, build: project.build };
}
test('source scope reports only the frozen build and preserves immutable evidence references', async () => {
  const { set, reference, toolchain, build } = await fixture();
  const result = sourceExecutionScope(set, reference, toolchain, build);
  assert.equal(result.configurationCoverage, 'SINGLE_FROZEN_BUILD');
  assert.equal(result.allMacroCombinationsVerified, false);
  assert.equal(result.compilerPredefinedMacrosEnumerated, false);
  assert.equal(result.publicationVerified, false);
  assert.deepEqual(result.build, build); assert.equal(result.architecture, 'x64');
  result.build.definitions.push('UNTESTED=1'); result.referenceRef.sha256 = 'changed';
  assert.equal(build.definitions.includes('UNTESTED=1'), false);
  assert.notEqual(set.referenceRef.sha256, 'changed');
});
test('foreign builds, toolchains and untrusted sets cannot explain the current reference run', async () => {
  const { set, reference, toolchain, build } = await fixture();
  for (const changed of [{ ...toolchain, digest: '0'.repeat(64) }, { ...toolchain, language: 'cpp' as const },
    { ...toolchain, architecture: '' }, { ...toolchain, build: { ...build, definitions: ['JSMN_STRICT'] } }]) {
    assert.throws(() => sourceExecutionScope(set, reference, changed, build), /BINDING_INVALID/);
  }
  assert.throws(() => sourceExecutionScope(set, { ...reference, sanitizers: false }, toolchain, build), /BINDING_INVALID/);
  assert.throws(() => sourceExecutionScope(set, reference, toolchain, { ...build, definitions: ['JSMN_STRICT'] }), /BINDING_INVALID/);
  assert.throws(() => sourceExecutionScope({ ...set, status: 'REJECTED' }, reference, toolchain, build), /BINDING_INVALID/);
  assert.throws(() => sourceExecutionScope({ ...set, cacheKey: 'changed' }, reference, toolchain, build), /BINDING_INVALID/);
});
