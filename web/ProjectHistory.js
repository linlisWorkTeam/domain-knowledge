/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：选择已冻结的仓库版本并继续原项目输入。
 */
export function createProjectHistory({ root, request, escapeHtml: escape, onSelect, canSelect }) {
  let items = [], selected = '', loading = false, initialized = false, notice = '', epoch = 0
  const host = () => root.querySelector('[data-project-history]')
  function html() {
    return `<label>已保存的项目<select data-project-history-select ${loading || !canSelect() ? 'disabled' : ''}><option value="">选择已保存输入</option>${items.map(item => `<option value="${escape(item.snapshotId)}" ${item.snapshotId === selected ? 'selected' : ''}>${escape(item.directory)} · ${escape(item.commit.startsWith('directory:') ? '目录快照 ' + item.commit.slice(10, 18) : item.commit.slice(0, 12))} · ${escape(item.modules.length)} 个模块</option>`).join('')}</select></label><button type="button" class="secondary-button" data-project-history-refresh ${loading ? 'disabled' : ''}>刷新已保存输入</button><p role="status">${escape(notice)}</p>`
  }
  function render() { const panel = host(); if (panel) panel.innerHTML = html() }
  async function load() {
    if (loading) return
    loading = true; render()
    try { const result = await request('/api/v1/projects'); items = result.snapshots; initialized = true; notice = items.length ? '' : '尚无保存的项目输入。' }
    catch { notice = '历史输入暂不可读，可稍后刷新。' }
    finally { loading = false; render() }
  }
  root.addEventListener('click', event => { if (event.target.closest('[data-project-history-refresh]')) void load() })
  root.addEventListener('change', async event => {
    if (!event.target.matches('[data-project-history-select]') || loading || !canSelect() || !event.target.value) return
    const id = event.target.value, current = ++epoch; loading = true; notice = ''; render()
    try {
      const project = await request(`/api/v1/projects/${encodeURIComponent(id)}`)
      if (current !== epoch || !canSelect()) return
      selected = id; onSelect(project); notice = '已载入冻结输入。后续任务绑定这个源码与构建版本。'
    } catch { if (current === epoch) notice = '读取失败，原项目输入保留。' }
    finally { if (current === epoch) { loading = false; render() } }
  })
  return { html, refresh() { render(); if (!initialized && host()) void load() } }
}
