/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：展示有界规范化差异、定位范围和不能证明知识错误的诊断边界。
 */
export function sourceComparisonHtml(report, escape) {
  if (!report) return '<p>此历史任务尚无规范化代码比较。</p>'
  return `<details class="source-comparison"><summary>规范化代码差异 · ${report.available === false ? '未完成' : `定位 ${escape(report.compared)}/${escape(report.requested)} 个公开函数`}</summary>
    <p>只去除注释和空白，保留标识符、常量及预处理分支。相似度 = 1 − 词法单元编辑距离 ÷ 两侧较大词法单元数。代码差异不等于知识错误，行为门禁另行判定。</p>
    ${(report.unresolved ?? []).map((item) => `<p>未解决：${escape(item.symbol ?? '')} · ${escape(item.reason)}</p>`).join('')}
    ${report.requested === 0 ? '<p>没有可比较的公开函数体；类型和布局见接口比较。</p>' : ''}
    ${(report.functions ?? []).map((item) => `<article><h4>${escape(item.symbol)}</h4>${item.status !== 'COMPARED' ? `<p>定义未唯一定位：参考 ${escape(item.referenceMatches)} 处，生成 ${escape(item.generatedMatches)} 处。</p>` : `
      <p>${item.exact ? '规范化代码一致' : item.similarity === null ? '编辑距离超出计算预算，未给出相似度' : `词法相似度 ${(item.similarity * 100).toFixed(1)}% · 编辑距离 ${escape(item.distance)}`}</p>
      <p class="material-identity">参考 ${escape(item.reference.path)}:${escape(item.reference.startLine)}；生成 ${escape(item.generated.path)}:${escape(item.generated.startLine)}</p>
      <p>控制关键词计数差异：${Object.keys(item.reference.structure).filter((key) => item.reference.structure[key] !== item.generated.structure[key]).map((key) => `${escape(key)} ${escape(item.reference.structure[key])} → ${escape(item.generated.structure[key])}`).join('；') || '无'}。此计数不是控制流图。</p>
      ${item.exact ? '' : `<div class="source-diff-columns"><section><h5>参考变更片段</h5><pre class="json-view">${escape(item.referencePreview)}</pre></section><section><h5>生成变更片段</h5><pre class="json-view">${escape(item.generatedPreview)}</pre></section></div>${item.previewTruncated ? '<p>预览只展示前 200 个变更词法单元；完整内容见下方或下载报告。</p>' : ''}`}
      <details><summary>查看完整规范化函数体</summary><div class="source-diff-columns"><pre class="json-view">${escape(item.reference.normalized)}</pre><pre class="json-view">${escape(item.generated.normalized)}</pre></div></details>`}</article>`).join('')}</details>`
}
