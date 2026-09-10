/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：展示整卡来源复核、冻结版本和独立结论，提供恢复及证据下载。
 */
export function createSourceVerificationPanel({ root, request, escapeHtml: escape, isEditable, selection }) {
  let task = null, checkpoints = [], loadedFor = null, timer = null, busy = false, notice = ''
  const host = () => root.querySelector('[data-source-verification-panel]')
  const current = () => task?.input.parameters.verificationContract === 'knowledge-source-verification-v1'
  const active = () => current() && ['PENDING', 'RUNNING'].includes(task.status)
  const outcomes = { SOURCE_MATCHED: '来源复核匹配', SOURCE_MISMATCH: '正文与源码存在矛盾', UNRESOLVED: '仍有未解决问题' }
  function render() {
    const panel = host(); if (!panel) return
    if (!selection()) { panel.innerHTML = ''; return }
    const cards = task?.result?.summary.cards ?? checkpoints.filter(item => item.key.startsWith('source-card:')).map(item => item.result.summary)
    panel.innerHTML = `<h4>整卡来源复核</h4><p>逐张检查本次评测使用的全部卡片，包括未修改的章节。行为用例通过仍需核对来源；匹配结果不代表已通过发布门禁。</p>
      <button class="secondary-button" type="button" data-source-verification-action="start" ${busy || active() || !isEditable() ? 'disabled' : ''}>复核全部卡片来源</button><p role="status">${escape(notice)}</p>
      ${task ? `<p>${escape({ PENDING: '排队中', RUNNING: '正在复核', SUCCEEDED: '复核执行完成', FAILED: '执行失败', PAUSED: '已暂停', CANCELLED: '已取消' }[task.status] ?? '未知')} · ${escape(outcomes[task.result?.summary.outcome] ?? '')}</p><p>累计模型调用 ${escape(task.usage.modelCalls)} 次 · ${escape(task.reasonCode ?? '')}</p>
      ${cards.map(card => `<article><button class="text-button" type="button" data-version-id="${escape(card.versionId)}">查看冻结卡片</button><p>${escape(card.moduleId)} · ${escape(outcomes[card.outcome] ?? '未知')}</p><p>${escape(card.heading ?? '')} · ${escape(card.criterion ?? '')} ${(card.unresolved ?? []).map(escape).join('；')}</p>${card.reviewRef ? `<button class="secondary-button" type="button" data-download-artifact="/api/v1/stage-tasks/${escape(task.taskId)}/artifacts/${escape(card.reviewRef.sha256)}">下载来源意见</button>` : ''}</article>`).join('')}
      ${active() ? `<button class="secondary-button" type="button" data-source-verification-action="cancel" ${busy || !isEditable() ? 'disabled' : ''}>取消来源复核</button>` : ''}
      ${current() && ['FAILED', 'PAUSED', 'CANCELLED'].includes(task.status) ? `<button class="secondary-button" type="button" data-source-verification-action="resume" ${busy || !isEditable() ? 'disabled' : ''}>恢复来源复核</button>` : ''}` : ''}`
  }
  async function observe() {
    clearTimeout(timer); timer = null; if (!task || !host()) return
    const id = task.taskId, parent = selection()
    try {
      const result = await request(`/api/v1/stage-tasks/${encodeURIComponent(id)}`)
      if (selection() !== parent || task?.taskId !== id) return
      task = result.task; checkpoints = result.checkpoints ?? []; render()
    } catch { if (selection() === parent) { notice = '复核状态暂不可读，已完成材料保留。'; render() } }
    if (active() && host()) timer = setTimeout(observe, 800)
  }
  root.addEventListener('click', async event => {
    const action = event.target.closest('[data-source-verification-action]')?.dataset.sourceVerificationAction
    if (!['start', 'cancel', 'resume'].includes(action) || busy || !isEditable()) return
    const parent = selection(); if (!parent || (action !== 'start' && !task)) return
    busy = true; notice = ''; render()
    try {
      const result = await request(action === 'start' ? '/api/v1/source-verifications' : `/api/v1/stage-tasks/${encodeURIComponent(task.taskId)}/${action}`, { method: 'POST', body: JSON.stringify(action === 'start' ? { evaluationTaskId: parent } : action === 'resume' ? { inputDigest: task.inputDigest } : {}) })
      if (selection() !== parent) return
      task = result.task; await observe()
    } catch (error) { if (selection() === parent) notice = `来源复核操作未完成：${error.code ?? '连接失败'}` }
    finally { busy = false; render() }
  })
  return { refresh() {
    const id = selection()
    if (loadedFor !== id) {
      loadedFor = id; task = null; checkpoints = []; notice = ''; clearTimeout(timer); timer = null
      if (id) request('/api/v1/stage-tasks').then(result => {
        if (selection() !== id) return
        task = result.items.find(item => item.input.parameters.operation === 'KNOWLEDGE_SOURCE_VERIFICATION' && item.input.parameters.evaluationTaskId === id) ?? null
        return observe()
      }).catch(() => { if (selection() === id) { notice = '历史复核暂不可读。'; render() } })
    } else if (active() && !timer) queueMicrotask(observe)
    render()
  } }
}
