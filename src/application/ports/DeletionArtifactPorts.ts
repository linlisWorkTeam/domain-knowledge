/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义删除预览的受限只读工件访问，不把读取错误当作文件不存在。
 */
export interface DeletionArtifactReader {
  /** 仅普通文件确实不存在时返回 null；拒绝链接、超限、权限或内容损坏。 */
  read(artifactId: string, maxBytes: number): Promise<Uint8Array | null>;
}
