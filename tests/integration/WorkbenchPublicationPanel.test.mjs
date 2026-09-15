/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证发布面板冻结任务选择、分页和重建切换时的异步隔离。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkbenchPublicationPanel, publicationDownloadName } from '../../web/WorkbenchPublication.js'
const tick = () => new Promise(resolve => setImmediate(resolve))
test('publication panel loads all pages and submits only explicitly selected bound task IDs', async () => {
  const handlers = {}, panel = { innerHTML: '' }, requests = []
  const root = { querySelector: () => panel, addEventListener: (name, callback) => { handlers[name] = callback } }
  const task = (taskId, parameters) => ({ taskId, status: 'SUCCEEDED', input: { stage: 'EVALUATE', parameters } })
  const tasks = [task('eval', { reconstructionTaskId: 'code' }), task('fixed', { operation: 'FIXED_NATIVE_EVALUATION', reconstructionTaskId: 'code' }),
    task('source', { operation: 'KNOWLEDGE_SOURCE_VERIFICATION', evaluationTaskId: 'eval' }), task('unrelated', { reconstructionTaskId: 'other' })]
  let published = false
  const record = { publicationId: 'pub', status: 'COMMITTED', versionIds: ['version'], files: [{ path: 'cards/card.md', ref: { sha256: 'a'.repeat(64) } }] }
  const request = async (url, options) => {
    requests.push({ url, options })
    if (options) { published = true; return { publication: record } }
    if (url === '/api/v1/stage-tasks/code') return { task: { input: { projectId: 'project', cardVersionIds: ['version'] } } }
    if (url.startsWith('/api/v1/stage-tasks?')) return url.includes('cursor=') ? { items: tasks.slice(2), nextCursor: null } : { items: tasks.slice(0, 2), nextCursor: 'next' }
    return { items: published ? [record] : [] }
  }
  const app = createWorkbenchPublicationPanel({ root, request, escapeHtml: String, isEditable: () => true, selection: () => 'code' })
  app.refresh(); await tick()
  assert.ok(requests.some(item => item.url.includes('cursor=next')))
  assert.equal(panel.innerHTML.includes('unrelated'), false)
  assert.match(panel.innerHTML, /data-publication-action="publish" disabled/)
  for (const [field, value] of [['evaluation', 'eval'], ['fixed', 'fixed'], ['source', 'source']]) handlers.change({ target: { dataset: { publicationSelect: field }, value } })
  await handlers.click({ target: { closest: () => ({ dataset: { publicationAction: 'publish' } }) } })
  assert.deepEqual(JSON.parse(requests.find(item => item.options).options.body), { reconstructionTaskId: 'code', evaluationTaskId: 'eval', fixedEvaluationTaskId: 'fixed', sourceVerificationTaskId: 'source' })
  assert.match(panel.innerHTML, /已验证并发布/)
  assert.match(panel.innerHTML, /\/api\/v1\/workbench-publications\/pub\/artifacts/)
})
test('publication panel ignores a late response after the selected reconstruction disappears', async () => {
  const handlers = {}, panel = { innerHTML: '' }; let selected = 'code', release
  const hold = new Promise(resolve => { release = resolve })
  const app = createWorkbenchPublicationPanel({ root: { querySelector: () => panel, addEventListener: (name, fn) => { handlers[name] = fn } },
    request: async url => { await hold; return url.endsWith('/code') ? { task: { input: { projectId: 'project', cardVersionIds: ['old'] } } } : { items: [], nextCursor: null } },
    escapeHtml: String, isEditable: () => true, selection: () => selected })
  app.refresh(); selected = null; app.refresh(); release(); await tick()
  assert.equal(panel.innerHTML, '')
})

test('publication downloads keep stable card filenames and reject unsafe suggested paths', () => {
  assert.equal(publicationDownloadName('attachment; filename="card-123.md"'), 'card-123.md')
  assert.equal(publicationDownloadName('attachment; filename="manifest.json"'), 'manifest.json')
  assert.equal(publicationDownloadName('attachment; filename="../../secret.md"'), 'knowledge-evidence.json')
  assert.equal(publicationDownloadName('attachment; filename="script.html"'), 'knowledge-evidence.json')
  assert.equal(publicationDownloadName(null), 'knowledge-evidence.json')
})
