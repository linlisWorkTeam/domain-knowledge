/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证卡片分组、历史范围和异步阅读的一致性。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createKnowledgeWorkspace, groupKnowledgeCards, knowledgeVersionOptions } from '../../web/KnowledgeWorkspace.js'

test('groups cards without interpreting module IDs as filesystem paths', () => {
  const a = { moduleId: 'core/io', versionId: 'a' }, b = { moduleId: 'core/io', versionId: 'b' }
  assert.deepEqual(groupKnowledgeCards([a, b, { versionId: 'c' }]), [
    { moduleId: 'core/io', cards: [a, b] }, { moduleId: '未分组', cards: [{ versionId: 'c' }] },
  ])
})

test('history retains current version, removes duplicate and invalid identities', () => {
  const current = { versionId: 'v2' }
  assert.deepEqual(knowledgeVersionOptions(current, [{ versionId: 'v1' }, { versionId: 'v2' }, {}]), [current, { versionId: 'v1' }])
})

function fixture(request) {
  const listeners = new Map(), target = { innerHTML: '', setAttribute() {}, removeAttribute() {}, querySelector() { return null } }
  const list = { innerHTML: '' }, count = { textContent: '' }
  let present = true
  const host = {
    classList: { add() {}, remove() {}, toggle() {} }, contains() { return true }, querySelectorAll() { return [] },
    querySelector(selector) { return selector === '[data-workspace-reader]' ? target : selector === '#knowledge-list' ? list : selector === '#knowledge-count' ? count : null },
  }
  const root = { addEventListener(kind, fn) { listeners.set(kind, fn) }, querySelector() { return present ? host : null } }
  const workspace = createKnowledgeWorkspace({ root, request, escapeHtml: String, renderMarkdown: (body) => ({ html: body, headings: [] }), displayLabel: String, formatDate: String, onDetails() {} })
  return {
    workspace, target,
    select(id) { const button = { dataset: { workspaceVersion: id }, hasAttribute(name) { return name === 'data-workspace-version' } }; listeners.get('click')({ target: { closest() { return button } } }) },
    leave() { present = false },
  }
}
const settle = () => new Promise((resolve) => setImmediate(resolve))

test('late document response cannot replace a newer document selection', async () => {
  let resolveOld
  const f = fixture((path) => path.endsWith('/old') ? new Promise((resolve) => { resolveOld = resolve })
    : Promise.resolve(path.includes('/cards?') ? { items: [] } : { versionId: 'new', title: 'New document', body: 'NEW_BODY' }))
  f.select('old'); f.select('new'); await settle()
  assert.match(f.target.innerHTML, /NEW_BODY/)
  resolveOld({ versionId: 'old', body: 'OLD_BODY' }); await settle()
  assert.doesNotMatch(f.target.innerHTML, /OLD_BODY/)
})

test('leaving the workspace prevents pending content from being rendered', async () => {
  let resolveRequest
  const f = fixture(() => new Promise((resolve) => { resolveRequest = resolve }))
  f.select('pending'); f.leave(); resolveRequest({ versionId: 'pending', body: 'STALE_BODY' }); await settle()
  assert.doesNotMatch(f.target.innerHTML, /STALE_BODY/)
})

test('search generations reject superseded results and reset on a new workspace', () => {
  const f = fixture(() => Promise.resolve({}))
  const first = f.workspace.beginSearch(), second = f.workspace.beginSearch()
  assert.equal(f.workspace.isCurrentSearch(first), false)
  assert.equal(f.workspace.isCurrentSearch(second), true)
  f.workspace.html()
  assert.equal(f.workspace.isCurrentSearch(second), false)
})
