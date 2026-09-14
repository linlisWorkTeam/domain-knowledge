/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：批次删除预览、二次确认和已确认删除的恢复弹窗。
 */
const kinds = { batch: '批次', run: '运行', pipeline: '流程', stage: '阶段任务', knowledge: '知识版本', index: '索引', association: '关联', testSet: '测试集', publication: '发布记录', artifact: '产物', source: '来源', configuration: '配置' }
export function openBatchDeletion({ request, kind, id, label, receipt }) {
  if (document.querySelector('[data-deletion-dialog]')) return Promise.resolve(false)
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'); dialog.dataset.deletionDialog = ''; dialog.setAttribute('aria-label', '确认删除批次')
    dialog.innerHTML = '<h2>删除批次及衍生产物</h2><p data-target></p><p>只删除此批次独占的结果和产物。共享内容、源码、配置及用量审计保留。删除后无法撤销。</p><dl data-summary></dl><p role="status" data-message>正在核对删除范围…</p><div class="run-title-actions"><button type="button" class="secondary-button" data-dismiss>取消</button><button type="button" class="secondary-button" data-preview>重新预览</button><button type="button" class="secondary-button danger-button" data-confirm disabled>确认删除</button></div>'
    dialog.querySelector('[data-target]').textContent = label || '恢复此前已确认的批次删除'
    const message = dialog.querySelector('[data-message]'), confirm = dialog.querySelector('[data-confirm]'), preview = dialog.querySelector('[data-preview]')
    let plan = receipt?.plan, pending = Boolean(receipt), busy = false, completed = false
    const endpoint = `/api/v1/batch-deletions/${kind}/${encodeURIComponent(id || '')}`
    function setBusy(value) { busy = value; confirm.disabled = value || !plan; preview.disabled = value; dialog.querySelector('[data-dismiss]').disabled = value }
    function showPlan() {
      const summary = dialog.querySelector('[data-summary]'); summary.replaceChildren()
      for (const [key, count] of Object.entries(plan.counts)) {
        const term = document.createElement('dt'), value = document.createElement('dd'); term.textContent = kinds[key] || '记录'; value.textContent = String(count); summary.append(term, value)
      }
      const term = document.createElement('dt'), value = document.createElement('dd'); term.textContent = '预计释放文件大小'; value.textContent = `${(plan.reclaimableBytes / 1024 / 1024).toFixed(2)} MiB`; summary.append(term, value)
      preview.hidden = pending; confirm.textContent = pending ? '继续完成删除' : '确认删除'; confirm.disabled = false
      message.textContent = pending ? '已有删除提交尚未完成，将沿原确认范围继续处理。' : '请核对以上范围，再点击“确认删除”。'
    }
    async function load() {
      setBusy(true)
      try { plan = await request(`${endpoint}/preview`, { method: 'POST', body: '{}' }); showPlan() }
      catch (error) { plan = null; message.textContent = error.message || '无法读取删除范围，请稍后重试。' }
      finally { setBusy(false) }
    }
    preview.addEventListener('click', load)
    confirm.addEventListener('click', async () => {
      if (!plan || busy) return; setBusy(true); message.textContent = '正在删除，请稍候…'
      try {
        const result = await request(pending ? '/api/v1/batch-deletions/recover' : `${endpoint}/confirm`, { method: 'POST', body: JSON.stringify(pending ? { planId: plan.planId } : { planId: plan.planId, confirmed: true }) })
        if (result.status === 'DELETED') { completed = true; dialog.close(); return }
        pending = true; plan = result.plan; showPlan(); message.textContent = result.status === 'RECORDS_PENDING' ? '记录删除尚未完成，可按原确认范围重试。' : '记录已处理，部分文件尚未清理，可继续完成删除。'
      } catch (error) { message.textContent = error.message || '请求未完成，请重试。' }
      finally { setBusy(false) }
    })
    dialog.querySelector('[data-dismiss]').addEventListener('click', () => dialog.close())
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault() })
    dialog.addEventListener('close', () => { dialog.remove(); resolve(completed) }, { once: true })
    document.body.append(dialog); dialog.showModal(); if (receipt) showPlan(); else void load()
  })
}
export async function recoverBatchDeletions(request) {
  const { items } = await request('/api/v1/batch-deletions')
  if (!items.length) return false
  let changed = false
  for (const receipt of items) { if (!await openBatchDeletion({ request, receipt })) break; changed = true }
  return changed
}
