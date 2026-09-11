/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证一键页面只按服务端发布凭据展示已验证状态。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkbenchPipelinePanel } from '../../web/WorkbenchPipeline.js'
for (const verified of [false, true]) test(`pipeline panel distinguishes execution completion from publication (${verified})`, async () => {
  const panel = { innerHTML: '' }
  const pipeline = { pipelineId: 'pipeline', contractVersion: 'knowledge-pipeline-v16', status: 'SUCCEEDED', currentStage: 'ASSOCIATE', children: {}, iterations: [], materialIds: [], fixedSuites: [{ moduleId: 'module' }] }
  const publication = { publicationId: 'publication', files: [{ path: 'cards/card.md', ref: { sha256: 'a'.repeat(64) } }] }
  const app = createWorkbenchPipelinePanel({ root: { querySelector: () => panel, addEventListener() {} }, escapeHtml: String, isEditable: () => true, selection: () => null,
    request: async url => url === '/api/v1/workbench-pipelines' ? { items: [pipeline] } : { pipeline, tasks: [], publication: verified ? publication : null, publicationVerified: verified } })
  app.refresh(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(panel.innerHTML.includes('已验证并发布'), verified)
  assert.equal(panel.innerHTML.includes('尚未完成验证发布'), !verified)
  assert.equal(panel.innerHTML.includes('/api/v1/workbench-publications/publication/artifacts/'), verified)
  assert.equal(panel.innerHTML.includes('旧执行契约'), false)
})
