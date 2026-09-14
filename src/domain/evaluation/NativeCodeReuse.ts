/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：仅允许诊断契约变化时复用原生重建代码，所有 Code 输入保持一致。
 */
import { canonicalJson, type StageInput } from '../workbench/StageTask.ts';
import { SOURCE_COMPARISON_CONTRACT } from './NativeSourceComparison.ts';
export function nativeCodeReuseKey(input: StageInput): string | null {
  if (input.stage !== 'FLYWHEEL' || !input.parameters.snapshotId || !input.parameters.selectionDigest
    || !input.parameters.configurationRef || !input.parameters.fingerprints
    || (input.parameters.comparisonContract !== undefined && input.parameters.comparisonContract !== SOURCE_COMPARISON_CONTRACT)) return null;
  const { comparisonContract: _diagnostics, ...parameters } = input.parameters;
  return canonicalJson({ ...input, parameters });
}
