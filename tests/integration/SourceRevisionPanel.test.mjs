/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证混合来源风险下修订入口与已索引版本重建入口，不隐藏未解决项。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createKnowledgeRevisionPanel } from '../../web/KnowledgeRevision.js'

test('mixed source findings expose only explicit correction and retain risk after indexed revision', async () => {
  const panel = { innerHTML: '' }
  let source = { cards: [{ outcome: 'UNRESOLVED', sections: [{ outcome: 'UNRESOLVED', unresolved: ['missing'] }] }] }
  let saved = null
  const app = createKnowledgeRevisionPanel({ source: true, root: { querySelector: () => panel, addEventListener() {} }, escapeHtml: String, isEditable: () => true,
    selection: () => 'source', evidence: () => source, request: async path => path === '/api/v1/stage-tasks' ? { items: saved ? [saved] : [] } : { task: saved, checkpoints: [], events: [] } })
  app.refresh(); await new Promise(resolve => setImmediate(resolve)); assert.equal(panel.innerHTML, '')
  source.cards[0].sections.push({ outcome: 'SOURCE_MISMATCH', unresolved: [] })
  app.refresh(); assert.match(panel.innerHTML, /按来源意见修订/)
  saved = { taskId: 'repair', contractVersion: 'knowledge-workbench-v1', status: 'SUCCEEDED', usage: { modelCalls: 2 },
    input: { parameters: { operation: 'KNOWLEDGE_SOURCE_REVISION', revisionContract: 'knowledge-source-revision-v4', sourceVerificationTaskId: 'source' } },
    result: { summary: { outcome: 'UNRESOLVED', indexed: true, updatedVersionIds: ['new'], cards: [], unresolved: [{ unresolved: ['Still missing source evidence'] }] } } }
  const restored = createKnowledgeRevisionPanel({ source: true, root: { querySelector: () => panel, addEventListener() {} }, escapeHtml: String, isEditable: () => true,
    selection: () => 'source', evidence: () => source, request: async path => path === '/api/v1/stage-tasks' ? { items: [saved] } : { task: saved, checkpoints: [], events: [] } })
  restored.refresh(); await new Promise(resolve => setImmediate(resolve))
  assert.match(panel.innerHTML, /重建修订版本/); assert.match(panel.innerHTML, /Still missing source evidence/)
  assert.doesNotMatch(panel.innerHTML, /已验证并发布/)
  saved.result.summary.indexed = false; restored.refresh(); assert.doesNotMatch(panel.innerHTML, /重建修订版本/)
})

test('source panel starts supplemental evaluation from the frozen source and hands off its task', async () => {
  const { createSourceVerificationPanel } = await import('../../web/KnowledgeSourceVerification.js')
  const panel = { innerHTML: '' }, listeners = [], posts = []
  const source = { taskId: 'source', contractVersion: 'knowledge-workbench-v1', status: 'SUCCEEDED', usage: { modelCalls: 1 },
    input: { cardVersionIds: ['v1'], parameters: { operation: 'KNOWLEDGE_SOURCE_VERIFICATION', verificationContract: 'knowledge-source-verification-v4', evaluationTaskId: 'evaluation' } },
    result: { summary: { outcome: 'UNRESOLVED', cards: [{ versionId: 'v1', moduleId: 'm', outcome: 'UNRESOLVED', sections: [{ section: 'Errors', outcome: 'UNRESOLVED', unresolved: ['Missing error behavior'] }] }] } } }
  let handedOff = null
  const app = createSourceVerificationPanel({ root: { querySelector: selector => selector === '[data-source-verification-panel]' ? panel : null, addEventListener: (_name, listener) => listeners.push(listener) },
    escapeHtml: String, isEditable: () => true, selection: () => 'evaluation', onSupplement: async task => { handedOff = task },
    request: async (path, options) => {
      if (options) { posts.push({ path, body: JSON.parse(options.body) }); return { task: { taskId: 'supplement' } } }
      if (path === '/api/v1/stage-tasks') return { items: [source] }
      if (path.endsWith('/evaluation')) return { task: { input: { parameters: { reconstructionTaskId: 'code' } } } }
      return { task: source, checkpoints: [], events: [] }
    } })
  app.refresh(); await new Promise(resolve => setImmediate(resolve))
  assert.match(panel.innerHTML, /补充验证用例/); assert.match(panel.innerHTML, /Missing error behavior/)
  const event = { target: { closest: selector => selector === '[data-source-verification-action]' ? { dataset: { sourceVerificationAction: 'supplement' } } : null } }
  for (const listener of listeners) await listener(event)
  assert.deepEqual(posts, [{ path: '/api/v1/native-evaluations', body: { reconstructionTaskId: 'code', sourceVerificationTaskId: 'source' } }])
  assert.equal(handedOff.taskId, 'supplement')
  source.status = 'FAILED'; app.refresh(); assert.doesNotMatch(panel.innerHTML, /补充验证用例/)
})
