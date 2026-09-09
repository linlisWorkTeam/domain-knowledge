/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义可由受信执行器比较的模块行为案例，不允许模型提供测试执行逻辑。
 */
/** 案例只携带 JSON 数据；预期值始终由宿主评测器保管。 */
export type BehaviorValue = null | boolean | number | string | BehaviorValue[] | { [key: string]: BehaviorValue };
/** 单次公开函数调用及可读案例说明。 */
export interface ModuleBehaviorCase {
  caseId: string;
  description: string;
  args: BehaviorValue[];
  expected: BehaviorValue;
}
/** 首版仅支持无外部运行依赖的公开模块函数。 */
export interface ModuleBehaviorSuite {
  schemaVersion: 'module-cases-v1';
  modulePath: string;
  exportName: string;
  cases: ModuleBehaviorCase[];
}
/** 返回模型可填写的数据 Schema；递归 JSON 与总大小由业务校验补充。 */
export const moduleBehaviorSuiteSchema: Record<string, unknown> = {
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'modulePath', 'exportName', 'cases'],
  properties: {
    schemaVersion: { const: 'module-cases-v1' },
    modulePath: { type: 'string', minLength: 1, maxLength: 512 },
    exportName: { type: 'string', pattern: '^[A-Za-z_$][A-Za-z0-9_$]*$', maxLength: 128 },
    cases: { type: 'array', minItems: 1, maxItems: 64, items: {
      type: 'object', additionalProperties: false, required: ['caseId', 'description', 'args', 'expected'],
      properties: {
        caseId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,80}$' },
        description: { type: 'string', minLength: 1, maxLength: 2000 },
        args: { type: 'array', maxItems: 8, items: {} }, expected: {},
      },
    } },
  },
};

/** 在模型 Schema 之外重复验证路径、JSON 复杂度和案例身份，供外部执行边界复用。 */
export function assertModuleBehaviorSuite(value: unknown, allowedPaths?: readonly string[]): asserts value is ModuleBehaviorSuite {
  const fail = (): never => { throw new Error('MODULE_BEHAVIOR_SUITE_INVALID'); };
  const record = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object'
    && !Array.isArray(item) && Object.getPrototypeOf(item) === Object.prototype;
  const exact = (item: Record<string, unknown>, keys: string[]) => Object.keys(item).length === keys.length
    && keys.every((key) => Object.hasOwn(item, key));
  const json = (item: unknown, depth = 0): boolean => {
    if (depth > 16) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item === 'string') return item.length <= 65_536;
    if (Array.isArray(item)) return item.length <= 4096 && item.every((child) => json(child, depth + 1));
    return record(item) && Object.keys(item).length <= 256
      && Object.entries(item).every(([key, child]) => key.length <= 1024 && json(child, depth + 1));
  };
  if (!record(value) || !exact(value, ['schemaVersion', 'modulePath', 'exportName', 'cases'])
    || value.schemaVersion !== 'module-cases-v1' || typeof value.modulePath !== 'string'
    || value.modulePath.length > 512 || !/\.(?:ts|js|mjs)$/.test(value.modulePath)
    || value.modulePath.includes('\\') || value.modulePath.includes('\0')
    || value.modulePath.split('/').some((part) => !part || part === '.' || part === '..')
    || (allowedPaths !== undefined && !allowedPaths.includes(value.modulePath))
    || typeof value.exportName !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/.test(value.exportName)
    || !Array.isArray(value.cases) || value.cases.length < 1 || value.cases.length > 64) return fail();
  const seen = new Set<string>();
  for (const item of value.cases) {
    if (!record(item) || !exact(item, ['caseId', 'description', 'args', 'expected'])
      || typeof item.caseId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(item.caseId) || seen.has(item.caseId)
      || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 2000
      || !Array.isArray(item.args) || item.args.length > 8 || !json(item.args) || !json(item.expected)) return fail();
    seen.add(item.caseId);
  }
  if (JSON.stringify(value).length > 262_144) return fail();
}
