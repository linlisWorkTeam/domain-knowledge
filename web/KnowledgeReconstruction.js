/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：展示独立重建、检查点代码下载与恢复，区分接口检查和行为验证。
 */
import { createFixedEvaluationPanel } from './FixedEvaluation.js'
import { sourceComparisonHtml } from './SourceComparison.js'
import { createKnowledgeEvaluationPanel } from './KnowledgeEvaluation.js'
export function createKnowledgeReconstructionPanel({ root, request, escapeHtml: escape, isEditable, selection }) {
  let task = null, checkpoints = [], busy = false, notice = '', timer = null, initialized = false, epoch = 0
  const evaluation = createKnowledgeEvaluationPanel({ root, request, escapeHtml: escape, isEditable, selection: () => task?.status === 'SUCCEEDED' ? task.taskId : null })
  const fixedEvaluation = createFixedEvaluationPanel({ root, request, escapeHtml: escape, isEditable, selection: () => task?.status === 'SUCCEEDED' ? task.taskId : null })
  const active = () => task && task.input.parameters.comparisonContract === 'native-source-comparison-v1' && ['PENDING', 'RUNNING'].includes(task.status)
  const host = () => root.querySelector('[data-reconstruction-panel]')
  const reasons = {
    SOURCE_COMPARISON_UNAVAILABLE: '源码比较未完成，代码和诊断已保存，请查看报告中的容量或词法限制。',
    RECONSTRUCTION_CACHE_BINDING_INVALID: '历史代码与原输入证据不一致，已停止复用，请检查工件完整性。',
    AGENT_OUTPUT_INVALID: '模型返回的代码文件缺少必填字段或不符合协议。前序结果已保留，可恢复原任务重新提出。',
    DSH_AGENT_OUTPUT_NOT_JSON: '模型返回内容不完整或格式错误。前序结果已保留，可恢复原任务。',
    NATIVE_INTERFACE_COMPILE_FAILED: '生成接口未通过编译检查。代码和诊断已保留，请查看诊断后恢复。',
    NATIVE_TEST_TOOLCHAIN_CHANGED: '工具链已变化，请按当前环境启动新重建；旧任务保留原输入。',
    DSH_CONFIGURATION_UNAVAILABLE: '请先在 Agent 设置中保存并验证模型。',
    RUN_CONFIGURATION_INCOMPATIBLE: '模型或执行配置与冻结输入不一致，请按当前配置启动新任务。',
    PROVIDER_QUOTA_EXHAUSTED: '供应商额度耗尽，补充额度后可恢复原任务。',
    WORKBENCH_RESOURCE_INSUFFICIENT: '内存或磁盘不足，释放资源后可恢复原任务。',
    STAGE_PROCESS_EXITED: '上次进程已退出；已生成代码保留，可恢复原任务。',
  }
  const labels = { PENDING: '排队中', RUNNING: '重建中', SUCCEEDED: '重建及接口检查完成', PAUSED: '已暂停', FAILED: '失败', CANCELLED: '已取消' }
  const download = (ref, title) => ref ? `<button class="secondary-button" type="button" data-download-artifact="/api/v1/stage-tasks/${escape(task.taskId)}/artifacts/${escape(ref.sha256)}">${title}</button>` : ''
  function render() {
    const panel = host(); if (!panel) return
    const selected = selection()
    if (!selected && !task) { panel.innerHTML = ''; return }
    const modules = task?.result?.summary?.modules ?? []
    const generated = checkpoints.filter((item) => item.key.startsWith('role:code:'))
    const resume = task && task.input.parameters.comparisonContract === 'native-source-comparison-v1' && ['FAILED', 'PAUSED', 'CANCELLED'].includes(task.status) && task.contractVersion === 'knowledge-workbench-v1'
      && Object.entries(task.limits ?? {}).every(([key, limit]) => task.usage[key] < limit)
    panel.innerHTML = `<h3>代码重建与接口检查</h3><p>使用已生成卡片和公开接口重建代码。重建后可执行行为评测。展示规范化函数差异及定位范围。评测后可独立执行知识修订。</p>
      ${selected ? `<p>输入：${escape(selected.versionIds.length)} 个知识版本 · ${escape(selected.snapshotId)}</p><button class="primary-button" type="button" data-reconstruction-action="start" ${busy || active() || !isEditable() ? 'disabled' : ''}>执行代码重建</button>` : '<p>完成知识生成后可执行重建。</p>'}
      <p role="status">${escape(notice)}</p>${task ? `<p><b>${escape(task.cancelRequested && active() ? '正在取消' : labels[task.status] ?? '未知')}</b> · 重建结果不代表行为验证或发布</p>
      <p>任务 ${escape(task.taskId)} · 累计模型请求 ${escape(task.usage.modelCalls)} 次</p>
      ${task.reasonCode ? `<p>${escape(reasons[task.reasonCode] ?? task.reasonCode)}</p>` : ''}
      ${task.status === 'FAILED' && checkpoints.some((item) => item.key.startsWith('code-rejection:')) ? '<p>恢复将在原任务中修复生成代码，累计用量不重置。</p>' : ''}
      ${modules.length ? `<ul>${modules.map((item) => `<li>${escape(item.moduleId)} · ${item.interfaceComparison.compatible ? '公开接口匹配' : '公开接口存在差异'}${download(item.codeRef, '下载生成代码')}${download(item.comparisonRef, '下载接口比较')}${download(item.sourceComparisonRef, '下载源码比较')}${item.codeReusedFrom ? `<p class="material-identity">复用代码任务 ${escape(item.codeReusedFrom)}；历史用量已继承。</p>` : ''}${sourceComparisonHtml(item.sourceComparison, escape)}</li>`).join('')}</ul>` : generated.map((item) => `<p>已保存生成代码 ${download(item.result.artifactRefs[1], '下载生成代码')}</p>`).join('')}
      ${checkpoints.filter((item) => !task?.result && item.key.startsWith('source-comparison:')).map((item) => download(item.result.artifactRefs[0], '下载源码比较')).join('')}
      ${checkpoints.filter((item) => item.key.startsWith('code-rejection:') || item.key.startsWith('generated-diagnostic:')).map((item) => download(item.result.artifactRefs[1], '下载生成代码诊断')).join('')}
      ${active() ? `<button class="secondary-button" type="button" data-reconstruction-action="cancel" ${busy || task.cancelRequested || !isEditable() ? 'disabled' : ''}>取消重建</button>` : ''}
      ${resume ? `<button class="secondary-button" type="button" data-reconstruction-action="resume" ${busy || !isEditable() ? 'disabled' : ''}>恢复重建</button>` : ''}` : ''}<section data-native-evaluation-panel></section><section data-fixed-evaluation-panel></section>`
    evaluation.refresh(); fixedEvaluation.refresh()
  }
  async function observe() {
    clearTimeout(timer); timer = null; if (!task || !host()) return
    const id = task.taskId, current = epoch
    try {
      const detail = await request(`/api/v1/stage-tasks/${encodeURIComponent(id)}`)
      if (current !== epoch || task?.taskId !== id) return
      task = detail.task; checkpoints = detail.checkpoints ?? []; notice = ''; render()
    } catch { if (current === epoch) { notice = '状态暂不可读，已保存的代码仍保留。'; render() } }
    if (active() && host()) timer = setTimeout(observe, 800)
  }
  root.addEventListener('workbench-reconstruction-started', event => { epoch++; task = event.detail; checkpoints = []; notice = ''; render(); void observe() })
  root.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-reconstruction-action]')?.dataset.reconstructionAction
    if (!action || busy || !isEditable()) return
    const selected = selection(); if (action === 'start' && (!selected || active())) return
    const current = ++epoch; busy = true; notice = ''; render()
    try {
      const path = action === 'start' ? '/api/v1/reconstructions' : `/api/v1/stage-tasks/${encodeURIComponent(task.taskId)}/${action}`
      const payload = action === 'start' ? selected : action === 'resume' ? { inputDigest: task.inputDigest } : {}
      const result = await request(path, { method: 'POST', body: JSON.stringify(payload) })
      if (current !== epoch) return
      task = result.task; checkpoints = []; await observe()
    } catch (error) { if (current === epoch) notice = reasons[error.code] ?? `重建操作未完成：${error.code ?? '连接失败'}` }
    finally { if (current === epoch) { busy = false; render() } }
  })
  return { render, refresh() {
    render(); if (!host() || !isEditable()) return
    if (!initialized) {
      initialized = true; const current = epoch
      request('/api/v1/stage-tasks').then((result) => {
        if (current !== epoch) return
        task = result.items.find((item) => item.input.stage === 'FLYWHEEL' && !item.input.parameters.operation) ?? null
        return observe()
      }).catch(() => { initialized = false })
    } else if (active() && !timer) queueMicrotask(observe)
  } }
}
