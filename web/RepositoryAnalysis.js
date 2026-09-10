/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供无需场景 JSON 的固定源码分析入口。
 */
export function createRepositoryAnalysisPanel({ root, request, escapeHtml: escape, isEditable }) {
  let directory = ''
  let revision = 'HEAD'
  let report = null
  let error = ''
  let busy = false
  const language = { c: 'C', cpp: 'C++', typescript: 'TypeScript', unsupported: '尚未支持' }
  const reasons = { LANGUAGE_NOT_SUPPORTED: '此语言尚未支持', SOURCE_FILE_TOO_LARGE: '文件超出默认生成大小', MIXED_LANGUAGE_MODULE: '需要明确不同语言的构建范围' }
  function result() {
    if (!report) return ''
    return `<p>源码版本 <code>${escape(report.commit)}</code></p><p>构建配置：${escape(report.buildSystems.join('、') || '未发现')}</p>
      <ul>${report.tools.map((tool) => `<li>${escape(tool.name)}：${tool.available ? '可用' : '缺少'}${tool.available ? ` · ${escape(tool.version)}` : ''}</li>`).join('')}</ul>
      ${report.warnings.length ? `<ul>${report.warnings.map((warning) => `<li>${escape(warning)}</li>`).join('')}</ul>` : ''}
      <h3>模块候选</h3><ul>${report.modules.slice(0, 200).map((module) => `<li><b>${escape(module.moduleId)}</b> · ${escape(language[module.language])}<small>${escape(module.sourcePaths.join('、'))}${module.reasons.length ? ` · ${escape(module.reasons.map((reason) => reasons[reason] ?? reason).join('、'))}` : ''}</small></li>`).join('')}</ul>
      ${report.modules.length > 200 ? '<p>页面展示前 200 个模块候选；完整清单已固定保存。</p>' : ''}<p>源码清单已固定。此入口目前只提供仓库分析，生成操作尚未开放。</p>`
  }
  const errors = { SOURCE_ACCESS_DENIED: '目录不在允许范围内。', SOURCE_DIRECTORY_INVALID: '目录不存在或不可访问。',
    REPOSITORY_ROOT_REQUIRED: '请选择 Git 仓库的根目录。', REPOSITORY_REVISION_UNAVAILABLE: '无法读取这个源码版本，请检查仓库和版本。',
    WORKBENCH_RESOURCE_INSUFFICIENT: '可用内存或磁盘不足，分析未启动。' }
  root.addEventListener('input', (event) => {
    if (!event.target.closest('[data-repository-form]')) return
    if (event.target.name === 'repositoryDirectory') directory = event.target.value
    if (event.target.name === 'repositoryRevision') revision = event.target.value
  })
  root.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-repository-form]')) return
    event.preventDefault()
    if (!isEditable() || busy) return
    busy = true; error = ''; report = null
    event.target.querySelector('button').disabled = true
    event.target.querySelector('button').textContent = '分析中…'
    root.querySelector('[data-repository-result]').textContent = '正在读取固定源码版本…'
    request('/api/v1/repository-analyses', { method: 'POST', body: JSON.stringify({ directory, revision }) })
      .then((value) => { report = value })
      .catch((failure) => { error = errors[failure.code] ?? '仓库分析失败，请检查目录、版本和服务器环境。' })
      .finally(() => {
        busy = false
        const panel = root.querySelector('[data-repository-panel]')
        if (panel) { panel.querySelector('[data-repository-result]').innerHTML = result(); panel.querySelector('details').open = true; panel.querySelector('[role="status"]').textContent = error; panel.querySelector('button').disabled = !isEditable(); panel.querySelector('button').textContent = '分析仓库' }
      })
  })
  return {
    focus: () => { const element = document.activeElement; return element?.closest('[data-repository-form]') ? { name: element.name, start: element.selectionStart, end: element.selectionEnd } : null },
    restore: (focus) => { if (!focus) return; const field = root.querySelector(`[name="${focus.name}"]`); field?.focus({ preventScroll: true }); if (typeof focus.start === 'number') field?.setSelectionRange(focus.start, focus.end) },
    html: () => `<section class="repository-panel" data-repository-panel><h2>代码仓</h2><form data-repository-form>
      <label>服务器仓库目录<input name="repositoryDirectory" value="${escape(directory)}" placeholder="粘贴 Git 仓库根目录" required></label>
      <label>源码版本<input name="repositoryRevision" value="${escape(revision)}" placeholder="分支、标签或提交" maxlength="256" required></label>
      <button class="primary-button" type="submit" ${busy || !isEditable() ? 'disabled' : ''}>${busy ? '分析中…' : '分析仓库'}</button></form>
      <p role="status">${escape(error)}</p><details><summary>分析结果</summary><div data-repository-result>${result() || '<p>分析后显示固定提交、模块候选和环境检查。</p>'}</div></details></section>`,
  }
}
