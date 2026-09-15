/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证历史输入选择读取固定快照且失败不替换当前项目。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createProjectHistory } from '../../web/ProjectHistory.js'
test('history selection loads the chosen immutable snapshot and retains it after a failed read', async () => {
  const handlers = {}, panel = { innerHTML: '' }, seen = []; let failure = false
  const project = { snapshotId: 'snapshot', directory: '/repo', commit: 'pinned', modules: [{ moduleId: 'module' }] }
  const app = createProjectHistory({ root: { querySelector: () => panel, addEventListener: (name, fn) => { handlers[name] = fn } }, escapeHtml: String, canSelect: () => true,
    onSelect: value => seen.push(value), request: async url => {
      if (url === '/api/v1/projects') return { snapshots: [project] }
      assert.equal(url, '/api/v1/projects/snapshot'); if (failure) throw new Error('offline'); return project
    } })
  app.refresh(); await new Promise(resolve => setImmediate(resolve)); assert.match(panel.innerHTML, /pinned/)
  const event = { target: { matches: () => true, value: 'snapshot' } }
  await handlers.change(event); assert.deepEqual(seen, [project]); assert.match(panel.innerHTML, /已载入冻结输入/)
  failure = true; await handlers.change(event); assert.deepEqual(seen, [project]); assert.match(panel.innerHTML, /原项目输入保留/)
})
test('stage history retains snapshot and stage filters on every page', async () => {
  const { readStageHistory } = await import('../../web/StageHistory.js')
  const requests = []
  const result = await readStageHistory(async path => {
    const url = new URL(path, 'http://local'); requests.push(url)
    return url.searchParams.has('cursor') ? { items: [{ taskId: 'older' }], nextCursor: null } : { items: [{ taskId: 'newer' }], nextCursor: 'next+page' }
  }, 'FLYWHEEL', 'snapshot')
  assert.deepEqual(result.items.map(item => item.taskId), ['newer', 'older'])
  assert.equal(requests.length, 2)
  for (const url of requests) { assert.equal(url.searchParams.get('snapshotId'), 'snapshot'); assert.equal(url.searchParams.get('stage'), 'FLYWHEEL') }
  assert.equal(requests[1].searchParams.get('cursor'), 'next+page')
})
