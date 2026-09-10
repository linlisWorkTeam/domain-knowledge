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
  let saving = false
  let project = null
  let selected = new Set()
  const build = { cCompiler: 'gcc', cppCompiler: 'g++', cStandard: 'c11', cppStandard: 'c++17', includeDirectories: '', definitions: '' }
  const language = { c: 'C', cpp: 'C++', typescript: 'TypeScript', unsupported: '尚未支持' }
  const reasons = { LANGUAGE_NOT_SUPPORTED: '此语言尚未支持', SOURCE_FILE_TOO_LARGE: '文件超出默认生成大小', MIXED_LANGUAGE_MODULE: '需要明确不同语言的构建范围' }
  function result() {
    if (!report) return ''
    return `<p>源码版本 <code>${escape(report.commit)}</code></p><p>构建配置：${escape(report.buildSystems.join('、') || '未发现')}</p>
      <ul>${report.tools.map((tool) => `<li>${escape(tool.name)}：${tool.available ? '可用' : '缺少'}${tool.available ? ` · ${escape(tool.version)}` : ''}</li>`).join('')}</ul>
      ${report.warnings.length ? `<ul>${report.warnings.map((warning) => `<li>${escape(warning)}</li>`).join('')}</ul>` : ''}
      <h3>模块候选</h3><ul>${report.modules.slice(0, 200).map((module) => `<li><label><input type="checkbox" data-project-module value="${escape(module.moduleId)}" ${selected.has(module.moduleId) ? 'checked' : ''} ${!module.selectedByDefault || saving ? 'disabled' : ''}> <b>${escape(module.moduleId)}</b> · ${escape(language[module.language])}</label><small>${escape(module.sourcePaths.join('、'))}${module.reasons.length ? ` · ${escape(module.reasons.map((reason) => reasons[reason] ?? reason).join('、'))}` : ''}</small></li>`).join('')}</ul>
      ${report.modules.length > 200 ? '<p>页面展示前 200 个模块；保存只包含当前页面中勾选的范围。</p>' : ''}
      <form data-project-form><h3>构建参数</h3><div class="project-build-fields">
      ${[['cCompiler', 'C 编译器', ['gcc', 'clang']], ['cppCompiler', 'C++ 编译器', ['g++', 'clang++']], ['cStandard', 'C 标准', ['c99', 'c11', 'c17']], ['cppStandard', 'C++ 标准', ['c++11', 'c++14', 'c++17', 'c++20']]].map(([key, label, values]) => `<label>${label}<select name="${key}" ${saving ? 'disabled' : ''}>${values.map((value) => `<option ${build[key] === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>`).join('')}
      <label>包含目录（每行一个，相对仓库）<textarea name="includeDirectories" ${saving ? 'disabled' : ''}>${escape(build.includeDirectories)}</textarea></label>
      <label>预处理定义（每行一个）<textarea name="definitions" ${saving ? 'disabled' : ''}>${escape(build.definitions)}</textarea></label></div>
      <button class="secondary-button" type="submit" ${saving || !isEditable() ? 'disabled' : ''}>${saving ? '保存中…' : '保存项目输入'}</button></form>
      <p data-project-summary>${project ? `已保存 ${escape(project.modules.length)} 个模块，输入版本 <code>${escape(project.snapshotId)}</code>。` : '保存会固定所选模块、源码正文和构建参数。'}公开接口提取及生成操作尚未开放。</p>`
  }
  const errors = { SOURCE_ACCESS_DENIED: '目录不在允许范围内。', SOURCE_DIRECTORY_INVALID: '目录不存在或不可访问。',
    REPOSITORY_ROOT_REQUIRED: '请选择 Git 仓库的根目录。', REPOSITORY_REVISION_UNAVAILABLE: '无法读取这个源码版本，请检查仓库和版本。',
    WORKBENCH_RESOURCE_INSUFFICIENT: '可用内存或磁盘不足，分析未启动。', PROJECT_MODULES_INVALID: '请至少选择一个支持的模块。', PROJECT_BUILD_INVALID: '请检查构建参数，包含目录应位于仓库内，定义格式为 NAME 或 NAME=value。', REPOSITORY_SOURCE_TOO_LARGE: '所选源码超出输入大小限制，请缩小模块范围。' }
  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-project-module]')) {
      if (event.target.checked) selected.add(event.target.value); else selected.delete(event.target.value)
    }
    if (event.target.closest('[data-project-form]') && Object.hasOwn(build, event.target.name)) build[event.target.name] = event.target.value
    if (event.target.matches('[data-project-module]') || event.target.closest('[data-project-form]')) {
      project = null; root.querySelector('[data-project-summary]').textContent = '选择或参数已修改，请重新保存项目输入。'
    }
  })
  root.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-project-form]')) return
    event.preventDefault()
    if (!report || saving || busy || !isEditable()) return
    saving = true; project = null; error = ''
    const lines = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean)
    const payload = { directory: report.directory, revision: report.commit, moduleIds: [...selected], build: { ...build, includeDirectories: lines(build.includeDirectories), definitions: lines(build.definitions) } }
    root.querySelector('[data-repository-result]').innerHTML = result()
    request('/api/v1/projects', { method: 'POST', body: JSON.stringify(payload) })
      .then((value) => { project = value })
      .catch((failure) => { error = errors[failure.code] ?? '项目输入保存失败，前序分析仍可查看。' })
      .finally(() => { saving = false; const panel = root.querySelector('[data-repository-panel]'); if (panel) { panel.querySelector('[data-repository-result]').innerHTML = result(); panel.querySelector('[role="status"]').textContent = error } })
  })
  root.addEventListener('input', (event) => {
    if (!event.target.closest('[data-repository-form]')) return
    if (event.target.name === 'repositoryDirectory') directory = event.target.value
    if (event.target.name === 'repositoryRevision') revision = event.target.value
  })
  root.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-repository-form]')) return
    event.preventDefault()
    if (!isEditable() || busy || saving) return
    busy = true; error = ''; report = null; project = null
    event.target.querySelector('button').disabled = true
    event.target.querySelector('button').textContent = '分析中…'
    root.querySelector('[data-repository-result]').textContent = '正在读取固定源码版本…'
    request('/api/v1/repository-analyses', { method: 'POST', body: JSON.stringify({ directory, revision }) })
      .then((value) => { report = value; selected = new Set(value.modules.slice(0, 200).filter((module) => module.selectedByDefault).map((module) => module.moduleId)) })
      .catch((failure) => { error = errors[failure.code] ?? '仓库分析失败，请检查目录、版本和服务器环境。' })
      .finally(() => {
        busy = false
        const panel = root.querySelector('[data-repository-panel]')
        if (panel) { panel.querySelector('[data-repository-result]').innerHTML = result(); panel.querySelector('details').open = true; panel.querySelector('[role="status"]').textContent = error; panel.querySelector('button').disabled = !isEditable(); panel.querySelector('button').textContent = '分析仓库' }
      })
  })
  return {
    focus: () => { const element = document.activeElement; return element?.closest('[data-repository-form], [data-project-form]') ? { name: element.name, start: element.selectionStart, end: element.selectionEnd } : null },
    restore: (focus) => { if (!focus) return; const field = root.querySelector(`[name="${CSS.escape(focus.name)}"]`); field?.focus({ preventScroll: true }); if (typeof focus.start === 'number') field?.setSelectionRange(focus.start, focus.end) },
    html: () => `<section class="repository-panel" data-repository-panel><h2>代码仓</h2><form data-repository-form>
      <label>服务器仓库目录<input name="repositoryDirectory" value="${escape(directory)}" placeholder="粘贴 Git 仓库根目录" required></label>
      <label>源码版本<input name="repositoryRevision" value="${escape(revision)}" placeholder="分支、标签或提交" maxlength="256" required></label>
      <button class="primary-button" type="submit" ${busy || saving || !isEditable() ? 'disabled' : ''}>${busy ? '分析中…' : '分析仓库'}</button></form>
      <p role="status">${escape(error)}</p><details ${report || error ? 'open' : ''}><summary>分析结果</summary><div data-repository-result>${result() || '<p>分析后显示固定提交、模块候选和环境检查。</p>'}</div></details></section>`,
  }
}
