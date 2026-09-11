/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证补证需求仅来自完整绑定的当前未知章节。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeSupplementDemand, type SupplementSourceFinding } from '../../src/domain/services/evaluation/NativeSupplementDemand.ts';
const card = { cardId: 'card', versionId: 'v1', moduleId: 'module', bodyDigest: 'a'.repeat(64), body: '# Card\n\n## Behavior\nA\n\n## Errors\nB' };
const binding = { cardId: card.cardId, versionId: card.versionId, moduleId: card.moduleId, bodyDigest: card.bodyDigest };
const finding = (): SupplementSourceFinding => ({ ...binding, outcome: 'UNRESOLVED', sections: [
  { ...binding, section: 'Behavior', outcome: 'SOURCE_MATCHED' }, { ...binding, section: 'Errors', outcome: 'UNRESOLVED', unresolved: ['missing error input'] }] });
test('freezes only unknown current sections and preserves findings', () => {
  const input = finding(), before = JSON.stringify(input), demand = nativeSupplementDemand([card], [input]);
  assert.equal(demand.demands.length, 1); assert.equal(demand.demands[0]!.sectionId, 'card#Errors');
  assert.equal(JSON.stringify(input), before);
  input.sections!.reverse(); assert.deepEqual(nativeSupplementDemand([card], [input]), demand);
  input.sections![0]!.unresolved = ['another requirement']; assert.notEqual(nativeSupplementDemand([card], [input]).demandDigest, demand.demandDigest);
});
test('rejects missing, stale and foreign section bindings instead of inventing coverage', () => {
  const input = finding(); input.sections!.pop(); assert.throws(() => nativeSupplementDemand([card], [input]), /SECTIONS_INVALID/);
  const stale = finding(); stale.sections![1]!.versionId = 'v0'; assert.throws(() => nativeSupplementDemand([card], [stale]), /BINDING_INVALID/);
  const empty = finding(); empty.sections![1]!.unresolved = []; assert.throws(() => nativeSupplementDemand([card], [empty]), /REASON_REQUIRED/);
});
