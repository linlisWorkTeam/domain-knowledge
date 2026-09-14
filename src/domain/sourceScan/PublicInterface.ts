/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义不含实现正文的公开声明事实。
 */
export interface NativeDeclaration {
  kind: string; name: string; type?: string; static?: boolean;
  parameters?: Array<{ name: string; type: string }>;
  fields?: Array<{ name: string; type: string }>;
  values?: Array<{ name: string; value: string }>;
  members?: NativeDeclaration[];
}
