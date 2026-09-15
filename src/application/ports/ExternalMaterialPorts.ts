/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义指定来源读取、文本转换与材料持久化边界。
 */
import type { ExternalMaterial } from '../../domain/association/ExternalMaterial.ts';
export interface ExternalMaterialReader {
  readSourceMaterial(sourceId: string): Promise<{ sourceId: string; revision: string; locator: string; title: string; bytes: Uint8Array; mediaType: string }>;
}
export interface ExternalMaterialStore {
  get(id: string): ExternalMaterial | null;
  list(): ExternalMaterial[];
  insert(value: ExternalMaterial): ExternalMaterial;
}
export interface MaterialTextExtractor { extract(bytes: Uint8Array, mediaType: string): string; }
