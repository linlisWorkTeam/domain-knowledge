/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：按规范化公开声明比较接口，不把接口匹配当作行为通过。
 */
import type { NativeDeclaration } from '../sourceScan/PublicInterface.ts';
import { canonicalJson } from '../workbench/StageTask.ts';
function signature(declaration: NativeDeclaration): unknown {
  return { kind: declaration.kind, name: declaration.name, type: declaration.type?.replace(/\s+/g, ' ').trim() ?? null,
    static: declaration.static ?? false, parameters: declaration.parameters?.map((parameter) => parameter.type.replace(/\s+/g, ' ').trim()) ?? [],
    fields: declaration.fields ?? [], values: declaration.values ?? [], members: declaration.members?.map(signature) ?? [] };
}
export function compareNativeInterfaces(reference: NativeDeclaration[], generated: NativeDeclaration[]) {
  const expected = [...new Set(reference.map((item) => canonicalJson(signature(item))))];
  const actual = new Set(generated.map((item) => canonicalJson(signature(item))));
  const missing = reference.filter((item) => !actual.has(canonicalJson(signature(item))));
  const matched = expected.filter((item) => actual.has(item)).length;
  return { schemaVersion: 'native-interface-comparison-v1', method: 'normalized-public-declarations-v1',
    expected: expected.length, matched, ratio: expected.length ? matched / expected.length : 0,
    compatible: expected.length > 0 && matched === expected.length, missing, behaviorVerified: false };
}
