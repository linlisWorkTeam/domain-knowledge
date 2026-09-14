/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证补证拒绝页面保留未知段落并明确候选未执行。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createKnowledgeEvaluationPanel } from '../../web/KnowledgeEvaluation.js'
test('off-target rejection displays missing sections without claiming an oracle failure', async () => {
  const panel = { innerHTML: '' }, listeners = new Map()
  const task = { taskId: 'evaluation', status: 'FAILED', contractVersion: 'knowledge-workbench-v1', reasonCode: 'TEST_CANDIDATE_REJECTED', limits: {}, usage: { modelCalls: 1 } }
  const summary = { moduleId: 'module', status: 'CANDIDATE_REJECTED', reportRef: { sha256: 'report' }, proposed: 1, reused: 31 }
  const coverage = { candidateEligible: false, semanticCoverageProven: false, matchedSectionIds: [], unmatchedSectionIds: ['card#Evidence'] }
  createKnowledgeEvaluationPanel({ root: { querySelector: selector => selector === '[data-native-evaluation-panel]' ? panel : null,
    addEventListener: (name, listener) => listeners.set(name, listener) }, escapeHtml: String, isEditable: () => true, selection: () => null,
    request: async url => url.endsWith('/artifacts/report') ? { ...summary, targetCoverage: coverage, cases: [] }
      : { task, checkpoints: [{ key: 'candidate-rejection:module:0', result: { summary } }], events: [] } })
  listeners.get('workbench-evaluation-selected')({ detail: task })
  await new Promise(resolve => setImmediate(resolve))
  assert.match(panel.innerHTML, /未执行候选测试/)
  assert.match(panel.innerHTML, /未命中段落：card#Evidence/)
  assert.match(panel.innerHTML, /引用命中不代表语义验证通过/)
  assert.match(panel.innerHTML, /重新生成候选测试/)
  assert.match(panel.innerHTML, /复用 31 个用例/)
})

test('capacity rejection shows retained gates, required capacity and the retry action', async () => {
  const panel = { innerHTML: '' }, listeners = new Map()
  const task = { taskId: 'capacity', status: 'FAILED', contractVersion: 'knowledge-workbench-v1', reasonCode: 'TEST_CANDIDATE_REJECTED', limits: {}, usage: { modelCalls: 2 } }
  const summary = { moduleId: 'module', status: 'CANDIDATE_REJECTED', reportRef: { sha256: 'capacity-report' }, proposed: 32, reused: 37 }
  createKnowledgeEvaluationPanel({ root: { querySelector: selector => selector === '[data-native-evaluation-panel]' ? panel : null,
    addEventListener: (name, listener) => listeners.set(name, listener) }, escapeHtml: String, isEditable: () => true, selection: () => null,
    request: async url => url.endsWith('/artifacts/capacity-report') ? { ...summary, candidateConstraint: { code: 'NATIVE_TRUSTED_GATE_LIMIT', maximumCases: 64, retainedCases: 37, requiredCases: 69 }, cases: [] }
      : { task, checkpoints: [{ key: 'candidate-rejection:module:0', result: { summary } }], events: [] } })
  listeners.get('workbench-evaluation-selected')({ detail: task })
  await new Promise(resolve => setImmediate(resolve))
  assert.match(panel.innerHTML, /合并后需要 69 条用例，超过 64 条容量/)
  assert.match(panel.innerHTML, /已保留 37 条可信用例/)
  assert.match(panel.innerHTML, /本批候选未执行/)
  assert.match(panel.innerHTML, /重新生成候选测试/)
})
