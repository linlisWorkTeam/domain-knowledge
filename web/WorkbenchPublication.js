/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：选择冻结评测证据，发布当前重建对应的知识版本并恢复导出。
 */
export function createWorkbenchPublicationPanel({ root, request, escapeHtml: escape, isEditable, selection }) {
  let parent = null, tasks = [], items = [], busy = false, notice = '', epoch = 0
  let evaluationId = '', fixedId = '', sourceId = ''
  const host = () => root.querySelector('[data-workbench-publication-panel]')
  const evaluations = () => tasks.filter(task => task.status === 'SUCCEEDED' && task.input.stage === 'EVALUATE' && !task.input.parameters.operation && task.input.parameters.reconstructionTaskId === parent)
  const fixed = () => tasks.filter(task => task.status === 'SUCCEEDED' && task.input.parameters.operation === 'FIXED_NATIVE_EVALUATION' && task.input.parameters.reconstructionTaskId === parent)
  const sources = () => tasks.filter(task => task.status === 'SUCCEEDED' && task.input.parameters.operation === 'KNOWLEDGE_SOURCE_VERIFICATION' && task.input.parameters.evaluationTaskId === evaluationId)
  const options = (values, selected) => '<option value="">请选择已完成任务</option>' + values.map(task => `<option value="${escape(task.taskId)}" ${task.taskId === selected ? 'selected' : ''}>${escape(task.taskId)}</option>`).join('')
  function render() {
    const panel = host(); if (!panel) return
    if (!selection()) { panel.innerHTML = ''; return }
    const disabled = busy || !isEditable()
    panel.innerHTML = `<h3>验证与本地发布</h3><p>为当前重建选择可信评测、固定用例评测和整卡来源复核。提交时会核对完整证据与卡片版本；任务执行完成本身不代表通过发布门禁。</p>
      <label>可信评测<select data-publication-select="evaluation" ${disabled ? 'disabled' : ''}>${options(evaluations(), evaluationId)}</select></label>
      <label>固定用例评测<select data-publication-select="fixed" ${disabled ? 'disabled' : ''}>${options(fixed(), fixedId)}</select></label>
      <label>整卡来源复核<select data-publication-select="source" ${disabled ? 'disabled' : ''}>${options(sources(), sourceId)}</select></label>
      <button type="button" class="primary-button" data-publication-action="publish" ${disabled || !evaluationId || !fixedId || !sourceId ? 'disabled' : ''}>验证并发布知识</button>
      <button type="button" class="secondary-button" data-publication-action="refresh" ${busy ? 'disabled' : ''}>刷新评测与发布记录</button>
      <p role="status">${escape(notice)}</p>${items.length ? items.map(record => `<article><h4>${record.status === 'COMMITTED' ? '已验证并发布' : '发布待恢复'}</h4><p>${escape(record.publicationId)}</p><p>绑定 ${escape(record.versionIds.length)} 个不可变知识版本。</p>
      ${record.lastError ? `<p>导出问题：${escape(record.lastError)}</p>` : ''}
      ${record.status === 'PREPARED' ? `<button type="button" class="secondary-button" data-publication-action="resume" data-publication-id="${escape(record.publicationId)}" ${disabled ? 'disabled' : ''}>恢复发布</button>` : ''}
      ${record.files.map(file => `<button type="button" class="secondary-button" data-download-artifact="/api/v1/workbench-publications/${escape(record.publicationId)}/artifacts/${escape(file.ref.sha256)}">下载 ${escape(file.path)}</button>`).join('')}</article>`).join('') : '<p>这些知识版本尚无发布记录。缺少评测时，请先完成上方步骤。</p>'}`
  }
  async function load() {
    const id = selection(), current = ++epoch; if (!id) return
    busy = true; notice = ''; render()
    try {
      const original = await request(`/api/v1/stage-tasks/${encodeURIComponent(id)}`)
      const projectId = original.task.input.projectId
      const history = []; let cursor = null
      do {
        const page = await request(`/api/v1/stage-tasks?projectId=${encodeURIComponent(projectId)}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`)
        if (current !== epoch || selection() !== id) return
        history.push(...page.items); cursor = page.nextCursor
      } while (cursor)
      const records = await request(`/api/v1/workbench-publications?projectId=${encodeURIComponent(projectId)}`)
      if (current !== epoch || selection() !== id) return
      tasks = history
      const versions = new Set(original.task.input.cardVersionIds)
      items = records.items.filter(record => record.versionIds.length === versions.size && record.versionIds.every(version => versions.has(version)))
      if (!evaluations().some(task => task.taskId === evaluationId)) evaluationId = ''
      if (!fixed().some(task => task.taskId === fixedId)) fixedId = ''
      if (!sources().some(task => task.taskId === sourceId)) sourceId = ''
    } catch (error) { if (current === epoch) notice = `发布记录暂不可读：${error.code ?? '连接失败'}` }
    finally { if (current === epoch) { busy = false; render() } }
  }
  root.addEventListener('change', event => {
    const field = event.target.dataset.publicationSelect
    if (!field || busy || !isEditable()) return
    if (field === 'evaluation') { evaluationId = event.target.value; sourceId = '' }
    if (field === 'fixed') fixedId = event.target.value
    if (field === 'source') sourceId = event.target.value
    render()
  })
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-publication-action]'); if (!button || busy) return
    if (button.dataset.publicationAction === 'refresh') { await load(); return }
    if (!isEditable()) return
    const id = selection(), current = epoch; if (!id) return
    busy = true; notice = ''; render()
    try {
      const resume = button.dataset.publicationAction === 'resume'
      await request(resume ? `/api/v1/workbench-publications/${encodeURIComponent(button.dataset.publicationId)}/resume` : '/api/v1/workbench-publications', {
        method: 'POST', body: JSON.stringify(resume ? {} : { reconstructionTaskId: id, evaluationTaskId: evaluationId, fixedEvaluationTaskId: fixedId, sourceVerificationTaskId: sourceId }) })
      if (current === epoch && selection() === id) await load()
    } catch (error) { if (current === epoch) notice = `尚未完成发布：${error.code ?? '连接失败'}。前序产物保留，可刷新记录后恢复。` }
    finally { if (current === epoch) { busy = false; render() } }
  })
  return { refresh() {
    const id = selection()
    if (parent !== id) { parent = id; epoch++; tasks = []; items = []; evaluationId = ''; fixedId = ''; sourceId = ''; busy = false; notice = ''; if (id) void load() }
    render()
  } }
}

export function publicationDownloadName(disposition) {
  const name = /(?:^|;)\s*filename="([^"\r\n]+)"(?:;|$)/i.exec(disposition ?? '')?.[1]
  return name && /^(?:[A-Za-z0-9_-]{1,160}\.md|manifest\.json|evidence\.json)$/.test(name) ? name : 'knowledge-evidence.json'
}
