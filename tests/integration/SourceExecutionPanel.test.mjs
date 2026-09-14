/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证来源页面显示真实配置边界，失败和旧记录不伪造范围。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createSourceVerificationPanel } from '../../web/KnowledgeSourceVerification.js'
for (const mode of ['current', 'unavailable', 'legacy', 'waiting']) test(`source build scope display: ${mode}`, async () => {
  const panel = { innerHTML: '' }, requests = []
  const task = { taskId: 'source', status: 'SUCCEEDED', contractVersion: 'knowledge-workbench-v1', usage: { modelCalls: 7 },
    input: { cardVersionIds: ['v1'], parameters: { operation: 'KNOWLEDGE_SOURCE_VERIFICATION', verificationContract: mode === 'legacy' ? 'knowledge-source-verification-v4' : 'knowledge-source-verification-v5',
      evaluationTaskId: 'eval', ...(mode === 'legacy' ? {} : { executionScopesRef: { sha256: 'scope' } }) } },
    result: { artifactRefs: ['current', 'unavailable'].includes(mode) ? [{ sha256: 'scope' }] : [], summary: { outcome: 'UNRESOLVED', cards: [] } } }
  const scope = { schemaVersion: 'source-execution-scope-v1', configurationCoverage: 'SINGLE_FROZEN_BUILD', language: 'c', architecture: 'x64',
    build: { cCompiler: 'gcc', cStandard: 'c11', definitions: [], includeDirectories: [] }, referenceRef: { sha256: 'reference' }, fingerprintRef: { sha256: 'tools' } }
  const app = createSourceVerificationPanel({ root: { querySelector: selector => selector === '[data-source-verification-panel]' ? panel : null, addEventListener() {} },
    selection: () => 'eval', isEditable: () => true, escapeHtml: String, request: async url => {
      requests.push(url)
      if (url.endsWith('/artifacts/scope')) { if (mode === 'unavailable') throw new Error('unavailable'); return [{ moduleId: 'jsmn', scope }] }
      return url === '/api/v1/stage-tasks' ? { items: [task] } : { task, checkpoints: [], events: [] }
    } })
  app.refresh(); await new Promise(resolve => setImmediate(resolve))
  assert.match(panel.innerHTML, /仍有未解决问题/)
  if (mode === 'current') {
    assert.match(panel.innerHTML, /jsmn · gcc · c11 · x64/)
    assert.match(panel.innerHTML, /宏定义：未额外指定/)
    assert.match(panel.innerHTML, /不等于所有宏组合已验证/)
    assert.match(panel.innerHTML, /artifacts\/reference/)
    assert.match(panel.innerHTML, /artifacts\/tools/)
  } else if (mode === 'unavailable') {
    assert.match(panel.innerHTML, /构建范围暂不可读/)
    assert.match(panel.innerHTML, /下载冻结构建范围/)
    assert.doesNotMatch(panel.innerHTML, /gcc/)
  } else if (mode === 'waiting') {
    assert.match(panel.innerHTML, /构建证据尚未完成运行校验/);
    assert.equal(requests.some(url => url.includes('/artifacts/')), false)
    assert.doesNotMatch(panel.innerHTML, /下载冻结构建范围/)
  } else {
    assert.doesNotMatch(panel.innerHTML, /本次实际构建范围|gcc/)
    assert.equal(requests.some(url => url.includes('/artifacts/')), false)
  }
})

test('historical reassessment is an explicit action rather than a resume of the old task', async () => {
  const panel = { innerHTML: '' }, posts = []; let click;
  const task = { taskId: 'source', status: 'SUCCEEDED', contractVersion: 'knowledge-workbench-v1', usage: {},
    input: { cardVersionIds: ['v'], parameters: { operation: 'KNOWLEDGE_SOURCE_VERIFICATION', verificationContract: 'knowledge-source-verification-v5', evaluationTaskId: 'eval' } },
    result: { artifactRefs: [], summary: { outcome: 'SOURCE_MISMATCH', cards: [{ versionId: 'v', outcome: 'SOURCE_MISMATCH', sections: [{ section: 'Value', outcome: 'SOURCE_MISMATCH', concernResolutions: [{ disposition: 'DISPROVED', reason: '固定源码明确声明了接口。' }] }] }] } } };
  const app = createSourceVerificationPanel({ root: { querySelector: selector => selector === '[data-source-verification-panel]' ? panel : null, addEventListener: (_, fn) => { click = fn } },
    selection: () => 'eval', isEditable: () => true, escapeHtml: String, request: async (url, options) => {
      if (options) posts.push({ url, body: JSON.parse(options.body) });
      return url === '/api/v1/stage-tasks' ? { items: [task] } : { task, checkpoints: [], events: [] };
    } });
  app.refresh(); await new Promise(resolve => setImmediate(resolve));
  assert.match(panel.innerHTML, /重新核实历史意见/);
  assert.match(panel.innerHTML, /意见核实：已反驳 · 固定源码明确声明了接口/);
  await click({ target: { closest: selector => selector === '[data-source-verification-action]' ? { dataset: { sourceVerificationAction: 'reassess' } } : null } });
  assert.deepEqual(posts, [{ url: '/api/v1/source-verifications', body: { evaluationTaskId: 'eval', reassessHistoricalFindings: true } }]);
});
