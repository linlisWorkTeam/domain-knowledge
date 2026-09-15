/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供索引构建、阶段恢复与摘要试检索的可操作界面。
 */
import { createKnowledgeAssociationsPanel } from './KnowledgeAssociations.js'
export function createKnowledgeIndexPanel({ root, request, escapeHtml: escape, isEditable }) {
  let task = null
  const associations = createKnowledgeAssociationsPanel({ root, request, escapeHtml: escape, isEditable, selection: () => task?.status === 'SUCCEEDED' ? task.input.cardVersionIds : null })
  let events = []
  let timer = null
  let query = ''
  let searchResult = null
  let busy = false
  let notice = ''
  let generation = 0
  let observationFailed = false
  const host = () => root.querySelector('[data-index-panel]')
  const labels = { PENDING: '排队中', RUNNING: '更新中', SUCCEEDED: '已完成', FAILED: '失败', PAUSED: '已暂停', CANCELLED: '已取消' }
  const reasons = {
    INDEX_CARDS_REQUIRED: '先生成知识卡片，再建立索引。', INDEX_BUILD_PARTIAL: '部分卡片索引失败，已完成的结果保留。修复材料后可以恢复。',
    STAGE_INPUT_CHANGED: '卡片已变化，请重新更新索引。', INDEX_VERSION_NOT_CURRENT: '所选版本已更新，请重新选择。',
    STAGE_PROCESS_EXITED: '上次执行进程已退出，可以从已完成卡片之后恢复。', STAGE_CANCELLED: '任务已取消，已完成的索引保留。',
    STAGE_BUDGET_EXHAUSTED: '本任务预算已耗尽，累计用量已保留。', STAGE_CONTRACT_INCOMPATIBLE: '旧执行记录只读，不能在当前版本恢复。',
  }
  const active = () => task?.contractVersion === 'knowledge-workbench-v1' && ['PENDING', 'RUNNING'].includes(task.status)
  function taskHtml() {
    if (!task) return '<p>更新索引后，可输入问题试检索并查看命中原因。</p>'
    const currentEvents = events.slice(Math.max(0, events.findLastIndex((event) => event.kind === 'STARTED')))
    const counts = task.result?.summary ?? [...currentEvents].reverse().find((event) => event.kind === 'PROGRESS' && event.detail && typeof event.detail === 'object' && 'total' in event.detail)?.detail
    const failures = task.status === 'SUCCEEDED' ? [] : currentEvents.filter((event) => event.kind === 'PROGRESS' && event.detail?.status === 'FAILED')
    const resume = ['FAILED', 'PAUSED', 'CANCELLED'].includes(task.status) && task.contractVersion === 'knowledge-workbench-v1'
      && Object.entries(task.limits ?? {}).every(([key, limit]) => task.usage[key] < limit)
    return `<p><b>${escape(task.cancelRequested && active() ? '正在取消' : task.contractVersion !== 'knowledge-workbench-v1' ? '旧执行记录' : labels[task.status] ?? '未知')}</b> · 输入 ${escape(task.input.cardVersionIds.length)} 个卡片版本${task.attempt ? ` · 第 ${escape(task.attempt)} 次执行` : ''}</p>
      ${counts ? `<p>新增 ${escape(counts.added ?? 0)} · 更新 ${escape(counts.updated ?? 0)} · 复用 ${escape(counts.reused ?? 0)} · 失败 ${escape(counts.failed ?? 0)}</p>` : ''}
      ${failures.length ? `<ul>${failures.map(({ detail }) => `<li><button class="text-button" data-version-id="${escape(detail.versionId)}" type="button">查看卡片 ${escape(detail.cardId)}</button>：${escape(detail.reasonCode)}</li>`).join('')}</ul>` : ''}
      ${task.reasonCode ? `<p class="index-notice">${escape(reasons[task.reasonCode] ?? task.reasonCode)}</p>` : ''}
      ${active() ? `<button class="secondary-button" data-index-action="cancel" ${task.cancelRequested || !isEditable() ? 'disabled' : ''} type="button">取消索引任务</button>` : ''}
      ${resume ? `<button class="secondary-button" data-index-action="resume" ${!isEditable() ? 'disabled' : ''} type="button">恢复索引任务</button>` : ''}
      <details><summary>执行记录</summary><code>${escape(task.taskId)}</code><p>累计耗时 ${escape(Math.round(task.usage.elapsedMs / 1000))} 秒；已完成子步骤在恢复时复用。</p></details>`
  }
  function resultsHtml() {
    if (!searchResult) return ''
    const statusLabels = { VERIFIED: '已验证', CANDIDATE: '候选', LOW_CONFIDENCE: '低置信', SUPERSEDED: '历史版本' }
    const fields = { name: '名称', module: '模块', keywords: '关键词', purpose: '用途', applicability: '适用条件', summary: '正文摘要' }
    return `<p>有效索引 ${escape(searchResult.indexed)} · 待更新 ${escape(searchResult.stale + searchResult.missing)} · 命中 ${escape(searchResult.total)}</p>
      ${searchResult.hits.length ? `<ul class="index-hits">${searchResult.hits.map((hit) => `<li><button class="text-button" data-version-id="${escape(hit.versionId)}" type="button">${escape(hit.header.name)}</button><small>${escape(statusLabels[hit.status] ?? '状态未知')}</small><p>${escape(hit.header.purpose)}</p><small>命中 ${escape(hit.match.fields.map((field) => fields[field] ?? field).join('、'))}：${escape(hit.match.terms.join('、'))}</small><button class="secondary-button" data-index-yaml="${escape(hit.cardId)}" type="button">预览 YAML</button></li>`).join('')}</ul>` : '<p>没有匹配的有效索引。可调整问题或先更新索引。</p>'}`
  }
  function render() {
    const panel = host()
    if (!panel) return
    const action = document.activeElement?.dataset?.indexAction
    panel.querySelector('[data-index-task]').innerHTML = taskHtml()
    panel.querySelector('[data-index-notice]').textContent = notice
    panel.querySelector('[data-index-results]').innerHTML = resultsHtml()
    panel.querySelector('[data-index-action="build"]').disabled = busy || active() || !isEditable()
    associations.refresh()
    if (action) panel.querySelector(`[data-index-action="${action}"]`)?.focus({ preventScroll: true })
  }
  function fail(error) { notice = reasons[error?.code] ?? '索引操作未完成，请重试。'; render() }
  async function observe() {
    clearTimeout(timer)
    if (!task || !host()?.open) return
    const taskId = task.taskId
    try {
      const detail = await request(`/api/v1/stage-tasks/${encodeURIComponent(taskId)}`)
      if (task?.taskId !== taskId) return
      if (observationFailed) { notice = ''; observationFailed = false }
      task = detail.task; events = detail.events ?? []
      render()
    } catch {
      observationFailed = true; notice = '暂时无法读取任务状态，正在重试。'; render()
    }
    if (active() && host()?.open) timer = setTimeout(observe, 700)
  }
  root.addEventListener('toggle', (event) => {
    if (!event.target.matches?.('[data-index-panel]')) return
    if (!event.target.open) { clearTimeout(timer); return }
    const currentGeneration = generation
    request('/api/v1/stage-tasks?projectId=knowledge-library').then((result) => {
      if (generation !== currentGeneration) return
      task = result.items.find((item) => item.input.stage === 'INDEX') ?? task
      render(); return observe()
    }).catch(fail)
  }, true)
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-index-action], [data-index-yaml]')
    if (!button || !host()?.contains(button)) return
    const action = button.dataset.indexAction
    if (button.dataset.indexYaml) {
      request(`/api/v1/knowledge-index/${encodeURIComponent(button.dataset.indexYaml)}`).then((result) => {
        const preview = host()?.querySelector('[data-index-preview]')
        if (preview) preview.innerHTML = `<h3>YAML 预览${result.stale ? ' · 待更新' : ''}</h3><pre tabindex="0">${escape(result.yaml)}</pre>`
      }).catch(fail)
      return
    }
    if (!isEditable()) return
    generation += 1; busy = true; notice = ''; render()
    const path = action === 'build' ? '/api/v1/index-builds' : `/api/v1/stage-tasks/${encodeURIComponent(task.taskId)}/${action}`
    request(path, { method: 'POST', body: JSON.stringify(action === 'resume' ? { inputDigest: task.inputDigest } : {}) })
      .then((result) => {
        task = result.task
        if (result.reusedTask) notice = '已复用相同输入的完成结果。'
        if (result.restored) notice += ` 已恢复 ${result.restored} 份索引文件。`
        return observe()
      }).catch(fail).finally(() => { busy = false; render() })
  })
  root.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-index-search]')) return
    event.preventDefault()
    query = new FormData(event.target).get('query').toString()
    const requestedQuery = query
    request(`/api/v1/knowledge-index?q=${encodeURIComponent(query)}`).then((result) => { if (requestedQuery === query) { searchResult = result; render() } }).catch(fail)
  })
  return {
    html: () => `<details class="index-panel" data-index-panel><summary>卡片搜索设置</summary><div class="index-panel-body">
      <div class="section-heading"><h2>卡片搜索目录</h2><button class="secondary-button" data-index-action="build" ${!isEditable() ? 'disabled' : ''} type="button">更新搜索目录</button></div>
      <p>将卡片名称、用途和关键词整理成搜索目录。卡片更新后可在这里刷新，再输入问题检查能找到哪些卡片及命中原因。</p><div data-index-task aria-live="polite">${taskHtml()}</div><p data-index-notice role="status">${escape(notice)}</p>
      <form class="index-search" data-index-search><label>试搜一个问题<input name="query" type="text" value="${escape(query)}" placeholder="输入问题、用途或接口名称" maxlength="1024" required></label><button class="secondary-button" type="submit">搜索卡片</button></form>
      <div data-index-results>${resultsHtml()}</div><div data-index-preview></div><section data-association-panel></section></div></details>`,
  }
}
