/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将知识正文的常用 Markdown 子集转换为安全、可阅读的 HTML；原文另行保留。
 */
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

// 只解释文本标记；不执行原始 HTML，不加载图片，不将模型给出的链接变成可执行导航。
function inline(value) {
  return value.split(/(`[^`\n]+`)/g).map((part) => part.startsWith('`') && part.endsWith('`')
    ? `<code>${escape(part.slice(1, -1))}</code>`
    : escape(part).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')).join('')
}

/** 输出正文及目录；不支持的语法作为文本保留，目录 ID 仅由内部计数产生。 */
export function renderKnowledgeMarkdown(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = [], headings = []
  let paragraph = [], list = [], listKind = '', code = null, fence = ''
  const flushParagraph = () => { if (paragraph.length) blocks.push(`<p>${inline(paragraph.join('\n'))}</p>`); paragraph = [] }
  const flushList = () => { if (list.length) blocks.push(`<${listKind}>${list.map((v) => `<li>${inline(v)}</li>`).join('')}</${listKind}>`); list = []; listKind = '' }
  const flush = () => { flushParagraph(); flushList() }
  const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (code !== null) {
      if (new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(line)) {
        blocks.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`); code = null
      } else code.push(line)
      continue
    }
    const opening = line.match(/^\s*(`{3,}|~{3,})(.*)$/)
    if (opening) { flush(); code = []; fence = opening[1]; continue }
    if (!line.trim()) { flush(); continue }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flush()
      const id = `knowledge-heading-${headings.length}`
      headings.push({ id, text: heading[2], level: heading[1].length })
      const level = Math.min(heading[1].length + 1, 6)
      blocks.push(`<h${level} id="${id}" tabindex="-1">${inline(heading[2])}</h${level}>`)
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[i + 1].trim())) {
      flush()
      const headers = cells(line), rows = []
      i += 2
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(cells(lines[i])); i++ }
      i--
      blocks.push(`<div class="knowledge-table" role="region" aria-label="知识表格" tabindex="0"><table><thead><tr>${headers.map((cell) => `<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, index) => `<td>${inline(row[index] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }
    const item = line.match(/^\s*(?:([-*+])|\d+[.)])\s+(.+)$/)
    if (item) {
      flushParagraph()
      const kind = item[1] ? 'ul' : 'ol'
      if (listKind && kind !== listKind) flushList()
      listKind = kind; list.push(item[2]); continue
    }
    flushList()
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { flushParagraph(); blocks.push('<hr>'); continue }
    if (/^>\s?/.test(line)) { flushParagraph(); blocks.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); continue }
    paragraph.push(line)
  }
  flush()
  if (code !== null) blocks.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`)
  return { html: blocks.join('\n'), headings }
}
