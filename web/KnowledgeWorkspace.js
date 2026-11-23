/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供按模块浏览、原位阅读和卡片版本切换的知识工作台。
 */

/** 卡片接口返回的是模块标识，不把它伪装成仓库文件路径或目录快照。 */
export function groupKnowledgeCards(items) {
  const modules = new Map()
  for (const item of items) {
    const moduleId = item.moduleId || '未分组'
    if (!modules.has(moduleId)) modules.set(moduleId, [])
    modules.get(moduleId).push(item)
  }
  return [...modules].map(([moduleId, cards]) => ({ moduleId, cards }))
}

/** 历史选项只来自当前卡片；不将血缘关联卡片冒充该卡片的历史版本。 */
export function knowledgeVersionOptions(item, history = []) {
  return [item, ...history].filter((entry, index, all) => entry?.versionId
    && all.findIndex((candidate) => candidate?.versionId === entry.versionId) === index)
}

export function createKnowledgeWorkspace({ root, request, escapeHtml: escape, renderMarkdown, displayLabel, formatDate, onDetails }) {
  let items = [], selected = null, generation = 0, searchGeneration = 0, focused = false
  const host = () => root.querySelector('[data-knowledge-workspace]')
  const reader = () => host()?.querySelector('[data-workspace-reader]')
  const status = (value) => escape(displayLabel(value ?? 'UNKNOWN'))

  function catalogHtml() {
    if (!items.length) return '<div class="workspace-empty"><strong>没有匹配的知识</strong><p>尝试其他关键词或状态，也可以先生成知识。</p></div>'
    return groupKnowledgeCards(items).map(({ moduleId, cards }) => `<details class="workspace-folder" open><summary><span aria-hidden="true">⌄</span>${escape(moduleId)}<small>${cards.length}</small></summary>${cards.map((card) => `<button type="button" class="workspace-document" data-workspace-version="${escape(card.versionId)}" aria-current="${selected === card.versionId ? 'page' : 'false'}"><span aria-hidden="true">▤</span><span>${escape(card.title || card.moduleId)}</span><small>${status(card.status)}</small></button>`).join('')}</details>`).join('')
  }

  function syncSelection() {
    for (const row of host()?.querySelectorAll('[data-workspace-version]') ?? []) row.setAttribute('aria-current', row.dataset.workspaceVersion === selected ? 'page' : 'false')
  }

  async function select(versionId, { focus = true } = {}) {
    const currentHost = host(), target = reader(), ticket = ++generation
    if (!target) return
    selected = versionId
    syncSelection()
    if (focus) currentHost.classList.add('mobile-reading')
    target.setAttribute('aria-busy', 'true')
    target.innerHTML = '<div class="workspace-empty" role="status">正在读取知识正文…</div>'
    try {
      const item = await request(`/api/v1/knowledge/${encodeURIComponent(versionId)}`)
      if (ticket !== generation || host() !== currentHost) return
      const result = await request(`/api/v1/cards?versionId=${encodeURIComponent(versionId)}`).catch(() => null)
      if (ticket !== generation || host() !== currentHost) return
      const cards = Array.isArray(result) ? result : result?.items ?? result?.cards ?? []
      const versions = knowledgeVersionOptions(item, cards[0]?.history ?? [])
      const rendered = renderMarkdown(item.body)
      rendered.html = rendered.html.replaceAll('knowledge-heading-', 'workspace-heading-')
      rendered.headings = rendered.headings.map((heading) => ({ ...heading, id: heading.id.replace('knowledge-heading-', 'workspace-heading-') }))
      target.innerHTML = `<header class="workspace-reader-header"><button type="button" class="secondary-button workspace-mobile-back" data-workspace-back>返回目录</button><span>${escape(item.moduleId)} / ${escape(item.title || '知识正文')}</span><button type="button" class="text-button" data-workspace-details="${escape(item.versionId)}">版本与证据</button><button type="button" class="secondary-button" data-workspace-focus aria-pressed="${focused}">${focused ? '退出专注' : '专注阅读'}</button></header>
        <div class="workspace-reader-scroll"><article class="workspace-article"><p class="workspace-kicker">${status(item.status)} · ${escape(item.moduleId)}</p><h2 tabindex="-1">${escape(item.title || item.moduleId)}</h2><p class="workspace-lead">${escape(item.description || '')}</p>
        <div class="workspace-metadata"><label>卡片版本 <select data-workspace-history aria-label="选择文档历史版本">${versions.map((version) => `<option value="${escape(version.versionId)}" ${version.versionId === item.versionId ? 'selected' : ''}>${escape(version.versionId)}${version.status ? ` · ${status(version.status)}` : ''}</option>`).join('')}</select></label><span>${escape(formatDate(item.createdAt))}</span><span>质量 ${escape(item.qualityScore ?? '—')}</span></div>
        ${rendered.headings.length ? `<details class="reader-toc"><summary>文章目录 · ${rendered.headings.length} 节</summary><nav aria-label="文章目录">${rendered.headings.map((heading) => `<a href="#${heading.id}">${escape(heading.text)}</a>`).join('')}</nav></details>` : ''}
        <div class="knowledge-body">${rendered.html || '<p>暂无正文</p>'}</div><details class="reader-source"><summary>查看 Markdown 原文</summary><pre>${escape(item.body ?? '')}</pre></details></article>
        <footer class="workspace-document-footer">${escape(item.provenance?.length ?? 0)} 条来源记录 · 正文与历史来自知识库服务</footer></div>`
      if (focus) target.querySelector('h2')?.focus({ preventScroll: true })
    } catch {
      if (ticket !== generation || host() !== currentHost) return
      target.innerHTML = '<div class="workspace-empty" role="alert"><strong>正文读取失败</strong><p>请重新选择文档，或稍后重试。</p><button type="button" class="secondary-button" data-workspace-back>返回目录</button></div>'
    } finally {
      if (ticket === generation && host() === currentHost) target.removeAttribute('aria-busy')
    }
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-workspace-version], [data-workspace-details], [data-workspace-focus], [data-workspace-back], [data-workspace-collapse]')
    if (!button || !host()?.contains(button)) return
    if (button.hasAttribute('data-workspace-version')) void select(button.dataset.workspaceVersion)
    if (button.hasAttribute('data-workspace-details')) onDetails(button.dataset.workspaceDetails, button)
    if (button.hasAttribute('data-workspace-focus')) {
      focused = !focused; host().classList.toggle('focus-reading', focused)
      button.textContent = focused ? '退出专注' : '专注阅读'; button.setAttribute('aria-pressed', String(focused))
    }
    if (button.hasAttribute('data-workspace-back')) {
      focused = false; host().classList.remove('mobile-reading', 'focus-reading')
      host().querySelector('[data-workspace-version][aria-current="page"]')?.focus()
    }
    if (button.hasAttribute('data-workspace-collapse')) {
      const folders = [...host().querySelectorAll('.workspace-folder')]
      const open = !folders.some((folder) => folder.open)
      folders.forEach((folder) => { folder.open = open })
      button.textContent = open ? '折叠' : '展开'
    }
  })
  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-workspace-history]') && host()?.contains(event.target)) void select(event.target.value)
  })

  return {
    html({ query = '', filter = '' } = {}) {
      ++generation; ++searchGeneration; selected = null; focused = false
      return `<section class="knowledge-workspace" data-knowledge-workspace aria-label="知识工作台"><div class="workspace-version-toolbar"><div><span class="workspace-version-label">浏览范围</span><strong>当前卡片</strong><span class="workspace-scope">按卡片查看历史版本</span></div><span><b id="knowledge-count">0</b> 份文档</span></div>
      <div class="workspace-columns"><aside class="workspace-catalog" aria-label="文档导航"><label class="workspace-search"><span aria-hidden="true">⌕</span><input id="knowledge-search" type="search" value="${escape(query)}" placeholder="搜索名称、用途或关键词…" aria-label="搜索知识"></label><select id="knowledge-status" aria-label="知识状态"><option value="">全部状态</option>${['VERIFIED', 'CANDIDATE', 'LOW_CONFIDENCE', 'SUPERSEDED'].map((value) => `<option value="${value}" ${filter === value ? 'selected' : ''}>${status(value)}</option>`).join('')}</select><div class="workspace-catalog-heading"><span>文档目录</span><button type="button" class="text-button" data-workspace-collapse>折叠</button></div><div id="knowledge-list" class="workspace-catalog-list"></div><footer class="workspace-catalog-footer">按模块分组 · 仅展示已登记卡片</footer></aside><section class="workspace-reader" data-workspace-reader aria-label="文档阅读器"><div class="workspace-empty">选择文档开始阅读</div></section></div></section>`
    },
    beginSearch() { return ++searchGeneration },
    isCurrentSearch(ticket) { return ticket === searchGeneration && Boolean(host()) },
    setItems(nextItems) {
      items = nextItems
      if (!host()) return
      host().querySelector('#knowledge-list').innerHTML = catalogHtml()
      host().querySelector('#knowledge-count').textContent = String(items.length)
      if (selected && items.some((item) => item.versionId === selected)) { syncSelection(); return }
      ++generation; selected = null
      if (items.length) void select(items[0].versionId, { focus: false })
      else {
        reader().innerHTML = '<div class="workspace-empty"><strong>没有匹配的知识</strong><p>调整左侧搜索或状态筛选。</p></div>'
        host().classList.remove('mobile-reading')
      }
    },
  }
}
