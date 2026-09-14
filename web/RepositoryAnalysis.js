/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供无需场景 JSON 的固定源码分析入口。
 */
import { createProjectHistory } from './ProjectHistory.js'
export function createRepositoryAnalysisPanel({ root, request, escapeHtml: escape, isEditable, onProjectSelected = () => {} }) {
  let directory = ''
  let report = null
  let error = ''
  let busy = false
  let saving = false
  let project = null
  let selected = new Set()
  let customModules = []
  const build = { cCompiler: 'gcc', cppCompiler: 'g++', cStandard: 'c11', cppStandard: 'c++17', includeDirectories: '', definitions: '' }
  const moduleBuilds = new Map(); let editingModule = ''
  const activeBuild = () => editingModule ? moduleBuilds.get(editingModule) ?? build : build
  function selectProject(value) {
      project = value; directory = value.directory; report = null; customModules = value.moduleDefinitions ?? []; selected = new Set(value.modules.map(module => module.moduleId)); editingModule = ''; moduleBuilds.clear()
      for (const [key, value] of Object.entries(project.build)) build[key] = Array.isArray(value) ? value.join('\n') : value
      const directoryField = root.querySelector('[name="repositoryDirectory"]')
      if (directoryField) directoryField.value = directory
      const resultPanel = root.querySelector('[data-repository-result]'); if (resultPanel) resultPanel.innerHTML = '<p>已载入保存的源码与构建输入。需要修改模块或参数时，可重新分析该版本。</p>'
      onProjectSelected(project)
  }
  const history = createProjectHistory({ root, request, escapeHtml: escape, canSelect: () => !busy && !saving, onSelect: selectProject })
  const language = { c: 'C', cpp: 'C++', typescript: 'TypeScript', unsupported: '尚未支持' }
  const reasons = { LANGUAGE_NOT_SUPPORTED: '此语言尚未支持', TYPESCRIPT_MODULE_REGRESSION_ONLY: '保留现有模块回归；此多卡片生成入口尚未支持 TypeScript', SOURCE_FILE_TOO_LARGE: '文件超出默认生成大小', MIXED_LANGUAGE_MODULE: '需要明确不同语言的构建范围' }
  function result() {
    if (!report) return ''
    const fields = activeBuild()
    const directories = [...new Set(report.files.flatMap(file => {
      const parts = file.path.split('/'); parts.pop()
      return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
    }))].sort()
    const candidates = customModules.length ? customModules.map(definition => ({ moduleId: definition.moduleId,
      language: 'c', selectedByDefault: true, reasons: [], sourcePaths: definition.directories })) : report.modules
    return `<p>已冻结 ${escape(report.directorySnapshot?.fileCount ?? report.files.length)} 个项目文件</p><p>构建配置：${escape(report.buildSystems.join('、') || '未发现')}</p>
      <ul>${report.tools.map((tool) => `<li>${escape(tool.name)}：${tool.available ? '可用' : '缺少'}${tool.available ? ` · ${escape(tool.version)}` : ''}</li>`).join('')}</ul>
      ${report.warnings.length ? `<ul>${report.warnings.map((warning) => `<li>${escape(warning)}</li>`).join('')}</ul>` : ''}
      <form data-module-definition-form><h3>自定义模块</h3><label>模块名称<input name="moduleName" maxlength="128" placeholder="留空使用目录名称"></label><label>模块文件夹<select name="moduleDirectory" aria-label="模块文件夹"><option value=".">项目根目录</option>${directories.map(path => `<option value="${escape(path)}">${escape(path)}</option>`).join('')}</select></label><button type="submit" class="secondary-button" ${saving || !isEditable() ? 'disabled' : ''}>添加模块</button>${customModules.length ? '<button type="button" class="secondary-button" data-reset-modules>恢复默认模块</button>' : ''}<p>文件夹下源码归入此模块，保存时检查语言与文件范围。</p></form>
      <h3>模块候选</h3><ul>${candidates.slice(0, 200).map((module) => `<li><label><input type="checkbox" data-project-module value="${escape(module.moduleId)}" ${selected.has(module.moduleId) ? 'checked' : ''} ${!module.selectedByDefault || saving ? 'disabled' : ''}> <b>${escape(module.moduleId)}</b>${customModules.length ? '' : ` · ${escape(language[module.language])}`}</label><small>${escape(module.sourcePaths.join('、'))}${module.reasons.length ? ` · ${escape(module.reasons.map((reason) => reasons[reason] ?? reason).join('、'))}` : ''}</small></li>`).join('')}</ul>
      ${report.modules.length > 200 ? '<p>页面展示前 200 个模块；保存只包含当前页面中勾选的范围。</p>' : ''}
      ${report.buildCandidates?.length ? `<details data-build-candidates><summary>编译数据库候选（${report.buildCandidates.length}）</summary><p>选择一条候选填入下方公共构建参数；保存前请确认适用于当前所选模块。</p><ul>${report.buildCandidates.slice(0, 200).map((candidate, index) => `<li><b>${escape(candidate.sourcePath ?? '未识别源码')}</b> · ${escape(candidate.origin)} #${candidate.record}<pre>${escape(JSON.stringify(candidate.build, null, 2))}</pre>${candidate.issues.length ? `<ul>${candidate.issues.map(issue => `<li>${escape(issue)}</li>`).join('')}</ul>` : ''}<button type="button" data-build-candidate="${index}" ${candidate.issues.length || saving || !isEditable() ? 'disabled' : ''}>应用到构建参数</button></li>`).join('')}</ul>${report.buildCandidates.length > 200 ? '<p>仅展示前 200 条候选。</p>' : ''}</details>` : ''}
      <form data-project-form><h3>构建参数</h3><label>参数范围<select data-build-scope ${saving ? 'disabled' : ''}><option value="">项目默认参数</option>${[...selected].map(id => `<option value="${escape(id)}" ${editingModule === id ? 'selected' : ''}>模块 ${escape(id)}${moduleBuilds.has(id) ? '（独立配置）' : ''}</option>`).join('')}</select></label><p>模块独立配置从当前默认参数复制。保存后生成、重建和评测使用该模块的冻结参数。</p>${editingModule ? '<button type="button" class="secondary-button" data-build-inherit>恢复项目默认参数</button>' : ''}<div class="project-build-fields">
      ${[['cCompiler', 'C 编译器', ['gcc', 'clang']], ['cppCompiler', 'C++ 编译器', ['g++', 'clang++']], ['cStandard', 'C 标准', ['c99', 'c11', 'c17']], ['cppStandard', 'C++ 标准', ['c++11', 'c++14', 'c++17', 'c++20']]].map(([key, label, values]) => `<label>${label}<select name="${key}" ${saving ? 'disabled' : ''}>${values.map((value) => `<option ${fields[key] === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>`).join('')}
      <label>包含目录（每行一个，相对项目目录）<textarea aria-label="包含目录（每行一个，相对项目目录）" name="includeDirectories" ${saving ? 'disabled' : ''}>${escape(fields.includeDirectories)}</textarea></label>
      <label>预处理定义（每行一个）<textarea aria-label="预处理定义（每行一个）" name="definitions" ${saving ? 'disabled' : ''}>${escape(fields.definitions)}</textarea></label></div>
      <button class="secondary-button" type="submit" ${saving || !isEditable() ? 'disabled' : ''}>${saving ? '保存中…' : '保存项目输入'}</button></form>
      <p data-project-summary>${project ? `已保存 ${escape(project.modules.length)} 个模块，输入版本 <code>${escape(project.snapshotId)}</code>。` : '保存会固定所选模块、源码正文和构建参数。'}</p>`
  }
  const errors = { SOURCE_ACCESS_DENIED: '目录不在允许范围内。', SOURCE_DIRECTORY_INVALID: '目录不存在或不可访问。',
    DIRECTORY_CONTAINS_RUNTIME: '请选择代码目录，不能将工作台运行数据目录一并纳入项目。', DIRECTORY_SPECIAL_FILE_UNSUPPORTED: '目录包含设备或管道等特殊文件，无法冻结。', DIRECTORY_SOURCE_CHANGED: '读取期间目录文件发生变化，请重试。', DIRECTORY_SNAPSHOT_TOO_LARGE: '目录超过单文件 8 MiB 或总计 64 MiB 限制，请缩小项目范围。', DIRECTORY_SNAPSHOT_CORRUPT: '冻结目录内容校验失败，请重新读取目录。',
    REPOSITORY_ROOT_REQUIRED: '请选择 Git 仓库的根目录。', REPOSITORY_REVISION_UNAVAILABLE: '无法读取这个源码版本，请检查仓库和版本。',
    WORKBENCH_RESOURCE_INSUFFICIENT: '可用内存或磁盘不足，分析未启动。', PROJECT_MODULES_INVALID: '请至少选择一个支持的模块。', PROJECT_MODULE_DEFINITION_INVALID: '请检查模块名称和文件夹范围，至少选择一个模块。', PROJECT_MODULE_EMPTY: '该文件夹没有可分析的源码。', PROJECT_MODULE_DIRECTORY_NOT_FOUND: '固定源码版本中不存在此文件夹。', PROJECT_MODULE_UNSUPPORTED: '模块含有尚未支持或混合的语言，请缩小文件夹范围。', PROJECT_MODULE_BUILD_INVALID: '模块配置必须属于当前选定模块。', PROJECT_BUILD_INVALID: '请检查构建参数，包含目录应位于仓库内，定义格式为 NAME 或 NAME=value。', REPOSITORY_SOURCE_TOO_LARGE: '所选源码超出输入大小限制，请缩小模块范围。' }
  root.addEventListener('submit', event => {
    if (!event.target.matches('[data-module-definition-form]')) return
    event.preventDefault()
    if (!report || busy || saving || !isEditable()) return
    const data = new FormData(event.target), directory = String(data.get('moduleDirectory'))
    const moduleId = String(data.get('moduleName') || '').trim() || (directory === '.' ? report.directory.split('/').at(-1) : directory.split('/').at(-1))
    if (!/^[\p{L}\p{N}][\p{L}\p{N}_.-]{0,127}$/u.test(moduleId) || customModules.some(module => module.moduleId === moduleId)) {
      root.querySelector('[data-repository-notice]').textContent = '模块名称需要唯一，使用文字、数字、点、下划线或连字符。'; return
    }
    if (!customModules.length) { selected.clear(); moduleBuilds.clear(); editingModule = '' }
    customModules.push({ moduleId, directories: [directory] }); selected.add(moduleId)
    project = null;
    root.querySelector('[data-repository-result]').innerHTML = result()
  })
  root.addEventListener('click', event => {
    if (!event.target.closest('[data-reset-modules]') || !report || busy || saving || !isEditable()) return
    customModules = []; selected = new Set(report.modules.filter(module => module.selectedByDefault).map(module => module.moduleId)); moduleBuilds.clear(); editingModule = ''
    project = null; root.querySelector('[data-repository-result]').innerHTML = result()
  })
  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-project-module]')) {
      if (event.target.checked) selected.add(event.target.value); else { selected.delete(event.target.value); moduleBuilds.delete(event.target.value); if (editingModule === event.target.value) editingModule = '' }
    }
    if (event.target.closest('[data-project-form]') && Object.hasOwn(build, event.target.name)) activeBuild()[event.target.name] = event.target.value
    if (event.target.matches('[data-project-module]') || event.target.closest('[data-project-form]')) {
      project = null; root.querySelector('[data-project-summary]').textContent = '选择或参数已修改，请重新保存项目输入。'
      if (event.target.matches('[data-project-module]')) root.querySelector('[data-repository-result]').innerHTML = result()
    }
  })
  root.addEventListener('change', event => {
    if (!event.target.matches('[data-build-scope]') || busy || saving || !isEditable()) return
    editingModule = event.target.value
    if (editingModule && !selected.has(editingModule)) return
    if (editingModule && !moduleBuilds.has(editingModule)) moduleBuilds.set(editingModule, { ...build })
    project = null;
    root.querySelector('[data-repository-result]').innerHTML = result()
  })
  root.addEventListener('click', event => {
    if (!event.target.closest('[data-build-inherit]') || busy || saving || !isEditable()) return
    moduleBuilds.delete(editingModule); editingModule = ''; project = null;
    root.querySelector('[data-repository-result]').innerHTML = result()
  })
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-build-candidate]')
    if (!button || busy || saving || !isEditable()) return
    const candidate = report?.buildCandidates?.[Number(button.dataset.buildCandidate)]
    if (!candidate || candidate.issues.length) return
    for (const [key, value] of Object.entries(candidate.build)) if (Object.hasOwn(build, key)) activeBuild()[key] = Array.isArray(value) ? value.join('\n') : value
    project = null;
    root.querySelector('[data-repository-result]').innerHTML = result()
  })
  root.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-project-form]')) return
    event.preventDefault()
    if (!report || saving || busy || !isEditable()) return
    saving = true; project = null; error = ''
    const lines = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean)
    const normalize = value => ({ ...value, includeDirectories: lines(value.includeDirectories), definitions: lines(value.definitions) })
    const payload = { directory: report.directory, revision: report.commit, ...(customModules.length ? { moduleDefinitions: customModules.filter(module => selected.has(module.moduleId)) } : { moduleIds: [...selected] }), build: normalize(build), ...(moduleBuilds.size ? { moduleBuilds: Object.fromEntries([...moduleBuilds].filter(([id]) => selected.has(id)).map(([id, value]) => [id, normalize(value)])) } : {}) }
    root.querySelector('[data-repository-result]').innerHTML = result()
    request('/api/v1/projects', { method: 'POST', body: JSON.stringify(payload) })
      .then((value) => { project = value; onProjectSelected(value) })
      .catch((failure) => { error = errors[failure.code] ?? '项目输入保存失败，前序分析仍可查看。' })
      .finally(() => { saving = false; const panel = root.querySelector('[data-repository-panel]'); if (panel) { panel.querySelector('[data-repository-result]').innerHTML = result(); panel.querySelector('[data-repository-notice]').textContent = error } })
  })
  root.addEventListener('input', (event) => {
    if (!event.target.closest('[data-repository-form]')) return
    if (event.target.name === 'repositoryDirectory') directory = event.target.value
  })
  root.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-repository-form]')) return
    event.preventDefault()
    if (!isEditable() || busy || saving) return
    busy = true; error = ''; customModules = []; moduleBuilds.clear(); editingModule = ''; report = null; project = null;
    event.target.querySelector('button').disabled = true
    event.target.querySelector('button').textContent = '分析中…'
    root.querySelector('[data-repository-result]').textContent = '正在冻结目录当前内容…'
    request('/api/v1/repository-analyses', { method: 'POST', body: JSON.stringify({ directory, revision: 'WORKTREE' }) })
      .then((value) => { report = value; selected = new Set(value.modules.slice(0, 200).filter((module) => module.selectedByDefault).map((module) => module.moduleId)) })
      .catch((failure) => { error = errors[failure.code] ?? '目录读取失败，请检查目录和服务器环境。' })
      .finally(() => {
        busy = false
        const panel = root.querySelector('[data-repository-panel]')
        if (panel) { panel.querySelector('[data-repository-result]').innerHTML = result(); panel.querySelector('[data-repository-notice]').textContent = error; panel.querySelector('[data-repository-form] button').disabled = !isEditable(); panel.querySelector('[data-repository-form] button').textContent = '读取目录' }
      })
  })
  return {
    selectProject,
    focus: () => { const element = document.activeElement; return element?.closest('[data-repository-form], [data-project-form]') ? { name: element.name, start: element.selectionStart, end: element.selectionEnd } : null },
    restore: (focus) => { history.refresh(); if (!focus) return; const field = root.querySelector(`[name="${CSS.escape(focus.name)}"]`); field?.focus({ preventScroll: true }); if (typeof focus.start === 'number') field?.setSelectionRange(focus.start, focus.end) },
    html: () => `<section class="repository-panel" data-repository-panel>
      <form data-repository-form>
      <label>本地代码目录<input name="repositoryDirectory" value="${escape(directory)}" placeholder="输入服务器上的代码目录" required></label>
      <button class="primary-button" type="submit" ${busy || saving || !isEditable() ? 'disabled' : ''}>${busy ? '读取中…' : '读取目录'}</button><button class="secondary-button" type="button" data-browse-directory="repositoryDirectory" ${busy || saving || !isEditable() ? 'disabled' : ''}>浏览代码目录</button></form><div id="directory-browser" class="directory-browser"></div>
      <p role="status" data-repository-notice>${escape(error)}</p><div data-repository-result>${result()}</div><section class="repository-history" data-project-history>${history.html()}</section></section>`,
  }
}
