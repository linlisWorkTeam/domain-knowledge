/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：展示独立知识生成任务、逐卡产物及同版本恢复入口。
 */
import { createKnowledgeReconstructionPanel } from './KnowledgeReconstruction.js'
export function createKnowledgeGenerationPanel({ root, request, escapeHtml: escape, isEditable }) {
  let project = null, task = null, checkpoints = [], events = [], timer = null
  let busy = false, notice = '', epoch = 0, initialized = false, scopesOpen = false
  const reconstruction = createKnowledgeReconstructionPanel({ root, request, escapeHtml: escape, isEditable,
    selection: () => task?.status === 'SUCCEEDED' ? { snapshotId: task.input.parameters.snapshotId,
      versionIds: (task.result?.summary?.cards ?? []).map((card) => card.versionId) } : null })
  const scopes = new Map()
  const host = () => root.querySelector('[data-generation-panel]')
  const active = () => task && ['PENDING', 'RUNNING'].includes(task.status)
  const labels = { PENDING: '排队中', RUNNING: '生成中', SUCCEEDED: '已完成', FAILED: '失败', PAUSED: '已暂停', CANCELLED: '已取消' }
  const reasons = {
    DSH_CONFIGURATION_UNAVAILABLE: '请在 Agent 设置中配置并验证模型。配置改变后重新启动生成；同配置可恢复。',
    DSH_CONFIGURATION_CHANGED: '模型配置已变化；恢复需要与冻结输入一致的配置。',
    RUN_CONFIGURATION_INCOMPATIBLE: '当前执行配置与冻结输入不兼容，请检查 Agent 设置。',
    GENERATION_LANGUAGE_UNSUPPORTED: '此生成入口当前支持 C、C++；TypeScript 请使用现有模块回归入口。',
    NATIVE_INTERFACE_EMPTY: '未发现选定接口，请检查入口路径及类或符号范围。',
    NATIVE_INTERFACE_COMPILE_FAILED: '公开接口提取失败，请检查依赖和构建参数；诊断保留在执行记录中。',
    WORKBENCH_RESOURCE_INSUFFICIENT: '可用内存或磁盘不足，任务已暂停；释放资源后可以恢复。',
    STAGE_PROCESS_EXITED: '上次进程已退出，已完成卡片保留，可以恢复。',
    STAGE_BUDGET_EXHAUSTED: '累计预算已耗尽，已完成卡片保留。',
    PROVIDER_QUOTA_EXHAUSTED: '供应商额度不足，补充额度后可以恢复。',
    MODULE_ISOLATION_REQUIRED: '服务器需要启用 Bubblewrap 隔离后才能生成。',
    PROJECT_RESOURCE_ISOLATION_UNAVAILABLE: '编译资源隔离不可用，请检查服务器配置。',
  }
  function taskHtml() {
    if (!task) return project ? '<p>生成后即可阅读；评测结果独立记录。</p>' : ''
    const cards = checkpoints.filter((item) => item.key.startsWith('card:')).map((item) => item.result.summary)
    const progress = [...events].reverse().find((event) => event.kind === 'PROGRESS' && ['card', 'interfaces'].includes(event.detail?.phase))?.detail
    const resume = ['FAILED', 'PAUSED', 'CANCELLED'].includes(task.status) && task.contractVersion === 'knowledge-workbench-v1'
      && Object.entries(task.limits ?? {}).every(([key, limit]) => task.usage[key] < limit)
    return `<p><b>${escape(task.cancelRequested && active() ? '正在取消' : labels[task.status] ?? '未知')}</b> · 已生成 ${escape(cards.length)} 张 · 尚未行为评测</p>
      ${active() && progress ? `<p>当前：${escape(progress.symbol ?? progress.module)}</p>` : ''}
      <ul>${cards.map((card) => `<li><button class="text-button" data-version-id="${escape(card.versionId)}" type="button">${escape(card.title)}</button> · ${escape(card.quality)}</li>`).join('')}</ul>
      ${task.reasonCode ? `<p>${escape(reasons[task.reasonCode] ?? task.reasonCode)}</p>` : ''}
      ${active() ? `<button class="secondary-button" data-generation-action="cancel" ${busy || task.cancelRequested || !isEditable() ? 'disabled' : ''} type="button">取消生成</button>` : ''}
      ${resume ? `<button class="secondary-button" data-generation-action="resume" ${busy || !isEditable() ? 'disabled' : ''} type="button">恢复生成</button>` : ''}
      ${cards.length ? '<p>下一步：在知识页面「知识索引与试检索」中建立索引。</p>' : ''}
      <details><summary>输入与执行记录</summary><code>${escape(task.taskId)}</code><p>源码 ${escape(task.input.sourceRevision)}；累计模型请求 ${escape(task.usage.modelCalls)} 次，已报告 Token ${escape(task.usage.tokens)}，预留 ${escape(task.usage.reservedTokens)}。未报告的用量不视为零。</p></details>`
  }
  function html() {
    return `<section data-generation-panel><h3>知识库生成</h3>
      ${project ? `<p>使用已保存输入 ${escape(project.snapshotId)}</p><details data-generation-scopes ${scopesOpen ? 'open' : ''}><summary>接口范围（可选）</summary>
        ${project.modules.map((module) => `<fieldset><legend>${escape(module.moduleId)}</legend>
          ${[['entryPath', '接口入口路径'], ['astFilter', '类范围（例如 tinyxml2::XMLUtil）'], ['symbols', '限定符号（每行一个，留空自动提取）']].map(([key, label]) => `<label>${label}<textarea name="scope-${escape(module.moduleId)}-${key}" data-generation-scope="${key}" data-generation-module="${escape(module.moduleId)}" ${busy || active() ? 'disabled' : ''}>${escape(scopes.get(module.moduleId)?.[key] ?? '')}</textarea></label>`).join('')}</fieldset>`).join('')}</details>
        <button class="primary-button" data-generation-action="start" ${busy || active() || !isEditable() ? 'disabled' : ''} type="button">生成知识库</button>` : '<p>先保存项目输入，再生成知识库。</p>'}
      <p data-generation-notice role="status">${escape(notice)}</p><div data-generation-task aria-live="polite">${taskHtml()}</div><section data-reconstruction-panel></section></section>`
  }
  function render() {
    const panel = host(); if (!panel) return
    panel.querySelector('[data-generation-task]').innerHTML = taskHtml()
    panel.querySelector('[data-generation-notice]').textContent = notice
    const start = panel.querySelector('[data-generation-action="start"]'); if (start) start.disabled = !project || busy || active() || !isEditable()
    reconstruction.render()
    for (const field of panel.querySelectorAll('[data-generation-scope]')) field.disabled = busy || active()
  }
  async function observe() {
    clearTimeout(timer); timer = null; if (!task || !host()) return
    const id = task.taskId, current = epoch
    try {
      const detail = await request(`/api/v1/stage-tasks/${encodeURIComponent(id)}`)
      if (current !== epoch || task?.taskId !== id) return
      task = detail.task; checkpoints = detail.checkpoints ?? []; events = detail.events ?? []; notice = ''; render()
    } catch { if (current !== epoch) return; notice = '暂时无法读取状态；已保存任务不会因此取消。'; render() }
    if (active() && host()) timer = setTimeout(observe, 800)
  }
  root.addEventListener('input', (event) => {
    const key = event.target.dataset?.generationScope; if (!key) return
    const id = event.target.dataset.generationModule
    scopes.set(id, { ...scopes.get(id), [key]: event.target.value })
  })
  root.addEventListener('toggle', (event) => {
    if (event.target.matches?.('[data-generation-scopes]')) scopesOpen = event.target.open
  }, true)
  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-generation-action]'); if (!button || !isEditable() || busy) return
    const action = button.dataset.generationAction
    if (action === 'start' && (!project || active())) return
    const current = ++epoch; busy = true; notice = ''; render()
    try {
      const selectedScopes = Object.fromEntries((project?.modules ?? []).map((module) => [module.moduleId,
        Object.fromEntries(Object.entries(scopes.get(module.moduleId) ?? {}).filter(([, value]) => value.trim()).map(([key, value]) => [key, key === 'symbols' ? value.split('\n').map((line) => line.trim()).filter(Boolean) : value.trim()]))]))
      const path = action === 'start' ? '/api/v1/generations' : `/api/v1/stage-tasks/${encodeURIComponent(task.taskId)}/${action}`
      const payload = action === 'start' ? { snapshotId: project.snapshotId, scopes: selectedScopes } : action === 'resume' ? { inputDigest: task.inputDigest } : {}
      const result = await request(path, { method: 'POST', body: JSON.stringify(payload) })
      if (current !== epoch) return
      task = result.task; if (action === 'start') { checkpoints = []; events = [] }
      await observe()
    } catch (failure) { if (current === epoch) notice = reasons[failure.code] ?? `生成操作未完成：${failure.code ?? '连接失败'}` }
    finally { if (current === epoch) { busy = false; render() } }
  })
  return { html,
    setProject(value) { project = value; const panel = host(); if (panel) panel.outerHTML = html(); queueMicrotask(observe); reconstruction.refresh() },
    refresh() {
      reconstruction.refresh()
      if (!isEditable()) return
      if (!initialized && host()) {
        initialized = true; const current = epoch
        request('/api/v1/stage-tasks').then((result) => {
          if (epoch !== current) return
          task = result.items.find((item) => item.input.stage === 'GENERATE') ?? null
          render(); return observe()
        }).catch(() => { initialized = false; notice = '历史生成任务暂时无法读取。'; render() })
      } else if (task && active() && !timer) queueMicrotask(observe)
    },
  }
}
