/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：当前项目的模块批次表单、筛选、轮次与执行节点。
 */
import { workbenchLabel as t } from './WorkbenchLabels.js'
export function createModuleBatches({ root, request, escapeHtml: escape, project, isEditable, formatDate }) {
  let items = [], selected = '', selectedRound = null, moduleId = '', filter = '', detail = null, notice = '', loading = false, epoch = 0, projectId = ''
  let pendingCommand = null, refreshQueued = false, pickerOpen = true
  const host = () => root.querySelector('[data-module-batches]')
  const status = value => `<span class="badge ${escape(String(value).toLowerCase())}">${escape(t(value))}</span>`
  const rows = () => items.filter(item => (moduleId && item.moduleId === moduleId) && (!filter || (filter === 'active' ? item.status === 'RUNNING' : filter === 'verified' ? item.verified : filter === 'evaluated' ? item.evaluatedVersionCount > 0 : ['PAUSED', 'FAILED', 'CANCELLED'].includes(item.status))))
  function html() {
    const current = project()
    if (!current) return '<section data-module-batches class="panel"><p>请先在左上角选择项目并保存模块范围。</p></section>'
    if (current.projectId !== projectId) { projectId = current.projectId; items = []; selected = ''; selectedRound = null; moduleId = current.modules[0]?.moduleId ?? ''; detail = null; epoch++ }
    const batch = items.find(item => item.batchId === selected), round = batch?.rounds.find(item => item.number === selectedRound) ?? batch?.rounds.at(-1)
    const scopedItems = items.filter(item => item.moduleId === moduleId)
    const counts = [scopedItems.filter(item => item.status === 'RUNNING').length, scopedItems.filter(item => item.verified).length, scopedItems.filter(item => ['PAUSED', 'FAILED', 'CANCELLED'].includes(item.status)).length, scopedItems.some(item => item.evaluatedVersionCount === null) ? '—' : new Set(scopedItems.flatMap(item => item.evaluatedVersionIds ?? [])).size]
    return `<section data-module-batches>
      <div class="reference-metrics batch-metrics">${[['active', '运行中'], ['verified', '已验证'], ['attention', '需要处理'], ['evaluated', '已评测版本']].map(([value, label], index) => `<button type="button" class="panel" data-batch-filter="${value}" aria-pressed="${filter === value}"><span>${label}</span><strong>${counts[index]}</strong></button>`).join('')}</div>
      <div class="batch-toolbar"><button type="button" class="secondary-button" data-batch-picker>选择批次</button><button type="button" class="primary-button" data-new-module-batch ${isEditable() ? '' : 'disabled'}>新建批次</button></div>
      <p role="status" data-batch-notice>${escape(notice)}</p>
      <details class="panel batch-selector" ${pickerOpen ? 'open' : ''}><summary>批次选择</summary>
        <label>模块<select data-batch-module><option value="">请选择模块</option>${[...new Set([...current.modules.map(item => item.moduleId), ...items.map(item => item.moduleId)])].map(id => `<option value="${escape(id)}" ${moduleId === id ? 'selected' : ''}>${escape(id)}</option>`).join('')}</select></label>
        <button type="button" class="text-button" data-batch-filter="">显示全部状态</button>
        <div class="batch-table">${rows().map(item => `<button type="button" data-module-batch-id="${escape(item.batchId)}"><strong>${escape(item.batchId)}</strong><span>${escape(item.moduleId)}</span>${status(item.status)}<time>${escape(formatDate(item.createdAt))}</time></button>`).join('') || '<p>当前范围没有批次。</p>'}</div>
      </details>
      ${batch ? `<section class="panel batch-detail"><header class="batch-toolbar"><h2>${escape(batch.batchId)}</h2>${status(batch.status)}<button type="button" class="secondary-button" data-batch-command="rounds" ${!isEditable() || ['QUEUED', 'RUNNING'].includes(batch.status) ? 'disabled' : ''}>新增轮次</button>${['PAUSED', 'FAILED', 'CANCELLED'].includes(batch.status) && batch.rounds.length ? `<button type="button" class="secondary-button" data-batch-command="resume" ${isEditable() ? '' : 'disabled'}>恢复本轮</button>` : ''}${batch.status !== 'CANCELLED' ? `<button type="button" class="secondary-button" data-batch-command="cancel" ${isEditable() ? '' : 'disabled'}>取消批次</button>` : ''}</header>
        <div class="round-tabs" aria-label="选择批次轮次">${batch.rounds.map(item => `<button type="button" class="secondary-button" data-batch-round="${item.number}" aria-pressed="${item.number === round?.number}">第 ${item.number} 轮</button>`).join('')}</div>
        ${round ? `<p>${escape(t('start'))} ${escape(formatDate(round.startedAt))} · ${escape(t('end'))} ${escape(formatDate(round.completedAt))}</p>${round.reasonCode ? `<p>处理原因：<code>${escape(round.reasonCode)}</code></p>` : ''}${nodes(round)}` : '<p>尚未启动。点击新增轮次开始执行。</p>'}
      </section>` : ''}
    </section>`
  }
  function nodes(round) {
    if (!round.pipelineId) return '<p>轮次正在等待执行。</p>'
    if (!detail || detail.pipeline.pipelineId !== round.pipelineId) return '<p>正在读取执行节点…</p>'
    const tasks = [...detail.tasks].sort((a, b) => String(detail.timings?.[a.taskId]?.startedAt ?? a.createdAt).localeCompare(String(detail.timings?.[b.taskId]?.startedAt ?? b.createdAt))), name = task => t(task.input.parameters.operation ?? task.input.stage)
    return `<div class="batch-execution-layout"><details class="panel batch-mini-graph"><summary>${t('graph')} · ${tasks.length} 个节点</summary><ol>${tasks.map(task => `<li class="${task.status === 'RUNNING' ? 'node-running' : ''}"><button type="button" data-batch-node="${escape(task.taskId)}">${escape(name(task))} ${status(task.status)}</button></li>`).join('')}</ol></details>
      <section><h3>${t('records')}</h3>${tasks.map(task => `<details class="node-record" data-batch-log="${escape(task.taskId)}"><summary>${escape(name(task))} ${status(task.status)}<small>${escape(t('start'))} ${escape(formatDate(detail.timings?.[task.taskId]?.startedAt))} → ${escape(t('end'))} ${escape(formatDate(detail.timings?.[task.taskId]?.completedAt))}</small></summary><div class="node-execution-log"><h4>${t('logs')}</h4><ol>${(detail.events?.[task.taskId] ?? []).map(event => `<li><time>${escape(formatDate(event.createdAt))}</time> ${escape(t(event.kind) === t('UNKNOWN') ? t('records') : t(event.kind))}<details data-batch-record="${escape(task.taskId)}:event:${escape(event.sequence)}"><summary>记录详情</summary><code>${escape(event.kind)}</code><dl>${Object.entries(event.detail ?? {}).map(([key, value]) => `<div><dt>${escape(key)}</dt><dd>${escape(typeof value === 'object' ? JSON.stringify(value) : value)}</dd></div>`).join('')}</dl></details></li>`).join('')}</ol>${task.reasonCode ? `<p>处理原因：<code>${escape(task.reasonCode)}</code></p>` : ''}<p>模型调用 ${escape(task.usage.modelCalls)} · 输入输出用量 ${escape(task.usage.tokens)}</p>${(detail.checkpoints[task.taskId] ?? []).map(checkpoint => `<details data-batch-record="${escape(task.taskId)}:checkpoint:${escape(checkpoint.key)}"><summary>${escape(checkpoint.key)}</summary><dl>${Object.entries(checkpoint.result?.summary ?? {}).map(([key, value]) => `<div><dt>${escape(key)}</dt><dd>${escape(typeof value === 'object' ? JSON.stringify(value) : value)}</dd></div>`).join('')}</dl></details>`).join('') || '<p>尚无已提交的执行检查点。</p>'}${(task.result?.artifactRefs ?? []).map(ref => `<button class="secondary-button" type="button" data-download-artifact="/api/v1/stage-tasks/${escape(task.taskId)}/artifacts/${escape(ref.sha256)}">下载执行证据</button>`).join('')}</div></details>`).join('')}</section></div>`
  }
  function render() {
    const target = host(); if (!target) return
    const openLogs = [...target.querySelectorAll('[data-batch-log][open]')].map(item => item.dataset.batchLog)
    const openRecords = [...target.querySelectorAll('[data-batch-record][open]')].map(item => item.dataset.batchRecord)
    const graphOpen = Boolean(target.querySelector('.batch-mini-graph[open]'))
    const focus = document.activeElement, focusRound = focus?.dataset?.batchRound
    target.outerHTML = html()
    for (const id of openLogs) host()?.querySelector(`[data-batch-log="${CSS.escape(id)}"]`)?.setAttribute('open', '')
    for (const id of openRecords) host()?.querySelector(`[data-batch-record="${CSS.escape(id)}"]`)?.setAttribute('open', '')
    if (graphOpen) host()?.querySelector('.batch-mini-graph')?.setAttribute('open', '')
    if (focus?.matches('[data-batch-module]')) host()?.querySelector('[data-batch-module]')?.focus({ preventScroll: true })
    if (focusRound) host()?.querySelector(`[data-batch-round="${CSS.escape(focusRound)}"]`)?.focus({ preventScroll: true })
  }
  async function refresh() {
    const current = project(); if (!host() || !current) return
    if (loading) { refreshQueued = true; return }
    if (current.projectId !== projectId) { projectId = current.projectId; items = []; selected = ''; moduleId = current.modules[0]?.moduleId ?? ''; detail = null; epoch++ }
    loading = true; const version = epoch
    try {
      const response = await request(`/api/v1/workbench-batches?projectId=${encodeURIComponent(current.projectId)}`)
      if (version !== epoch || project()?.projectId !== current.projectId) return
      items = response.items; notice = response.schedulerError ? '调度器暂不可用，已保留批次记录。' : ''
      const batch = items.find(item => item.batchId === selected), round = batch?.rounds.find(item => item.number === selectedRound) ?? batch?.rounds.at(-1)
      detail = round?.pipelineId ? await request(`/api/v1/workbench-pipelines/${encodeURIComponent(round.pipelineId)}`) : null
    } catch { notice = '批次或执行记录读取失败，请稍后重试。' }
    finally { loading = false; if (version === epoch && project()?.projectId === current.projectId) render(); if (refreshQueued) { refreshQueued = false; void refresh() } }
  }
  function openCreate() {
    const current = project(); if (!current) { notice = '请先在左上角选择项目并保存模块。'; render(); return }
    if (!isEditable() || root.querySelector('[data-batch-dialog]')) return
    const dialog = document.createElement('dialog'); dialog.dataset.batchDialog = ''; dialog.setAttribute('aria-label', '新建模块批次')
    dialog.innerHTML = `<form data-create-module-batch><h2>新建批次</h2><label>模块<select name="moduleId" aria-label="批次所属模块">${current.modules.map(item => `<option value="${escape(item.moduleId)}">${escape(item.moduleId)}</option>`).join('')}</select></label><label>是否自动运行<select name="automatic" aria-label="是否自动运行"><option value="no">否</option><option value="yes">是</option></select></label><label data-frequency hidden>运行频率（分钟）<input type="number" name="intervalMinutes" min="1" max="525600" value="60" required disabled></label><p role="status" data-create-batch-notice></p><div class="dialog-actions"><button type="button" class="secondary-button" data-close-batch-dialog>取消</button><button type="submit" class="primary-button">创建批次</button></div></form>`
    root.append(dialog); dialog.addEventListener('close', () => dialog.remove()); dialog.showModal()
    const commandId = crypto.randomUUID()
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget, submit = form.querySelector('[type=submit]'); if (submit.disabled) return
      const data = new FormData(form), enabled = data.get('automatic') === 'yes'
      submit.disabled = true
      try {
        if (project()?.snapshotId !== current.snapshotId) throw new Error('PROJECT_CHANGED')
        const result = await request('/api/v1/workbench-batches', { method: 'POST', headers: { 'Idempotency-Key': commandId }, body: JSON.stringify({ snapshotId: current.snapshotId, moduleId: data.get('moduleId'), schedule: enabled ? { enabled, intervalMinutes: Number(data.get('intervalMinutes')) } : { enabled } }) })
        selected = result.batch.batchId; moduleId = result.batch.moduleId; selectedRound = null; pickerOpen = false; dialog.close(); await refresh()
      } catch { form.querySelector('[data-create-batch-notice]').textContent = '创建失败，请确认项目、模块和运行频率后重试。'; submit.disabled = false }
    })
  }
  root.addEventListener('toggle', event => { if (event.target.matches('.batch-selector') && event.target.isConnected) pickerOpen = event.target.open }, true)
  root.addEventListener('change', event => {
    if (event.target.matches('[data-batch-module]')) { moduleId = event.target.value; selected = ''; selectedRound = null; detail = null; pickerOpen = true; render() }
    if (event.target.matches('[name=automatic]')) { const label = event.target.closest('form').querySelector('[data-frequency]'); label.hidden = event.target.value !== 'yes'; label.querySelector('input').disabled = label.hidden }
  })
  root.addEventListener('click', async event => {
    if (event.target.closest('[data-new-module-batch]')) openCreate()
    if (event.target.closest('[data-close-batch-dialog]')) event.target.closest('dialog').close()
    if (event.target.closest('[data-batch-picker]')) { pickerOpen = true; host()?.querySelector('.batch-selector')?.setAttribute('open', '') }
    const chosen = event.target.closest('[data-module-batch-id]'); if (chosen) { selected = chosen.dataset.moduleBatchId; selectedRound = null; filter = ''; pickerOpen = false; await refresh() }
    const round = event.target.closest('[data-batch-round]'); if (round) { selectedRound = Number(round.dataset.batchRound); await refresh() }
    const stateFilter = event.target.closest('[data-batch-filter]'); if (stateFilter) { filter = stateFilter.dataset.batchFilter; selected = ''; selectedRound = null; detail = null; pickerOpen = true; render() }
    const node = event.target.closest('[data-batch-node]'); if (node) { const log = host()?.querySelector(`[data-batch-log="${CSS.escape(node.dataset.batchNode)}"]`); log?.setAttribute('open', ''); log?.scrollIntoView({ block: 'nearest' }) }
    const command = event.target.closest('[data-batch-command]'); if (command && selected && isEditable()) {
      command.disabled = true
      if (!pendingCommand || pendingCommand.batchId !== selected || pendingCommand.action !== command.dataset.batchCommand) pendingCommand = { batchId: selected, action: command.dataset.batchCommand, key: crypto.randomUUID() }
      try { await request(`/api/v1/workbench-batches/${encodeURIComponent(selected)}/${command.dataset.batchCommand}`, { method: 'POST', headers: { 'Idempotency-Key': pendingCommand.key }, body: '{}' }); pendingCommand = null; await refresh() }
      catch { notice = '操作未完成，请查看当前轮次状态后重试。'; render() }
    }
  })
  setInterval(() => { void refresh() }, 5000)
  return { html, refresh, openCreate }
}
