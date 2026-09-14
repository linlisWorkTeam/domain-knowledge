/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供无需场景 JSON 的固定源码分析入口。
 */
import { createProjectHistory } from './ProjectHistory.js'
import { createKnowledgeGenerationPanel } from './KnowledgeGeneration.js'
export function createRepositoryAnalysisPanel({ root, request, escapeHtml: escape, isEditable }) {
  const generation = createKnowledgeGenerationPanel({ root, request, escapeHtml: escape, isEditable })
  let directory = ''
  let revision = 'HEAD'
  let report = null
  let error = ''
  let busy = false
  let saving = false
  let project = null
  let selected = new Set()
  const build = { cCompiler: 'gcc', cppCompiler: 'g++', cStandard: 'c11', cppStandard: 'c++17', includeDirectories: '', definitions: '' }
  const moduleBuilds = new Map(); let editingModule = ''
  const activeBuild = () => editingModule ? moduleBuilds.get(editingModule) ?? build : build
  const history = createProjectHistory({ root, request, escapeHtml: escape, canSelect: () => !busy && !saving,
    onSelect(value) {
      project = value; directory = value.directory; revision = value.commit; report = null; selected = new Set(value.modules.map(module => module.moduleId)); editingModule = ''; moduleBuilds.clear()
      for (const [key, value] of Object.entries(project.build)) build[key] = Array.isArray(value) ? value.join('\n') : value
      const directoryField = root.querySelector('[name="repositoryDirectory"]'), revisionField = root.querySelector('[name="repositoryRevision"]')
      if (directoryField) directoryField.value = directory
      if (revisionField) revisionField.value = revision
      const resultPanel = root.querySelector('[data-repository-result]'); if (resultPanel) resultPanel.innerHTML = '<p>已载入保存的源码与构建输入。需要修改模块或参数时，可重新分析该版本。</p>'
      generation.setProject(project); generation.refresh()
    } })
  const language = { c: 'C', cpp: 'C++', typescript: 'TypeScript', unsupported: '尚未支持' }
  const reasons = { LANGUAGE_NOT_SUPPORTED: '此语言尚未支持', TYPESCRIPT_MODULE_REGRESSION_ONLY: '保留现有模块回归；此多卡片生成入口尚未支持 TypeScript', SOURCE_FILE_TOO_LARGE: '文件超出默认生成大小', MIXED_LANGUAGE_MODULE: '需要明确不同语言的构建范围' }
  function result() {
    if (!report) return ''
    const fields = activeBuild()
    return `<p>源码版本 <code>${escape(report.commit)}</code></p><p>构建配置：${escape(report.buildSystems.join('、') || '未发现')}</p>
      <ul>${report.tools.map((tool) => `<li>${escape(tool.name)}：${tool.available ? '可用' : '缺少'}${tool.available ? ` · ${escape(tool.version)}` : ''}</li>`).join('')}</ul>
      ${report.warnings.length ? `<ul>${report.warnings.map((warning) => `<li>${escape(warning)}</li>`).join('')}</ul>` : ''}
      <h3>模块候选</h3><ul>${report.modules.slice(0, 200).map((module) => `<li><label><input type="checkbox" data-project-module value="${escape(module.moduleId)}" ${selected.has(module.moduleId) ? 'checked' : ''} ${!module.selectedByDefault || saving ? 'disabled' : ''}> <b>${escape(module.moduleId)}</b> · ${escape(language[module.language])}</label><small>${escape(module.sourcePaths.join('、'))}${module.reasons.length ? ` · ${escape(module.reasons.map((reason) => reasons[reason] ?? reason).join('、'))}` : ''}</small></li>`).join('')}</ul>
      ${report.modules.length > 200 ? '<p>页面展示前 200 个模块；保存只包含当前页面中勾选的范围。</p>' : ''}
      ${report.buildCandidates?.length ? `<details data-build-candidates><summary>编译数据库候选（${report.buildCandidates.length}）</summary><p>选择一条候选填入下方公共构建参数；保存前请确认适用于当前所选模块。</p><ul>${report.buildCandidates.slice(0, 200).map((candidate, index) => `<li><b>${escape(candidate.sourcePath ?? '未识别源码')}</b> · ${escape(candidate.origin)} #${candidate.record}<pre>${escape(JSON.stringify(candidate.build, null, 2))}</pre>${candidate.issues.length ? `<ul>${candidate.issues.map(issue => `<li>${escape(issue)}</li>`).join('')}</ul>` : ''}<button type="button" data-build-candidate="${index}" ${candidate.issues.length || saving || !isEditable() ? 'disabled' : ''}>应用到构建参数</button></li>`).join('')}</ul>${report.buildCandidates.length > 200 ? '<p>仅展示前 200 条候选。</p>' : ''}</details>` : ''}
      <form data-project-form><h3>构建参数</h3><label>参数范围<select data-build-scope ${saving ? 'disabled' : ''}><option value="">项目默认参数</option>${[...selected].map(id => `<option value="${escape(id)}" ${editingModule === id ? 'selected' : ''}>模块 ${escape(id)}${moduleBuilds.has(id) ? '（独立配置）' : ''}</option>`).join('')}</select></label><p>模块独立配置从当前默认参数复制。保存后生成、重建和评测使用该模块的冻结参数。</p>${editingModule ? '<button type="button" class="secondary-button" data-build-inherit>恢复项目默认参数</button>' : ''}<div class="project-build-fields">
      ${[['cCompiler', 'C 编译器', ['gcc', 'clang']], ['cppCompiler', 'C++ 编译器', ['g++', 'clang++']], ['cStandard', 'C 标准', ['c99', 'c11', 'c17']], ['cppStandard', 'C++ 标准', ['c++11', 'c++14', 'c++17', 'c++20']]].map(([key, label, values]) => `<label>${label}<select name="${key}" ${saving ? 'disabled' : ''}>${values.map((value) => `<option ${fields[key] === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>`).join('')}
      <label>包含目录（每行一个，相对仓库）<textarea aria-label="包含目录（每行一个，相对仓库）" name="includeDirectories" ${saving ? 'disabled' : ''}>${escape(fields.includeDirectories)}</textarea></label>
      <label>预处理定义（每行一个）<textarea aria-label="预处理定义（每行一个）" name="definitions" ${saving ? 'disabled' : ''}>${escape(fields.definitions)}</textarea></label></div>
      <button class="secondary-button" type="submit" ${saving || !isEditable() ? 'disabled' : ''}>${saving ? '保存中…' : '保存项目输入'}</button></form>
      <p data-project-summary>${project ? `已保存 ${escape(project.modules.length)} 个模块，输入版本 <code>${escape(project.snapshotId)}</code>。` : '保存会固定所选模块、源码正文和构建参数。'}</p>`
  }
  const errors = { SOURCE_ACCESS_DENIED: '目录不在允许范围内。', SOURCE_DIRECTORY_INVALID: '目录不存在或不可访问。',
    REPOSITORY_ROOT_REQUIRED: '请选择 Git 仓库的根目录。', REPOSITORY_REVISION_UNAVAILABLE: '无法读取这个源码版本，请检查仓库和版本。',
    WORKBENCH_RESOURCE_INSUFFICIENT: '可用内存或磁盘不足，分析未启动。', PROJECT_MODULES_INVALID: '请至少选择一个支持的模块。', PROJECT_MODULE_BUILD_INVALID: '模块配置必须属于当前选定模块。', PROJECT_BUILD_INVALID: '请检查构建参数，包含目录应位于仓库内，定义格式为 NAME 或 NAME=value。', REPOSITORY_SOURCE_TOO_LARGE: '所选源码超出输入大小限制，请缩小模块范围。' }
  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-project-module]')) {
      if (event.target.checked) selected.add(event.target.value); else { selected.delete(event.target.value); moduleBuilds.delete(event.target.value); if (editingModule === event.target.value) editingModule = '' }
    }
    if (event.target.closest('[data-project-form]') && Object.hasOwn(build, event.target.name)) activeBuild()[event.target.name] = event.target.value
    if (event.target.matches('[data-project-module]') || event.target.closest('[data-project-form]')) {
      project = null; generation.setProject(null); root.querySelector('[data-project-summary]').textContent = '选择或参数已修改，请重新保存项目输入。'
      if (event.target.matches('[data-project-module]')) root.querySelector('[data-repository-result]').innerHTML = result()
    }
  })
  root.addEventListener('change', event => {
    if (!event.target.matches('[data-build-scope]') || busy || saving || !isEditable()) return
    editingModule = event.target.value
    if (editingModule && !selected.has(editingModule)) return
    if (editingModule && !moduleBuilds.has(editingModule)) moduleBuilds.set(editingModule, { ...build })
    project = null; generation.setProject(null)
    root.querySelector('[data-repository-result]').innerHTML = result()
  })
  root.addEventListener('click', event => {
    if (!event.target.closest('[data-build-inherit]') || busy || saving || !isEditable()) return
    moduleBuilds.delete(editingModule); editingModule = ''; project = null; generation.setProject(null)
    root.querySelector('[data-repository-result]').innerHTML = result()
  })
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-build-candidate]')
    if (!button || busy || saving || !isEditable()) return
    const candidate = report?.buildCandidates?.[Number(button.dataset.buildCandidate)]
    if (!candidate || candidate.issues.length) return
    for (const [key, value] of Object.entries(candidate.build)) if (Object.hasOwn(build, key)) activeBuild()[key] = Array.isArray(value) ? value.join('\n') : value
    project = null; generation.setProject(null)
    root.querySelector('[data-repository-result]').innerHTML = result()
  })
  root.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-project-form]')) return
    event.preventDefault()
    if (!report || saving || busy || !isEditable()) return
    saving = true; project = null; generation.setProject(null); error = ''
    const lines = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean)
    const normalize = value => ({ ...value, includeDirectories: lines(value.includeDirectories), definitions: lines(value.definitions) })
    const payload = { directory: report.directory, revision: report.commit, moduleIds: [...selected], build: normalize(build), ...(moduleBuilds.size ? { moduleBuilds: Object.fromEntries([...moduleBuilds].filter(([id]) => selected.has(id)).map(([id, value]) => [id, normalize(value)])) } : {}) }
    root.querySelector('[data-repository-result]').innerHTML = result()
    request('/api/v1/projects', { method: 'POST', body: JSON.stringify(payload) })
      .then((value) => { project = value; generation.setProject(value) })
      .catch((failure) => { error = errors[failure.code] ?? '项目输入保存失败，前序分析仍可查看。' })
      .finally(() => { saving = false; const panel = root.querySelector('[data-repository-panel]'); if (panel) { panel.querySelector('[data-repository-result]').innerHTML = result(); panel.querySelector('[data-repository-notice]').textContent = error } })
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
    busy = true; error = ''; moduleBuilds.clear(); editingModule = ''; report = null; project = null; generation.setProject(null)
    event.target.querySelector('button').disabled = true
    event.target.querySelector('button').textContent = '分析中…'
    root.querySelector('[data-repository-result]').textContent = '正在读取固定源码版本…'
    request('/api/v1/repository-analyses', { method: 'POST', body: JSON.stringify({ directory, revision }) })
      .then((value) => { report = value; selected = new Set(value.modules.slice(0, 200).filter((module) => module.selectedByDefault).map((module) => module.moduleId)) })
      .catch((failure) => { error = errors[failure.code] ?? '仓库分析失败，请检查目录、版本和服务器环境。' })
      .finally(() => {
        busy = false
        const panel = root.querySelector('[data-repository-panel]')
        if (panel) { panel.querySelector('[data-repository-result]').innerHTML = result(); panel.querySelector('details').open = true; panel.querySelector('[data-repository-notice]').textContent = error; panel.querySelector('[data-repository-form] button').disabled = !isEditable(); panel.querySelector('[data-repository-form] button').textContent = '分析仓库' }
      })
  })
  return {
    focus: () => { const element = document.activeElement; return element?.closest('[data-repository-form], [data-project-form], [data-generation-panel]') ? { name: element.name, start: element.selectionStart, end: element.selectionEnd } : null },
    restore: (focus) => { history.refresh(); generation.refresh(); if (!focus) return; const field = root.querySelector(`[name="${CSS.escape(focus.name)}"]`); field?.focus({ preventScroll: true }); if (typeof focus.start === 'number') field?.setSelectionRange(focus.start, focus.end) },
    html: () => `<section class="repository-panel" data-repository-panel>
      <header class="workbench-intro"><h2>从代码仓开始知识任务</h2><p>先固定源码与模块范围，再逐步执行，或一键串联全部阶段。</p></header>
      <ol class="workbench-route" aria-label="知识任务的五个阶段">
        ${[['知识库生成', '可阅读的卡片与来源'], ['知识索引', '摘要、索引与问题检索'], ['知识飞轮', '重建代码、差异与修订'], ['知识评测', '可信用例与失败详情'], ['知识关联', '关联原因与替代卡片']].map(([title, artifact], index) => `<li><span aria-hidden="true">${index + 1}</span><div><strong>${title}</strong><small>${artifact}</small></div></li>`).join('')}
      </ol>
      <div class="repository-input-heading"><h2>代码仓</h2><p>C / C++ 支持完整工作台；TypeScript 保留模块回归，其他语言尚未支持。</p></div><form data-repository-form>
      <label>服务器仓库目录<input name="repositoryDirectory" value="${escape(directory)}" placeholder="粘贴 Git 仓库根目录" required></label>
      <label>源码版本<input name="repositoryRevision" value="${escape(revision)}" placeholder="分支、标签或提交" maxlength="256" required></label>
      <button class="primary-button" type="submit" ${busy || saving || !isEditable() ? 'disabled' : ''}>${busy ? '分析中…' : '分析仓库'}</button></form>
      <p role="status" data-repository-notice>${escape(error)}</p><section class="repository-history" data-project-history>${history.html()}</section><details ${report || error ? 'open' : ''}><summary>分析结果</summary><div data-repository-result>${result() || '<p>分析后显示固定提交、模块候选和环境检查。</p>'}</div></details>${generation.html()}</section>`,
  }
}
