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
