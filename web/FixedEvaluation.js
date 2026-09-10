/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：导入固定用例并展示独立参考/生成评测、恢复与实际结果。
 */
export function createFixedEvaluationPanel({ root, request, escapeHtml: escape, isEditable, selection }) {
  let parent = null, modules = [], task = null, events = [], busy = false, notice = '', timer = null, expanded = false
  const suites = new Map(), reports = new Map()
  const host = () => root.querySelector('[data-fixed-evaluation-panel]')
  const current = () => task?.input.parameters.fixedEvaluationContract === 'fixed-native-evaluation-v1'
  const active = () => current() && ['PENDING', 'RUNNING'].includes(task.status)
  const reasons = { FIXED_MODULE_COVERAGE_INVALID: '用例必须覆盖本次重建的全部模块，每个模块提供一套。', NATIVE_BEHAVIOR_SUITE_INVALID: '用例格式或调用范围不适用于该模块，请检查所选文件。', FIXED_RECONSTRUCTION_REQUIRED: '请先完成代码重建。', FIXED_REFERENCE_INTERFACE_CHANGED: '参考接口已变化，请重新分析仓库并重建。', NATIVE_TEST_TOOLCHAIN_CHANGED: '工具链已变化，请重新启动固定评测。', WORKBENCH_RESOURCE_INSUFFICIENT: '内存或磁盘不足，释放资源后可恢复。', STAGE_PROCESS_EXITED: '上次进程退出，可恢复已保存的任务。' }
  const label = { REFERENCE_REJECTED: '固定用例未通过参考验证，不判定知识错误', INTERFACE_MISMATCH: '生成接口不兼容', FIXED_FAILED: '生成代码存在固定用例失败', FIXED_PASSED: '固定用例全部通过' }
  const value = item => item === undefined || item === null ? '未取得' : typeof item === 'object' ? JSON.stringify(item) : String(item)
  function render() {
    const panel = host(); if (!panel) return
    if (!selection()) { panel.innerHTML = ''; return }
    const progress = [...events].reverse().find(event => ['fixed-reference', 'fixed-generated'].includes(event.detail?.phase))?.detail
    panel.innerHTML = `<details ${expanded ? 'open' : ''}><summary>固定用例评测</summary><p>选择各模块已准备的声明式用例文件。先验证参考实现，再用同一批用例评测生成代码；结果不会直接发布知识。</p>
      ${modules.map(module => `<label>${escape(module.moduleId)} <input type="file" accept=".json,application/json" data-fixed-suite-module="${escape(module.moduleId)}" ${busy || active() || !isEditable() ? 'disabled' : ''}></label><p>${escape(suites.get(module.moduleId)?.name ?? '尚未选择固定用例文件')}</p>`).join('')}
      <button type="button" class="secondary-button" data-fixed-action="start" ${busy || active() || !isEditable() || !modules.length || modules.some(module => !suites.has(module.moduleId)) ? 'disabled' : ''}>执行固定评测</button><p role="status">${escape(notice)}</p>
      ${task ? `<p>${escape({ PENDING: '排队中', RUNNING: '执行中', SUCCEEDED: '执行完成', FAILED: '执行失败', PAUSED: '已暂停', CANCELLED: '已取消' }[task.status] ?? '未知状态')} · ${escape(task.taskId)}</p>
      ${task.reasonCode ? `<p>${escape(reasons[task.reasonCode] ?? task.reasonCode)}；已完成的用例记录保留。</p>` : ''}
      ${progress ? `<p>${progress.phase === 'fixed-reference' ? '参考验证' : '生成代码评测'}：${escape(progress.moduleId)} · ${escape(progress.completed)}/${escape(progress.total)}</p>` : ''}
      ${(task.result?.summary.modules ?? []).map(module => {
        const loaded = reports.get(module.reportRef?.sha256)
        return `<section><h4>${escape(module.moduleId)} · ${escape(label[module.status] ?? '未知结果')}</h4><p>生成代码通过 ${escape(module.passed)}/${escape(module.total)}</p>
        <button type="button" class="secondary-button" data-download-artifact="/api/v1/stage-tasks/${escape(task.taskId)}/artifacts/${escape(module.reportRef.sha256)}">下载固定评测报告</button>
        ${(loaded?.suite.cases ?? []).map(test => {
          const reference = loaded.report.reference.find(item => item.caseId === test.caseId), generated = loaded.report.generated.find(item => item.caseId === test.caseId)
          return `<details><summary>${escape(test.caseId)} · ${generated?.status === 'PASSED' ? '生成通过' : generated ? '生成失败' : '生成未执行'}</summary><p>${escape(test.description)}</p><p>调用：${escape(test.calls.map(call => `${call.function}(${call.arguments.map(value).join(', ')})`).join(' → '))}</p>
          <table><thead><tr><th>观察项</th><th>预期</th><th>参考实际</th><th>生成实际</th></tr></thead><tbody>${test.observations.map(item => `<tr><td>${escape(item.name)}</td><td>${escape(value(test.expected[item.name]))}</td><td>${escape(value(reference?.actual?.[item.name]))}</td><td>${escape(value(generated?.actual?.[item.name]))}</td></tr>`).join('')}</tbody></table>
          ${[reference, generated].filter(item => item?.reasonCode).map(item => `<p>${escape(item.reasonCode)}</p><pre>${escape(item.report.build.stderr || item.report.execution?.stderr || '')}</pre>`).join('')}</details>`
        }).join('')}</section>`
      }).join('')}
      ${active() ? '<button type="button" class="secondary-button" data-fixed-action="cancel">取消固定评测</button>' : ''}
      ${current() && ['FAILED', 'PAUSED', 'CANCELLED'].includes(task.status) ? '<button type="button" class="secondary-button" data-fixed-action="resume">恢复固定评测</button>' : ''}` : ''}</details>`
  }
  async function observe() {
    clearTimeout(timer); timer = null; if (!task || !host()) return
    const id = task.taskId, selected = selection()
    try {
      const result = await request(`/api/v1/stage-tasks/${encodeURIComponent(id)}`)
      if (selection() !== selected || task?.taskId !== id) return
      task = result.task; events = result.events ?? []
      for (const module of task.result?.summary.modules ?? []) if (module.reportRef && !reports.has(module.reportRef.sha256)) {
        const report = await request(`/api/v1/stage-tasks/${encodeURIComponent(id)}/artifacts/${module.reportRef.sha256}`)
        const suite = await request(`/api/v1/stage-tasks/${encodeURIComponent(id)}/artifacts/${report.suiteRef.sha256}`)
        if (selection() !== selected || task?.taskId !== id) return
        reports.set(module.reportRef.sha256, { report, suite })
      }
      render()
    } catch { notice = '固定评测状态或报告暂不可读，既有记录保留。'; render() }
    if (active() && host()) timer = setTimeout(observe, 800)
  }
  root.addEventListener('toggle', event => { if (event.target.matches('[data-fixed-evaluation-panel] > details')) expanded = event.target.open }, true)
  root.addEventListener('change', async event => {
    const input = event.target.closest('[data-fixed-suite-module]'); if (!input || !isEditable() || busy || active()) return
    const id = selection(), file = input.files?.[0], moduleId = input.dataset.fixedSuiteModule
    try {
      if (!file || file.size > 262144) throw new Error('请选择不超过256KiB的固定用例文件。')
      const suite = JSON.parse(await file.text())
      if (suite.schemaVersion !== 'native-cases-v1' || !Array.isArray(suite.cases)) throw new Error('文件应包含native-cases-v1声明式用例。')
      if (selection() !== id) return
      suites.set(moduleId, { name: file.name, suite }); notice = ''
    } catch (error) { if (selection() === id) { suites.delete(moduleId); notice = error.message } }
    render()
  })
  root.addEventListener('click', async event => {
    const action = event.target.closest('[data-fixed-action]')?.dataset.fixedAction
    if (!['start', 'cancel', 'resume'].includes(action) || busy || !isEditable()) return
    const selected = selection(); if (!selected || (action !== 'start' && !task)) return
    busy = true; notice = ''; render()
    try {
      const payload = action === 'start' ? { reconstructionTaskId: selected, suites: modules.map(module => ({ moduleId: module.moduleId, suite: suites.get(module.moduleId)?.suite })) } : action === 'resume' ? { inputDigest: task.inputDigest } : {}
      const result = await request(action === 'start' ? '/api/v1/fixed-evaluations' : `/api/v1/stage-tasks/${encodeURIComponent(task.taskId)}/${action}`, { method: 'POST', body: JSON.stringify(payload) })
      if (selection() !== selected) return
      task = result.task; await observe()
    } catch (error) { if (selection() === selected) notice = reasons[error.code] ?? `固定评测未完成：${error.code ?? error.message}` }
    finally { busy = false; render() }
  })
  return { refresh() {
    const id = selection()
    if (parent !== id) {
      parent = id; task = null; events = []; modules = []; suites.clear(); reports.clear(); notice = ''; clearTimeout(timer); timer = null
      if (id) Promise.all([request(`/api/v1/stage-tasks/${encodeURIComponent(id)}`), request('/api/v1/stage-tasks')]).then(([original, history]) => {
        if (selection() !== id) return
        modules = original.task.result?.summary.modules ?? []
        task = history.items.find(item => item.input.parameters.operation === 'FIXED_NATIVE_EVALUATION' && item.input.parameters.reconstructionTaskId === id) ?? null
        render(); return observe()
      }).catch(() => { if (selection() === id) { notice = '固定评测输入暂不可读。'; render() } })
    } else if (active() && !timer) queueMicrotask(observe)
    render()
  } }
}
