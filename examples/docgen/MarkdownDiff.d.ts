/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护Markdown差异d相关的项目配置与工程说明。
 */
/** Public API of the CPU example pinned in the runner; no implementation or oracle. */
/** 提供 structuredMarkdownDiff 对应的structuredMarkdown差异操作。 */
export declare function structuredMarkdownDiff(beforeBody: string, afterBody: string): {
  hunks: Array<{
    oldStart: number; oldCount: number; newStart: number; newCount: number;
    lines: Array<{ type: 'CONTEXT' | 'REMOVE' | 'ADD'; oldLine: number | null; newLine: number | null; text: string }>;
  }>;
  changedSections: string[];
  rangeValidation: {
    status: 'PASS'; scope: 'FULL_DOCUMENT'; oldLines: number; newLines: number;
    algorithm: 'LCS' | 'BOUNDED_FALLBACK'; validated: true;
  };
};
