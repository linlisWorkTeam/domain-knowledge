/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：显示参考验证、可信用例评测和失败章节，保留取消/恢复及下载入口。
 */
import { createSourceVerificationPanel } from './KnowledgeSourceVerification.js'
import { createKnowledgeRevisionPanel } from './KnowledgeRevision.js'
export function createKnowledgeEvaluationPanel({ root, request, escapeHtml: escape, isEditable, selection }) {
  let task = null, checkpoints = [], events = [], busy = false, notice = '', timer = null, initialized = false, epoch = 0
  const reportCache = new Map()
  const revisionCache = new Map()
  const revision = createKnowledgeRevisionPanel({ root, request, escapeHtml: escape, isEditable, selection: () => task?.status === 'SUCCEEDED' ? task.taskId : null, evidence: () => revisionCache.get(task?.taskId) })
  const sourceVerification = createSourceVerificationPanel({ root, request, escapeHtml: escape, isEditable, selection: () => task?.status === 'SUCCEEDED' ? task.taskId : null, onSupplement: async next => { task = next; checkpoints = []; events = []; notice = '已启动补充验证'; render(); await observe() } })
  const host = () => root.querySelector('[data-native-evaluation-panel]')
  const active = () => task && ['PENDING', 'RUNNING'].includes(task.status)
  const labels = { PENDING: '排队中', RUNNING: '评测中', SUCCEEDED: '评测执行完成', FAILED: '执行失败', PAUSED: '已暂停', CANCELLED: '已取消' }
  const reasons = {
    NATIVE_TRUSTED_REFERENCE_FAILED: '历史可信用例在当前参考实现上失败。原输入与预期已保留，请检查源码和环境，不能重新生成测试绕过门禁。',
    NATIVE_TRUSTED_INTERFACE_CHANGED: '公开接口发生变化，历史可信测试的适用性需要确认；已有用例不会自动删除。',
    NATIVE_TRUSTED_GATE_LIMIT: '历史可信用例总数超出当前执行上限，任务已暂停，未删减门禁。',
    AGENT_OUTPUT_INVALID: '模型返回的候选测试缺少必填字段或不符合协议。前序结果已保留，可恢复原任务重新提出。',
    DSH_AGENT_OUTPUT_NOT_JSON: '模型返回内容不完整或格式错误。前序结果已保留，可恢复原任务。',
    TEST_CANDIDATE_REJECTED: '候选用例未通过容量、补证目标检查或参考验证，不能用于评测生成代码，也不能据此判定知识错误。可重新生成候选，累计用量保留。',
    NATIVE_REFERENCE_BASELINE_FAILED: '参考实现基础构建或启动失败，请下载报告并检查构建参数和依赖。候选测试尚未生成。',
    NATIVE_TEST_TOOLCHAIN_CHANGED: '工具链已变化，请按当前环境重新重建代码，再启动评测。',
    PROVIDER_QUOTA_EXHAUSTED: '供应商额度不足，补充额度后可恢复。已完成用例保留。',
    STAGE_PROCESS_EXITED: '上次进程已退出，已完成用例保留，可恢复原任务。',
    WORKBENCH_RESOURCE_INSUFFICIENT: '内存或磁盘不足，释放资源后可恢复原任务。',
  }
  const download = (ref, text) => ref ? `<button class="secondary-button" type="button" data-download-artifact="/api/v1/stage-tasks/${escape(task.taskId)}/artifacts/${escape(ref.sha256)}">${text}</button>` : ''
  const value = (item) => typeof item === 'object' ? JSON.stringify(item) : String(item ?? '未取得')
  function caseHtml(item) {
    const input = item.input ?? {}, actual = item.actual ?? item.observation?.actual
    const expected = item.expected ?? input.expected ?? {}
    const diagnostic = item.report ?? item.observation?.report
    const stderr = [diagnostic?.build?.stderr, diagnostic?.execution?.stderr].filter(Boolean).join("\n").slice(0, 8192)
    return `<details><summary>${escape(input.caseId ?? item.caseId)} · ${escape(input.description ?? '')} · ${escape(item.status ?? item.observation?.status ?? '候选')}</summary>
      <p>输入调用：${(input.calls ?? []).map((call) => `<code>${escape(call.function)}(${escape(call.arguments.map((arg) => value(arg.integer ?? arg.number ?? arg.boolean ?? arg.string ?? arg)).join(', '))})</code>`).join('；')}</p>
      <table><thead><tr><th>观察项</th><th>预期</th><th>实际</th></tr></thead><tbody>${Object.entries(expected).map(([name, result]) => `<tr><td>${escape(name)}</td><td>${escape(value(result))}</td><td>${escape(value(actual?.[name]))}</td></tr>`).join('')}</tbody></table>
      <p>${escape(item.reasonCode ?? item.observation?.reasonCode ?? '')}</p>
      ${stderr ? `<details><summary>编译或运行诊断（完整内容见下载报告）</summary><pre>${escape(stderr)}</pre></details>` : ''}
      ${(item.sectionBindings ?? []).map((binding) => `<button class="text-button" type="button" data-version-id="${escape(binding.versionId)}">${escape(binding.sectionId)}${binding.matchesInput ? '' : '（历史章节）'}</button>`).join(' ')}
      <details><summary>完整用例输入</summary><pre>${escape(JSON.stringify(input, null, 2))}</pre></details></details>`
  }
  function revisionHtml() {
    const result = revisionCache.get(task?.taskId)
    if (!result) return ''
    if (result.error) return `<p>修订依据暂不可用：${escape(result.error)}。原评测结果保留。</p>`
    if (result.loading) return '<p>正在校验参考证据与当前章节…</p>'
    return `<section class="revision-evidence"><h4>修订依据</h4><p>以下章节可交给 Review 判断；失败本身不能证明知识错误，尚未授权修改正文。</p>
      ${result.modules.map((module) => `<p>${escape(module.moduleId)} · ${escape(module.failed)} 个失败用例</p>
      ${module.nextAction === 'NO_BEHAVIOR_REVISION_REQUIRED' ? '<p>可信行为用例全部通过，没有由行为失败提出的修订。</p>' : ''}
      ${module.candidates.map((card) => `<button class="text-button" type="button" data-version-id="${escape(card.versionId)}">查看绑定卡片版本</button>${card.sections.map((section) => `<details><summary>${escape(section.heading)} · 用例 ${section.caseIds.map(escape).join('、')}</summary><pre>${escape(section.text)}</pre></details>`).join('')}`).join('')}
      ${module.unresolved.map((item) => `<p>未解决：${escape(item.caseId)} · ${escape(item.sectionId ?? '')} · ${escape({ CURRENT_SECTION_REQUIRED: '章节或版本已变化，需要重新定位', NO_CONFIRMED_BEHAVIOR_OBSERVATION: '未取得可用于修订的行为观察，先检查构建或运行诊断' }[item.reason] ?? item.reason)}</p>`).join('')}`).join('')}</section>`
  }
  function render() {
    const panel = host(); if (!panel) return
    const parent = selection(); if (!parent && !task) { panel.innerHTML = ''; return }
    const rejected = checkpoints.filter((item) => (item.key.startsWith('candidate-rejection:') || item.key.startsWith('trusted-gate-conflict:'))).at(-1)?.result
    const summaries = task?.result?.summary?.modules ?? [...checkpoints.filter((item) => item.key.startsWith('module-report:')).map((item) => item.result.summary), ...(['TEST_CANDIDATE_REJECTED', 'NATIVE_TRUSTED_REFERENCE_FAILED'].includes(task?.reasonCode) && rejected ? [rejected.summary] : [])]
    const modules = summaries.map((module) => ['CANDIDATE_REJECTED', 'TRUSTED_GATE_CONFLICT'].includes(module.status) ? { ...module, ...(reportCache.get(module.reportRef?.sha256) ?? {}) } : { ...module, report: reportCache.get(module.reportRef?.sha256) })
    const resume = task && ['FAILED', 'PAUSED', 'CANCELLED'].includes(task.status) && task.contractVersion === 'knowledge-workbench-v1'
      && Object.entries(task.limits ?? {}).every(([key, limit]) => task.usage[key] < limit)
    const progress = [...events].reverse().find((event) => event.kind === 'PROGRESS' && event.detail?.caseId)?.detail
    panel.innerHTML = `<h3>知识评测</h3><p>候选先在参考实现验证，可信用例再检查重建代码。可独立执行知识修订；一键流程可自动多轮推进；可信评测、固定用例及整卡来源复核通过后，可在下方验证并发布。</p>
      ${parent ? `<button class="primary-button" type="button" data-native-evaluation-action="start" ${busy || active() || !isEditable() ? 'disabled' : ''}>执行评测</button>` : ''}<p role="status">${escape(notice)}</p>
      ${task ? `<p><b>${escape(task.cancelRequested && active() ? '正在取消' : labels[task.status] ?? '未知')}</b> · 尚未通过发布门禁</p><p>任务 ${escape(task.taskId)} · 累计模型调用 ${escape(task.usage.modelCalls)} 次</p>
      ${progress && active() ? `<p>当前用例：${escape(progress.caseId)} · ${escape(progress.completed)}/${escape(progress.total)}</p>` : ''}
      ${task.result?.summary ? `<p>已处理 ${escape(task.result.summary.completedModules)}/${escape(task.result.summary.requestedModules)} 个模块。</p>` : ''}
      ${task.reasonCode ? `<p>${escape(reasons[task.reasonCode] ?? task.reasonCode)}</p>` : ''}
      ${modules.map((module) => `<section><h4>${escape(module.moduleId)} · ${escape({ BEHAVIOR_PASSED: '可信用例全部通过', BEHAVIOR_FAILED: '可信用例存在失败', CANDIDATE_REJECTED: '候选未通过验证', TRUSTED_GATE_CONFLICT: '历史可信门禁与当前参考冲突' }[module.status] ?? module.status)}</h4>
      <p>新增 ${escape(module.proposed ?? 0)} 个候选；复用 ${escape(module.reused ?? 0)} 个用例${module.revalidated ? '，已重新验证参考实现' : ''}。</p>
      ${module.candidateConstraint?.code === 'NATIVE_TRUSTED_GATE_LIMIT' ? `<p>合并后需要 ${escape(module.candidateConstraint.requiredCases)} 条用例，超过 ${escape(module.candidateConstraint.maximumCases)} 条容量；已保留 ${escape(module.candidateConstraint.retainedCases)} 条可信用例。本批候选未执行，请重新生成较少的候选测试。</p>` : ''}
      ${module.targetCoverage ? `<p>补证段落引用命中 ${escape(module.targetCoverage.matchedSectionIds.length)} 个；未命中 ${escape(module.targetCoverage.unmatchedSectionIds.length)} 个。引用命中不代表语义验证通过。</p>${!module.targetCoverage.candidateEligible ? '<p>候选未命中指定段落，未执行候选测试。</p>' : ''}<p>未命中段落：${module.targetCoverage.unmatchedSectionIds.map(escape).join('、') || '无'}</p>` : ''}
      ${module.report ? `<p>通过 ${escape(module.report.passed)}/${escape(module.report.total)}${module.interfaceCompatible === false ? '；公开接口存在差异' : ''}</p>` : ''}
      ${download(module.reportRef, '下载评测报告')}${download(module.oracleRef, '下载参考验证')}
      ${(module.report?.cases ?? module.cases ?? []).map(caseHtml).join('')}</section>`).join('')}
      ${task.status === 'SUCCEEDED' ? '<button class="secondary-button" type="button" data-revision-evidence>查看修订依据</button>' : ''}${revisionHtml()}<section data-knowledge-revision-panel></section><section data-source-verification-panel></section>
      ${task.reasonCode === 'NATIVE_REFERENCE_BASELINE_FAILED' ? checkpoints.filter((item) => item.key.startsWith('reference-baseline:')).map((item) => download(item.result.artifactRefs[0], '下载参考构建报告')).join('') : ''}
      ${active() ? `<button class="secondary-button" type="button" data-native-evaluation-action="cancel" ${busy || task.cancelRequested || !isEditable() ? 'disabled' : ''}>取消评测</button>` : ''}
      ${resume ? `<button class="secondary-button" type="button" data-native-evaluation-action="resume" ${busy || !isEditable() ? 'disabled' : ''}>${task.reasonCode === 'TEST_CANDIDATE_REJECTED' ? '重新生成候选测试' : '恢复评测'}</button>` : ''}` : ''}`
    revision.refresh(); sourceVerification.refresh()
  }
  async function observe() {
    clearTimeout(timer); timer = null; if (!task || !host()) return
    const id = task.taskId, current = epoch
    try {
      const detail = await request(`/api/v1/stage-tasks/${encodeURIComponent(id)}`)
      if (current !== epoch || task?.taskId !== id) return
      task = detail.task; checkpoints = detail.checkpoints ?? []; events = detail.events ?? []; notice = ''; render()
      const summaries = task.result?.summary?.modules ?? checkpoints.filter((item) => item.key.startsWith('module-report:') || (item.key.startsWith('candidate-rejection:') || item.key.startsWith('trusted-gate-conflict:'))).map((item) => item.result.summary)
      await Promise.all(summaries.map(async (module) => {
        const ref = module.reportRef
        if (!ref || reportCache.has(ref.sha256)) return
        try { reportCache.set(ref.sha256, await request(`/api/v1/stage-tasks/${encodeURIComponent(id)}/artifacts/${ref.sha256}`)) }
        catch { notice = '部分报告暂不可读，可通过下载重试；执行结果保留。' }
      }))
      if (current === epoch && task?.taskId === id) render()
    } catch { if (current === epoch) { notice = '状态暂不可读，已完成用例仍保留。'; render() } }
    if (active() && host()) timer = setTimeout(observe, 800)
  }
  root.addEventListener('workbench-evaluation-selected', event => { epoch++; task = event.detail; checkpoints = []; events = []; notice = ''; initialized = true; render(); void observe() })
  root.addEventListener('click', async (event) => {
    if (event.target.closest('[data-revision-evidence]') && task?.status === 'SUCCEEDED') {
      const id = task.taskId
      if (revisionCache.get(id)?.loading) return
      revisionCache.set(id, { loading: true }); render()
      try { revisionCache.set(id, await request(`/api/v1/native-evaluations/${encodeURIComponent(id)}/revision-evidence`)) }
      catch (error) { revisionCache.set(id, { error: error.code ?? '连接失败' }) }
      if (task?.taskId === id) render()
      return
    }
    const action = event.target.closest('[data-native-evaluation-action]')?.dataset.nativeEvaluationAction
    if (!action || busy || !isEditable()) return
    const parent = selection(); if (action === 'start' && (!parent || active())) return
    const current = ++epoch; busy = true; notice = ''; render()
    try {
      const path = action === 'start' ? '/api/v1/native-evaluations' : `/api/v1/stage-tasks/${encodeURIComponent(task.taskId)}/${action}`
      const payload = action === 'start' ? { reconstructionTaskId: parent } : action === 'resume' ? { inputDigest: task.inputDigest } : {}
      const result = await request(path, { method: 'POST', body: JSON.stringify(payload) })
      if (current !== epoch) return
      task = result.task; checkpoints = []; events = []; await observe()
    } catch (error) { if (current === epoch) notice = reasons[error.code] ?? `评测操作未完成：${error.code ?? '连接失败'}` }
    finally { if (current === epoch) { busy = false; render() } }
  })
  return { render, refresh() {
    render(); if (!host() || !isEditable()) return
    if (!initialized) {
      initialized = true; const current = epoch
      request('/api/v1/stage-tasks').then((result) => {
        if (current !== epoch) return
        task = result.items.find((item) => item.input.stage === 'EVALUATE' && item.input.parameters.operation === undefined) ?? null; return observe()
      }).catch(() => { initialized = false })
    } else if (active() && !timer) queueMicrotask(observe)
  } }
}
