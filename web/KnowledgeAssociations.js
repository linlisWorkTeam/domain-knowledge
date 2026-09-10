/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供关联阶段的独立启动、取消、恢复和证据下载。
 */
export function createKnowledgeAssociationsPanel({ root, request, escapeHtml: escape, isEditable, selection }) {
  let task = null, busy = false, notice = '', initialized = false, timer = null, epoch = 0
  const host = () => root.querySelector('[data-association-panel]')
  const active = () => task && ['PENDING', 'RUNNING'].includes(task.status)
  function render() {
    const panel = host(); if (!panel) return
    const versions = selection()
    const labels = { PENDING: '排队中', RUNNING: '建立关联中', SUCCEEDED: '关联完成', FAILED: '关联失败', PAUSED: '已暂停', CANCELLED: '已取消' }
    panel.innerHTML = `<h3>知识关联</h3><p>未提供外部材料，仅建立库内符号引用关系。关系提供查阅线索，尚未验证能否替代当前卡片。</p>
      <button class="secondary-button" type="button" data-association-action="start" ${!versions?.length || !isEditable() || busy || active() ? 'disabled' : ''}>建立关联</button>
      <p role="status">${escape(notice)}</p>${task ? `<p>${escape(labels[task.status] ?? '状态未知')} · 输入 ${escape(task.input.cardVersionIds.length)} 张卡片 · ${escape(task.result?.summary.relations ?? 0)} 条关系</p>
      ${task.reasonCode ? `<p>${escape(task.reasonCode)}；卡片或索引变化后，请先更新索引并重新建立关联。</p>` : ''}
      ${active() ? `<button class="secondary-button" type="button" data-association-action="cancel" ${busy || task.cancelRequested || !isEditable() ? 'disabled' : ''}>取消关联</button>` : ''}
      ${['FAILED', 'PAUSED', 'CANCELLED'].includes(task.status) ? `<button class="secondary-button" type="button" data-association-action="resume" ${busy || !isEditable() ? 'disabled' : ''}>恢复关联</button>` : ''}
      ${task.result?.artifactRefs?.[0] ? `<button class="secondary-button" type="button" data-download-artifact="/api/v1/stage-tasks/${escape(task.taskId)}/artifacts/${escape(task.result.artifactRefs[0].sha256)}">下载关系索引</button><p>打开卡片，点击“当前卡片不适用”查看关联候选和引用依据。</p>` : ''}` : '<p>先完成索引，再为这些卡片建立关联。</p>'}`
  }
  async function observe() {
    clearTimeout(timer); timer = null; if (!task || !host()) return
    const id = task.taskId
    try { const result = await request(`/api/v1/stage-tasks/${encodeURIComponent(id)}`); if (task?.taskId !== id) return; task = result.task; render() }
    catch { notice = '暂时无法读取关联任务状态。'; render() }
    if (active() && host()) timer = setTimeout(observe, 800)
  }
  root.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-association-action]')?.dataset.associationAction
    if (!action || busy || !isEditable()) return
    const versions = selection(); if (action === 'start' && (!versions?.length || active())) return
    epoch++; busy = true; notice = ''; render()
    try {
      const path = action === 'start' ? '/api/v1/associations' : `/api/v1/stage-tasks/${encodeURIComponent(task.taskId)}/${action}`
      const payload = action === 'start' ? { versionIds: versions } : action === 'resume' ? { inputDigest: task.inputDigest } : {}
      const result = await request(path, { method: 'POST', body: JSON.stringify(payload) }); task = result.task; await observe()
    } catch (error) { notice = `关联操作未完成：${error.code ?? '连接失败'}` }
    finally { busy = false; render() }
  })
  return { refresh() {
    render(); if (!host()) return
    if (!initialized) { initialized = true; const current = epoch; request('/api/v1/stage-tasks?projectId=knowledge-library').then((result) => {
      if (current !== epoch) return
      task = result.items.find((item) => item.input.stage === 'ASSOCIATE') ?? task; return observe()
    }).catch(() => { initialized = false }) } else if (active() && !timer) queueMicrotask(observe)
  } }
}
