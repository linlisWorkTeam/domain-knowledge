/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供独立知识修订、恢复、前后正文及索引结果。
 */
export function createKnowledgeRevisionPanel({ root, request, escapeHtml: escape, isEditable, selection, evidence }) {
  let task = null, checkpoints = [], events = [], loadedFor = null, timer = null, busy = false, notice = ''
  const bodies = new Map()
  const host = () => root.querySelector('[data-knowledge-revision-panel]')
  const current = () => task?.contractVersion === 'knowledge-workbench-v1' && task?.input.parameters.revisionContract === 'knowledge-revision-v5'
  const active = () => current() && ['PENDING', 'RUNNING'].includes(task.status)
  const reasons = { AGENT_STAGE_TIMEOUT: '角色阶段达到时间限制；已完成结果和累计用量保留，可检查现有证据后恢复。', REVISION_SOURCE_REVIEW_REJECTED: '修订正文未通过独立源码复核；草稿已保留，未建立新版本或更新索引。', AGENT_OUTPUT_INVALID: '模型输出未符合当前角色协议，已完成卡片保留；可查看证据后恢复。', REVIEW_CORRECTION_OUTSIDE_EVIDENCE: '复核意见超出了失败证据授权的章节，未接受该意见。', REVISION_REVIEW_BINDING_INVALID: '复核意见与原始角色证据不匹配，未交给 DocGen。', CANDIDATE_PARENT_CHANGED: '卡片已被其他任务修改，未覆盖新版本。', REVISION_SOURCE_LIMIT: '固定参考材料缺失或超出修订容量，请调整模块范围。', INDEX_BUILD_PARTIAL: '卡片已保存，部分索引未完成；恢复会继续索引。', REVISION_CARD_CHANGED: '卡片已有其他修改，请使用新版本重新评测。', REVISION_CORRECTION_OUTSIDE_EVIDENCE: 'Review 意见超出可信章节范围，未授权修改。', REVISION_NO_PROGRESS: '修订回到了已有正文，暂停以避免反复改写。', REVISION_QUALITY_REJECTED: '修订候选未通过质量检查，不能推进。', REVIEW_NO_KNOWLEDGE_CORRECTION: 'Review 没有给出知识修订意见，保留原卡片并继续诊断。' }
  const download = (ref, label) => ref ? `<button class="secondary-button" type="button" data-download-artifact="/api/v1/stage-tasks/${escape(task.taskId)}/artifacts/${escape(ref.sha256)}">${label}</button>` : ''
  function render() {
    const panel = host(); if (!panel) return
    const eligible = evidence()?.modules?.some(module => module.candidates.length)
    if (!eligible && !task) { panel.innerHTML = ''; return }
    const cards = task?.result?.summary.cards ?? checkpoints.filter(item => item.key.startsWith('revision-card:')).map(item => item.result.summary)
    panel.innerHTML = `<h4>知识修订</h4><p>Review 判断原因，DocGen 只修改获准章节，最终正文通过独立源码复核后保存并刷新索引。修订候选仍需重新重建和评测。</p>
      ${eligible ? `<button class="primary-button" type="button" data-knowledge-revision-action="start" ${busy || active() || !isEditable() ? 'disabled' : ''}>执行知识修订</button>` : ''}<p role="status">${escape(notice)}</p>
      ${task ? `<p>${escape({ PENDING: '排队中', RUNNING: '修订中', SUCCEEDED: '修订执行完成', FAILED: '执行失败', PAUSED: '已暂停', CANCELLED: '已取消' }[task.status] ?? '未知')} · 本任务模型调用 ${escape(task.usage.modelCalls)} 次</p><p>${escape(reasons[task.reasonCode] ?? task.reasonCode ?? '')}</p>
      ${!current() ? '<p>旧修订契约，仅可读取。</p>' : ''}${cards.map(card => `<article>${card.quality === 'REJECTED' ? `<p>质量检查未通过：${(card.qualityWeakPoints ?? []).map(escape).join('；')}</p>` : ''}<p>${escape(card.heading ?? '')} · ${escape(card.criterion ?? '')}</p>${card.versionId ? `<button class="text-button" type="button" data-version-id="${escape(card.versionId)}">查看修订版本</button><button class="secondary-button" type="button" data-revision-bodies="${escape(card.versionId)}" data-base-version="${escape(card.baseVersionId)}">查看修订前后正文</button>${download(card.beforeRef, '下载修订前正文')}${download(card.afterRef, '下载修订后正文')}` : `<p>${card.outcome === 'UNCHANGED' ? 'Review 未要求修改该卡片。' : ''}${(card.unresolved ?? []).map(reason => escape(reasons[reason] ?? reason)).join('；')}</p>${download(card.draftRef, '下载未通过复核的草稿')}${download(card.sourceReviewRef, '下载源码复核意见')}`}
      ${bodies.has(card.versionId) ? `<div class="source-diff-columns"><section><h5>修订前</h5><pre class="json-view">${escape(bodies.get(card.versionId).before)}</pre></section><section><h5>修订后</h5><pre class="json-view">${escape(bodies.get(card.versionId).after)}</pre></section></div>` : ''}</article>`).join('')}
      ${task.result?.summary.outcome === 'NO_REVISION' ? '<p>没有修改知识。原行为失败仍需诊断重建代码。</p>' : ''}${task.result?.summary.outcome === 'QUALITY_REJECTED' ? '<p>修订被质量检查拒绝，保留候选与原版本。</p>' : ''}${task.result?.summary.indexed ? '<p>受影响索引已刷新，候选尚未验证。</p>' : ''}${['REVISED_INDEXED', 'NO_REVISION'].includes(task.result?.summary.outcome) ? `<button class="primary-button" type="button" data-knowledge-revision-action="rebuild" ${busy || !isEditable() ? 'disabled' : ''}>${task.result?.summary.outcome === 'NO_REVISION' ? '重新生成代码' : '重建修订版本'}</button>` : ''}
      ${(task.result?.summary.unresolved ?? []).map(item => `<p>未解决：${escape(reasons[item.reason] ?? item.reason ?? (item.unresolved ?? []).join('；'))}</p>`).join('')}
      ${events.filter(event => event.detail?.phase === 'role-stage-attempt' && ['REJECTED', 'FAILED'].includes(event.detail.status)).map(event => `<p>角色尝试：${escape(event.detail.role)} · ${escape(event.detail.stage)} · 任务尝试 ${escape(event.detail.taskAttempt)} / 阶段尝试 ${escape(event.detail.attempt)} · ${escape({ REJECTED: '校验拒绝', FAILED: '失败' }[event.detail.status])} ${escape(event.detail.issueHint ?? '')} ${download(event.detail.artifactRef, '下载失败尝试及校验反馈')}</p>`).join('')}
      ${active() ? `<button class="secondary-button" type="button" data-knowledge-revision-action="cancel" ${busy || !isEditable() ? 'disabled' : ''}>取消修订</button>` : ''}
      ${current() && ['FAILED', 'PAUSED', 'CANCELLED'].includes(task.status) ? `<button class="secondary-button" type="button" data-knowledge-revision-action="resume" ${busy || !isEditable() ? 'disabled' : ''}>恢复修订</button>` : ''}` : ''}`
  }
  async function observe() {
    clearTimeout(timer); timer = null; if (!task || !host()) return
    const id = task.taskId, parent = selection()
    try { const result = await request(`/api/v1/stage-tasks/${encodeURIComponent(id)}`); if (selection() !== parent || task?.taskId !== id) return
      task = result.task; checkpoints = result.checkpoints ?? []; events = result.events ?? []; render()
    } catch { notice = '修订状态暂不可读，已完成结果保留。'; render() }
    if (active() && host()) timer = setTimeout(observe, 800)
  }
  root.addEventListener('click', async event => {
    const bodyButton = event.target.closest('[data-revision-bodies]')
    if (bodyButton) { const id = bodyButton.dataset.revisionBodies
      try { const [before, after] = await Promise.all([request(`/api/v1/knowledge/${encodeURIComponent(bodyButton.dataset.baseVersion)}`), request(`/api/v1/knowledge/${encodeURIComponent(id)}`)]); bodies.set(id, { before: before.body, after: after.body }); render() }
      catch { notice = '正文暂不可读，可重试或下载。'; render() } return
    }
    const action = event.target.closest('[data-knowledge-revision-action]')?.dataset.knowledgeRevisionAction
    if (!action || busy || !isEditable()) return
    const parent = selection(); if (!parent) return
    busy = true; notice = ''; render()
    try {
      if (action === 'rebuild') {
        const result = await request('/api/v1/reconstructions', { method: 'POST', body: JSON.stringify({ snapshotId: task.result.summary.snapshotId, versionIds: task.result.summary.versionIds, retryEvaluationTaskId: task.result.summary.evaluationTaskId }) })
        root.dispatchEvent(new CustomEvent('workbench-reconstruction-started', { detail: result.task })); return
      }
      const result = await request(action === 'start' ? '/api/v1/knowledge-revisions' : `/api/v1/stage-tasks/${encodeURIComponent(task.taskId)}/${action}`, { method: 'POST', body: JSON.stringify(action === 'start' ? { evaluationTaskId: parent } : action === 'resume' ? { inputDigest: task.inputDigest } : {}) })
      if (selection() !== parent) return
      task = result.task; await observe()
    } catch (error) { notice = reasons[error.code] ?? error.code ?? '修订启动失败' }
    finally { busy = false; render() }
  })
  return { refresh() {
    const id = selection(); if (!id) { task = null; loadedFor = null; clearTimeout(timer); timer = null; render(); return }
    if (loadedFor !== id) { loadedFor = id; task = null; checkpoints = []; events = []; clearTimeout(timer); timer = null
      request('/api/v1/stage-tasks').then(result => { if (selection() !== id) return
        task = result.items.find(item => item.input.parameters.operation === 'KNOWLEDGE_REVISION' && item.input.parameters.evaluationTaskId === id) ?? null; return observe()
      }).catch(() => { notice = '历史修订暂不可读。'; render() })
    } else if (active() && !timer) queueMicrotask(observe)
    render()
  } }
}
