/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义绑定来源修订的不可变外部材料。
 */
import { sha256, type ArtifactRef } from '../../Domain.ts';
export const MATERIAL_CONTRACT = 'external-material-v1';
export interface ExternalMaterial {
  materialId: string; contractVersion: string; sourceId: string; sourceRevision: string;
  locator: string; title: string; applicability: string; rawRef: ArtifactRef; textRef: ArtifactRef; capturedAt: string;
}
export function materialIdentity(input: Pick<ExternalMaterial, 'sourceId' | 'sourceRevision' | 'applicability' | 'textRef'>): string {
  if (!input.sourceId || !/^sha256:[a-f0-9]{64}$/.test(input.sourceRevision) || !input.applicability.trim() || input.applicability.length > 2000) throw new Error('MATERIAL_INPUT_INVALID');
  return `material-${sha256(JSON.stringify([MATERIAL_CONTRACT, input.sourceId, input.sourceRevision, input.applicability, input.textRef.sha256]))}`;
}
