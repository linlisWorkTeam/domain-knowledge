/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：展示整卡来源复核、冻结版本和独立结论，提供恢复及证据下载。
 */
import { createKnowledgeRevisionPanel } from './KnowledgeRevision.js'
export function createSourceVerificationPanel({ root, request, escapeHtml: escape, isEditable, selection, onSupplement }) {
  let task = null, checkpoints = [], events = [], loadedFor = null, timer = null, busy = false, notice = ''
  let scopes = null, scopeKey = '', scopeError = false
  const revision = createKnowledgeRevisionPanel({ root, request, escapeHtml: escape, isEditable, source: true, selection: () => task?.status === 'SUCCEEDED' ? task.taskId : null, evidence: () => task?.result?.summary })
  const host = () => root.querySelector('[data-source-verification-panel]')
  const current = () => task?.contractVersion === 'knowledge-workbench-v1' && task?.input.parameters.verificationContract === 'knowledge-source-verification-v5'
  const active = () => current() && ['PENDING', 'RUNNING'].includes(task.status)
  const reasons = { AGENT_STAGE_TIMEOUT: '来源复核超时，已完成章节和输入材料保留。', DSH_AGENT_OUTPUT_NOT_JSON: '模型输出格式错误，前序结果保留，可恢复原任务。', STAGE_PROCESS_EXITED: '上次进程退出，可恢复原任务。', PROVIDER_QUOTA_EXHAUSTED: '供应商额度不足，累计用量和已完成结果保留。' }
  Object.assign(reasons, {
    REVIEW_CONCERN_UNRESOLVED: '待核实问题的回应或源码引用未通过校验，原始意见和已完成章节已保留。',
    REVIEW_CORRECTION_RANGE_INVALID: '修订内容没有覆盖完整的授权章节，需要修正段落范围。',
    REVIEW_REPAIR_FACTS_CHANGED: '格式修正改变了原有判断或风险，结果已被拒绝；需先核对保留的原始意见。',
    REVIEW_PASS_CONTRADICTION: '复核仍有风险或修订意见，不能同时判定通过。',
    SOURCE_HISTORY_BINDING_INVALID: '历史来源意见与当前源码或卡片版本不一致，已停止复用。',
    SOURCE_CONCERN_BINDING_INVALID: '待核实问题与原任务证据不一致，已停止执行。',
    STAGE_ARTIFACT_CORRUPT: '输入或证据文件校验失败，请检查原始文件；已完成结果保留。',
    STAGE_CONTRACT_INCOMPATIBLE: '执行契约已更新，请创建新任务；旧结果保留供查看。',
  })
  const outcomes = { SOURCE_MATCHED: '来源复核匹配', SOURCE_MISMATCH: '正文与源码存在矛盾', UNRESOLVED: '仍有未解决问题' }
  const scopeAvailable = ref => [...(task?.result?.artifactRefs ?? []), ...checkpoints.flatMap(item => item.result?.artifactRefs ?? [])].some(item => item.sha256 === ref?.sha256)
  const download = (ref, label) => `<button class="secondary-button" type="button" data-download-artifact="/api/v1/stage-tasks/${escape(task.taskId)}/artifacts/${escape(ref.sha256)}">${label}</button>`
  function scopeHtml() {
    const ref = task?.input.parameters.executionScopesRef
    if (!ref) return ''
    if (!scopeAvailable(ref)) return '<details><summary>本次实际构建范围</summary><p>构建证据尚未完成运行校验，校验完成后提供范围和下载；任务失败时可恢复原任务重试。</p></details>'
    const matching = scopeKey === `${task.taskId}:${ref.sha256}`
    return `<details><summary>本次实际构建范围</summary><p>仅说明本轮参考测试使用的固定配置，不代表其他宏组合或平台已验证。</p>
      ${matching && scopeError ? '<p>构建范围暂不可读，可下载原始工件重试；复核结果保留。</p>' : !matching || scopes === null ? '<p>正在读取冻结构建记录…</p>' : scopes.map(({ moduleId, scope }) => `<article><p>${escape(moduleId)} · ${escape(scope.language === 'c' ? scope.build.cCompiler : scope.build.cppCompiler)} · ${escape(scope.language === 'c' ? scope.build.cStandard : scope.build.cppStandard)} · ${escape(scope.architecture)}</p>
      <p>包含目录：${scope.build.includeDirectories.map(escape).join('、') || '未额外指定'}；宏定义：${scope.build.definitions.map(escape).join('、') || '未额外指定'}</p>
      <p>未额外指定宏不等于所有宏组合已验证，也不列举编译器预定义宏。</p>${download(scope.referenceRef, '下载参考构建清单')}${download(scope.fingerprintRef, '下载工具链记录')}</article>`).join('')}
      ${download(ref, '下载冻结构建范围')}</details>`
  }
  function render() {
    const panel = host(); if (!panel) return
    if (!selection()) { panel.innerHTML = ''; return }
    const cards = task?.result?.summary.cards ?? checkpoints.filter(item => item.key.startsWith('source-card:')).map(item => item.result.summary)
    const progress = [...events].reverse().find(event => event.detail?.phase === 'source-section')?.detail
    const inputs = checkpoints.filter(item => item.key.startsWith('source-materials:')).at(-1)?.result
    panel.innerHTML = `<h4>整卡来源复核</h4><p>逐章检查本次评测使用的全部卡片，包括未修改的章节。行为用例通过仍需核对来源；匹配结果不代表已通过发布门禁。</p>
      <button class="secondary-button" type="button" data-source-verification-action="start" ${busy || active() || !isEditable() ? 'disabled' : ''}>复核全部卡片来源</button><p role="status">${escape(notice)}</p>
      ${task ? `<p>单次来源复核上限 ${escape((task.input.parameters.sourceReviewPolicy?.timeoutMs ?? 180000) / 1000)} 秒；取消和总预算仍有效。</p>${!current() ? '<p>旧来源契约，仅供查看历史结果；重新复核将创建新契约任务。</p>' : ''}<p>${escape({ PENDING: '排队中', RUNNING: '正在复核', SUCCEEDED: '复核执行完成', FAILED: '执行失败', PAUSED: '已暂停', CANCELLED: '已取消' }[task.status] ?? '未知')} · ${escape(outcomes[task.result?.summary.outcome] ?? '')}</p><p>累计模型调用 ${escape(task.usage.modelCalls)} 次 · ${escape(reasons[task.reasonCode] ?? task.reasonCode ?? '')}</p>
      <p>已复核 ${escape(cards.length)}/${escape(task.input.cardVersionIds.length)} 张冻结卡片。</p>${progress ? `<p>最近处理：${escape(progress.heading)} · 完成 ${escape(progress.completed)}/${escape(progress.total)} 章</p>` : ''}
      ${scopeHtml()}
      ${inputs ? `<details><summary>最近处理卡片的固定输入</summary><button class="text-button" type="button" data-version-id="${escape(inputs.summary.versionId)}">查看输入卡片</button>${inputs.artifactRefs.map((ref, index) => `<button class="secondary-button" type="button" data-download-artifact="/api/v1/stage-tasks/${escape(task.taskId)}/artifacts/${escape(ref.sha256)}">下载${['卡片正文', '固定源码', '参考观察', '复核准则', '可信测试集', '参考执行报告'][index] ?? '输入材料'}</button>`).join('')}</details>` : ''}
      ${events.filter(event => event.detail?.phase === 'role-stage-attempt' && ['FAILED', 'REJECTED'].includes(event.detail.status)).map(event => `<p>角色尝试 ${escape(event.detail.taskAttempt)} / ${escape(event.detail.attempt)} · ${escape(reasons[event.detail.issueCode] ?? event.detail.issueHint ?? '执行未完成')} <button class="secondary-button" type="button" data-download-artifact="/api/v1/stage-tasks/${escape(task.taskId)}/artifacts/${escape(event.detail.artifactRef.sha256)}">下载复核尝试</button></p>`).join('')}
      ${cards.map(card => `<article><button class="text-button" type="button" data-version-id="${escape(card.versionId)}">查看冻结卡片</button><p>${escape(card.moduleId)} · ${escape(outcomes[card.outcome] ?? '未知')}</p><p>${escape(card.heading ?? '')} · ${escape(card.criterion ?? '')} ${(card.unresolved ?? []).map(escape).join('；')}</p>${card.reviewRef ? `<button class="secondary-button" type="button" data-download-artifact="/api/v1/stage-tasks/${escape(task.taskId)}/artifacts/${escape(card.reviewRef.sha256)}">下载来源意见</button>` : ''}${(card.sections ?? []).map(section => `<details><summary>${escape(section.section)} · ${escape(outcomes[section.outcome] ?? '未知')}</summary>${section.carriedForward ? `<p>沿用同一正文已有的来源矛盾，尚待修订。原任务 <code>${escape(section.originEvidence?.taskId ?? '')}</code></p>` : ''}<p>${escape(section.criterion ?? '')} ${(section.unresolved ?? []).map(escape).join('；')}</p>${section.reviewRef ? `<button class="secondary-button" type="button" data-download-artifact="/api/v1/stage-tasks/${escape(task.taskId)}/artifacts/${escape(section.reviewRef.sha256)}">下载章节复核</button>` : ''}</details>`).join('')}</article>`).join('')}
      ${current() && task.status === 'SUCCEEDED' && cards.some(card => card.sections?.some(section => section.outcome === 'UNRESOLVED')) && onSupplement ? `<button class="secondary-button" type="button" data-source-verification-action="supplement" ${busy || !isEditable() ? 'disabled' : ''}>补充验证用例</button><p>针对未解决章节新增候选用例，先在参考实现上验证，再评测重建代码。</p>` : ''}
      ${active() ? `<button class="secondary-button" type="button" data-source-verification-action="cancel" ${busy || !isEditable() ? 'disabled' : ''}>取消来源复核</button>` : ''}
      ${current() && ['FAILED', 'PAUSED', 'CANCELLED'].includes(task.status) ? `<button class="secondary-button" type="button" data-source-verification-action="resume" ${busy || !isEditable() ? 'disabled' : ''}>恢复来源复核</button>` : ''}` : ''}<section data-source-revision-panel></section>`
    revision.refresh()
  }
  async function observe() {
    clearTimeout(timer); timer = null; if (!task || !host()) return
    const id = task.taskId, parent = selection()
    try {
      const result = await request(`/api/v1/stage-tasks/${encodeURIComponent(id)}`)
      if (selection() !== parent || task?.taskId !== id) return
      task = result.task; checkpoints = result.checkpoints ?? []; events = result.events ?? []; render()
      const ref = task.input.parameters.executionScopesRef
      const key = ref ? `${id}:${ref.sha256}` : ''
      if (key && key !== scopeKey && scopeAvailable(ref)) {
        scopeKey = key; scopes = null; scopeError = false
        try {
          const value = await request(`/api/v1/stage-tasks/${encodeURIComponent(id)}/artifacts/${ref.sha256}`)
          if (!Array.isArray(value) || !value.length || value.some(item => item?.scope?.schemaVersion !== 'source-execution-scope-v1'
            || item.scope.configurationCoverage !== 'SINGLE_FROZEN_BUILD' || typeof item.moduleId !== 'string' || typeof item.scope.architecture !== 'string'
            || !['c', 'cpp'].includes(item.scope.language) || !Array.isArray(item.scope.build?.definitions)
            || !Array.isArray(item.scope.build?.includeDirectories) || [...item.scope.build.definitions, ...item.scope.build.includeDirectories].some(value => typeof value !== 'string')
            || !item.scope.referenceRef?.sha256 || !item.scope.fingerprintRef?.sha256)) throw new Error('INVALID_SCOPE')
          if (selection() === parent && task?.taskId === id) scopes = value
        } catch { if (selection() === parent && task?.taskId === id) scopeError = true }
        if (selection() === parent && task?.taskId === id) render()
      }
    } catch { if (selection() === parent) { notice = '复核状态暂不可读，已完成材料保留。'; render() } }
    if (active() && host()) timer = setTimeout(observe, 800)
  }
  root.addEventListener('click', async event => {
    const action = event.target.closest('[data-source-verification-action]')?.dataset.sourceVerificationAction
    if (!['start', 'cancel', 'resume', 'supplement'].includes(action) || busy || !isEditable()) return
    const parent = selection(); if (!parent || (action !== 'start' && !task)) return
    if (action !== 'start' && !current()) return
    busy = true; notice = ''; render()
    try {
      if (action === 'supplement') {
        const evaluation = await request(`/api/v1/stage-tasks/${encodeURIComponent(parent)}`)
        const result = await request('/api/v1/native-evaluations', { method: 'POST', body: JSON.stringify({ reconstructionTaskId: evaluation.task.input.parameters.reconstructionTaskId, sourceVerificationTaskId: task.taskId }) })
        if (selection() === parent) await onSupplement(result.task)
        return
      }
      const result = await request(action === 'start' ? '/api/v1/source-verifications' : `/api/v1/stage-tasks/${encodeURIComponent(task.taskId)}/${action}`, { method: 'POST', body: JSON.stringify(action === 'start' ? { evaluationTaskId: parent } : action === 'resume' ? { inputDigest: task.inputDigest } : {}) })
      if (selection() !== parent) return
      task = result.task; await observe()
    } catch (error) { if (selection() === parent) notice = `来源复核操作未完成：${error.code ?? '连接失败'}` }
    finally { busy = false; render() }
  })
  return { refresh() {
    const id = selection()
    if (loadedFor !== id) {
      loadedFor = id; task = null; checkpoints = []; events = []; notice = ''; scopes = null; scopeKey = ''; scopeError = false; clearTimeout(timer); timer = null
      if (id) request('/api/v1/stage-tasks').then(result => {
        if (selection() !== id) return
        task = result.items.find(item => item.input.parameters.operation === 'KNOWLEDGE_SOURCE_VERIFICATION' && item.input.parameters.evaluationTaskId === id) ?? null
        return observe()
      }).catch(() => { if (selection() === id) { notice = '历史复核暂不可读。'; render() } })
    } else if (active() && !timer) queueMicrotask(observe)
    render()
  } }
}
