/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：展示可恢复的一键五阶段任务及每阶段真实产物。
 */
import { sourceComparisonHtml } from './SourceComparison.js'
export function createWorkbenchPipelinePanel({ root, request, escapeHtml: escape, isEditable, selection }) {
  let pipeline = null, tasks = [], checkpoints = {}, usage = null, busy = false, notice = '', timer = null, epoch = 0, initialized = false
  let materials = [], materialsLoaded = false, materialNotice = ''
  const selectedMaterials = new Set()
  const host = () => root.querySelector('[data-workbench-pipeline-panel]')
  const active = () => pipeline && pipeline.contractVersion === 'knowledge-pipeline-v11' && ['PENDING', 'RUNNING'].includes(pipeline.status)
  const operationNames = { KNOWLEDGE_REVISION: '知识修订', KNOWLEDGE_SOURCE_REVISION: '来源修订', KNOWLEDGE_SOURCE_VERIFICATION: '整卡来源复核' }
  const names = { GENERATE: '知识库生成', INDEX: '知识索引', FLYWHEEL: '代码重建', EVALUATE: '知识评测', ASSOCIATE: '知识关联' }
  const statuses = { PENDING: '排队中', RUNNING: '执行中', SUCCEEDED: '执行完成', FAILED: '失败', PAUSED: '已暂停', CANCELLED: '已取消' }
  const reasons = { PIPELINE_SOURCE_RESULT_INVALID: '来源复核结果未完整绑定冻结卡片，未推进。', PIPELINE_SOURCE_UNRESOLVED: '来源复核仍有未知风险，请检查固定材料和逐章意见。', PIPELINE_NO_SOURCE_PROGRESS: '连续三次未完成新的章节修订，最新版本仍有来源矛盾，已暂停。', PIPELINE_SOURCE_VERIFICATION_REQUIRED: '缺少来源复核执行器，不能跳过门禁。', PIPELINE_SOURCE_REVISION_REQUIRED: '存在源码矛盾，但缺少来源修订执行器。', PIPELINE_SOURCE_INPUT_CHANGED: '来源复核输入与本轮冻结版本不匹配。', PIPELINE_CARD_SNAPSHOT_CHANGED: '当前卡片已切换源码快照，请重新分析相应源码版本。', PIPELINE_CARD_LINEAGE_CHANGED: '当前版本无法证明来自原卡片，未自动替换输入。', PIPELINE_NO_BEHAVIOR_PROGRESS: '连续三次未消除更多已知行为失败，已暂停并保留累计用量。', PIPELINE_REVISION_QUALITY_REJECTED: '修订未通过知识质量检查，请查看候选与弱项。', PIPELINE_REVISION_UNRESOLVED: '现有证据无法支持安全修订，请查看未解决项。', PIPELINE_ENVIRONMENT_CHANGED: '工具链已变化，请启动新流程；旧流程保留冻结输入与历史产物。', PIPELINE_PROCESS_EXITED: '服务曾中断，已保存前序结果，可恢复同一流程。', PIPELINE_SHUTDOWN: '服务已停止，恢复后继续原任务。',
    PIPELINE_BEHAVIOR_FAILED: '可信行为测试未通过，请查看评测报告并修订知识；后续关联尚未执行。', PIPELINE_INTERFACE_MISMATCH: '公开接口不匹配，请检查重建报告。',
    PIPELINE_INDEX_FAILED: '部分索引未建立，请检查索引阶段结果。', RUN_CONFIGURATION_INCOMPATIBLE: '模型或配置已变化，请使用冻结配置恢复，或启动新的流程。',
    WORKBENCH_RESOURCE_INSUFFICIENT: '服务器资源不足，释放资源后可以恢复。', TEST_CANDIDATE_REJECTED: '候选未通过参考验证，恢复会重新提出候选并保留累计用量。',
    NATIVE_TRUSTED_REFERENCE_FAILED: '历史可信测试与当前参考冲突，请检查源码和环境，原预期不会被替换。' }
  function render() {
    const panel = host(); if (!panel) return
    const selected = selection()
    if (!selected && !pipeline) { panel.innerHTML = ''; return }
    const resumable = pipeline && ['FAILED', 'PAUSED', 'CANCELLED'].includes(pipeline.status) && pipeline.contractVersion === 'knowledge-pipeline-v11'
    panel.innerHTML = `<h3>五阶段工作台</h3><p>生成卡片、建立索引、重建代码、执行评测，再建立关联。每一步仍可独立执行。</p>
      ${selected ? `<details><summary>一键流程的外部材料</summary><p>从来源页面捕获快照后选择；启动时冻结所选版本。</p><button type="button" class="secondary-button" data-pipeline-material-refresh>刷新材料</button><p>${escape(materialNotice)}</p>${materials.map((item) => `<label class="inline-check material-choice"><input type="checkbox" data-pipeline-material="${escape(item.materialId)}" ${selectedMaterials.has(item.materialId) ? 'checked' : ''} ${busy || active() ? 'disabled' : ''}><span>${escape(item.title)} · ${escape(item.applicability)}</span><small>${escape(item.sourceRevision)}</small></label>`).join('')}</details>` : ''}
      ${selected ? `<button class="primary-button" type="button" data-pipeline-action="start" ${busy || active() || !isEditable() ? 'disabled' : ''}>一键执行全部</button>` : '<p>先保存代码仓与模块输入，即可一键执行。</p>'}
      <p role="status">${escape(notice)}</p>${pipeline ? `<p><b>${escape(pipeline.cancelRequested && active() ? '正在取消' : statuses[pipeline.status] ?? '未知')}</b> · 当前：${escape(operationNames[tasks.find(item => item.taskId === pipeline.activeTaskId)?.input.parameters?.operation] ?? names[pipeline.currentStage] ?? '未知')}</p>
      ${pipeline.contractVersion !== 'knowledge-pipeline-v11' ? '<p>旧执行契约，只读查看历史产物；请启动新流程。</p>' : ''}${pipeline.initialVersionIds ? '<p>本流程使用启动时冻结的修订版本，原生成产物保留。</p>' : ''}<p>固定外部材料 ${(pipeline.materialIds ?? []).length} 份</p>
      <p>${escape(reasons[pipeline.reasonCode] ?? pipeline.reasonCode ?? '')}</p><p>累计模型调用 ${escape(usage?.modelCalls ?? 0)} 次；已报告 Token ${escape(usage?.tokens ?? 0)}。未报告的用量不视为零。</p>
      <ol>${Object.entries(names).map(([stage, name]) => { const task = tasks.find((item) => pipeline.children[stage] ? item.taskId === pipeline.children[stage].taskId : pipeline.contractVersion !== 'knowledge-pipeline-v11' && item.input.stage === stage)
        const summary = task?.result?.summary
        const saved = checkpoints[task?.taskId] ?? []
        const cards = Array.isArray(summary?.cards) ? summary.cards : saved.filter((item) => item.key.startsWith('card:')).map((item) => item.result.summary)
        const modules = summary?.modules ?? []
        return `<li><b>${name}</b> · ${task ? escape(statuses[task.status] ?? '未知') : '尚未启动'}
          ${task ? `<p style="overflow-wrap:anywhere">任务 ${escape(task.taskId)} · 输入版本 ${escape(task.input.sourceRevision)}</p>
          ${task.reasonCode ? `<p>${escape(reasons[task.reasonCode] ?? task.reasonCode)}</p>` : ''}
          ${cards.map((card) => `<button class="text-button" type="button" data-version-id="${escape(card.versionId)}">${escape(card.title ?? card.cardId ?? card.versionId)}</button>`).join(' ')}
          ${stage === 'INDEX' && summary ? `<p>新增 ${escape(summary.added)} · 更新 ${escape(summary.updated)} · 复用 ${escape(summary.reused)} · 失败 ${escape(summary.failed)}</p>` : ''}
          ${modules.map((module) => `<p>${escape(module.moduleId)} · ${stage === 'EVALUATE' ? `通过 ${escape(module.passed)}/${escape(module.total)}` : module.interfaceComparison?.compatible ? '公开接口匹配' : '公开接口存在差异'}</p>`).join('')}
          ${stage === 'FLYWHEEL' ? modules.map((module) => sourceComparisonHtml(module.sourceComparison, escape)).join('') : ''}
          ${stage === 'ASSOCIATE' && summary ? `<p>${escape(summary.relations)} 条关系；${summary.scope === 'INTERNAL_ONLY' ? '仅库内材料，可在卡片详情查看关联候选' : `外部材料 ${escape(summary.externalMaterials ?? 0)} 份，外部引用 ${escape(summary.externalRelations ?? 0)} 条`}</p>` : ''}
          ${(task.result?.artifactRefs ?? saved.filter((item) => /conflict:|rejection:|diagnostic:|failure:/.test(item.key)).flatMap((item) => item.result.artifactRefs)).slice(0, 8).map((ref, index) => `<button class="secondary-button" type="button" data-download-artifact="/api/v1/stage-tasks/${escape(task.taskId)}/artifacts/${escape(ref.sha256)}">下载产物 ${index + 1}</button>`).join('')}` : ''}</li>` }).join('')}</ol>
      ${(pipeline.iterations ?? []).length ? `<h4>迭代记录</h4>${pipeline.iterations.map(round => {
        const evaluation = tasks.find(item => item.taskId === round.evaluation?.taskId)
        const source = tasks.find(item => item.taskId === round.sourceVerification?.taskId)
        const revision = tasks.find(item => item.taskId === round.revision?.taskId)
        return `<details><summary>第 ${escape(round.number)} 轮 · ${round.progress ? `通过 ${escape(round.progress.passed)}/${escape(round.progress.total)}` : '尚未取得行为结果'}</summary>
          <p>${round.progress?.failed.length ? '可信行为测试未通过' : round.progress ? '可信行为测试通过' : '评测尚未完成'}</p>
          <p style="overflow-wrap:anywhere">代码任务 ${escape(round.reconstruction?.taskId ?? '尚未启动')}<br>评测任务 ${escape(round.evaluation?.taskId ?? '尚未启动')}</p>
          ${evaluation ? `<button type="button" class="secondary-button" data-pipeline-round="${escape(round.number)}">查看第 ${escape(round.number)} 轮评测</button>` : ''}
          ${source ? `<p>整卡来源复核 · ${escape(statuses[source.status] ?? '未知')} · ${escape({ SOURCE_MATCHED: '全部来源匹配', SOURCE_MISMATCH: '存在来源矛盾', UNRESOLVED: '仍有未知风险' }[source.result?.summary.outcome] ?? '')}</p><button type="button" class="secondary-button" data-pipeline-round="${escape(round.number)}">查看本轮来源复核</button>` : ''}
          ${revision ? `<p style="overflow-wrap:anywhere">修订任务 ${escape(revision.taskId)} · ${escape(statuses[revision.status] ?? '未知')} · ${escape(reasons[revision.reasonCode] ?? revision.reasonCode ?? revision.result?.summary.outcome ?? '')}</p>` : ''}
          ${round.versionIds.map(id => `<button type="button" class="text-button" data-version-id="${escape(id)}">查看输入版本</button>`).join(' ')}
        </details>` }).join('')}` : ''}
      ${active() ? `<button class="secondary-button" type="button" data-pipeline-action="cancel" ${busy || pipeline.cancelRequested || !isEditable() ? 'disabled' : ''}>取消全部</button>` : ''}
      ${resumable ? `<button class="secondary-button" type="button" data-pipeline-action="resume" ${busy || !isEditable() ? 'disabled' : ''}>恢复全部</button>` : ''}
      <p>阶段完成不代表知识已验证或已发布。行为失败或明确来源矛盾会进入对应修订，再重建、评测并复核全部章节；最终发布门禁尚未接通。</p>` : ''}`
  }
  async function observe() {
    clearTimeout(timer); timer = null; if (!pipeline || !host()) return
    const id = pipeline.pipelineId, current = epoch
    try { const detail = await request(`/api/v1/workbench-pipelines/${encodeURIComponent(id)}`)
      if (current !== epoch || pipeline?.pipelineId !== id) return
      pipeline = detail.pipeline; tasks = detail.tasks; checkpoints = detail.checkpoints ?? {}; usage = detail.usage; notice = ''; render()
    } catch { if (current === epoch) { notice = '流程状态暂不可读，持久化任务仍保留。'; render() } }
    if (active() && host()) timer = setTimeout(observe, 800)
  }
  async function loadMaterials() {
    try { const result = await request('/api/v1/external-materials'); materials = result.items; materialsLoaded = true; materialNotice = materials.length ? '' : '暂无材料快照；不选择则只建立库内关联。'; render() }
    catch { materialNotice = '材料列表读取失败，请重试。'; render() }
  }
  root.addEventListener('change', (event) => {
    const id = event.target.dataset?.pipelineMaterial; if (!id || busy || active()) return
    if (event.target.checked) selectedMaterials.add(id); else selectedMaterials.delete(id)
  })
  root.addEventListener('click', async (event) => {
    if (event.target.closest('[data-pipeline-material-refresh]')) { await loadMaterials(); return }
    const roundNumber = event.target.closest('[data-pipeline-round]')?.dataset.pipelineRound
    if (roundNumber) {
      const round = pipeline?.iterations?.find(item => item.number === Number(roundNumber))
      const code = tasks.find(item => item.taskId === round?.reconstruction?.taskId)
      const evaluation = tasks.find(item => item.taskId === round?.evaluation?.taskId)
      if (code) root.dispatchEvent(new CustomEvent('workbench-reconstruction-started', { detail: code }))
      if (evaluation) root.dispatchEvent(new CustomEvent('workbench-evaluation-selected', { detail: evaluation }))
      return
    }
    const action = event.target.closest('[data-pipeline-action]')?.dataset.pipelineAction
    if (!action || busy || !isEditable()) return
    const selected = selection(); if (action === 'start' && (!selected || active())) return
    const current = ++epoch; busy = true; notice = ''; render()
    try { const path = action === 'start' ? '/api/v1/workbench-pipelines' : `/api/v1/workbench-pipelines/${encodeURIComponent(pipeline.pipelineId)}/${action}`
      const result = await request(path, { method: 'POST', body: JSON.stringify(action === 'start' ? { ...selected, materialIds: [...selectedMaterials] } : action === 'resume' ? { inputDigest: pipeline.inputDigest } : {}) })
      if (current !== epoch) return
      pipeline = result.pipeline; tasks = []; usage = null; await observe()
    } catch (error) { if (current === epoch) notice = reasons[error.code] ?? `流程未启动：${error.code ?? '连接失败'}` }
    finally { if (current === epoch) { busy = false; render() } }
  })
  return { render, active, refresh() {
    render(); if (!host()) return
    if (selection() && !materialsLoaded) loadMaterials()
    if (!initialized) { initialized = true; const current = epoch
      request('/api/v1/workbench-pipelines').then((result) => { if (current !== epoch) return
        const selected = selection(); pipeline = result.items.find((item) => !selected || item.children.GENERATE.input.parameters.snapshotId === selected.snapshotId) ?? null
        return observe()
      }).catch(() => { initialized = false })
    } else if (active() && !timer) queueMicrotask(observe)
  } }
}
