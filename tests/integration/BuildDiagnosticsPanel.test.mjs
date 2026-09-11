/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证编译诊断安全显示及旧诊断报告的下载入口。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { interfaceDiagnosticsHtml } from '../../web/BuildDiagnostics.js'
test('diagnostic panel shows explicit dependencies and latest module evidence with escaped content', () => {
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  const html = interfaceDiagnosticsHtml([{ detail: { phase: 'interface-failed', module: 'module', diagnosticRef: { sha256: 'old' } } },
    { detail: { phase: 'interface-failed', module: 'module', diagnosticRef: { sha256: 'new' }, issues: [{ kind: 'MISSING_HEADER', name: '<vendor>.h' }] } }], 'task', escape)
  assert.match(html, /缺少头文件/); assert.match(html, /&lt;vendor&gt;.h/); assert.doesNotMatch(html, /<vendor>/)
  assert.match(html, /\/stage-tasks\/task\/artifacts\/new/); assert.doesNotMatch(html, /artifacts\/old/)
  const legacy = interfaceDiagnosticsHtml([{ detail: { phase: 'interface-failed', module: 'legacy', diagnosticRef: { sha256: 'legacy' } } }], 'task', escape)
  assert.match(legacy, /下载编译诊断/); assert.doesNotMatch(legacy, /缺少头文件/)
})
