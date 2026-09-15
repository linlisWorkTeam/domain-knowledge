/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：展示接口编译缺项与绑定当前任务的诊断下载。
 */
export function interfaceDiagnosticsHtml(events, taskId, escape) {
  const latest = new Map()
  for (const event of events) if (event.detail?.phase === 'interface-failed') latest.set(event.detail.module, event.detail)
  return [...latest.values()].map(item => `<section><h4>接口编译诊断 · ${escape(item.module ?? '未知模块')}</h4>
    ${(item.issues ?? []).filter(issue => ['MISSING_HEADER', 'MISSING_LIBRARY'].includes(issue.kind)).map(issue => `<p>${issue.kind === 'MISSING_HEADER' ? '缺少头文件' : '缺少链接库'}：<code>${escape(issue.name)}</code></p>`).join('')}
    <p>请检查仓库依赖、包含目录和模块构建参数。参数变化后保存新项目输入；系统不会自动安装依赖。</p>
    ${item.diagnosticRef ? `<button type="button" class="secondary-button" data-download-artifact="/api/v1/stage-tasks/${escape(taskId)}/artifacts/${escape(item.diagnosticRef.sha256)}">下载编译诊断</button>` : ''}</section>`).join('')
}
