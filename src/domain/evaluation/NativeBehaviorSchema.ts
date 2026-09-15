/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：为TestGen提供原生案例的数据Schema，不开放表达式或源码输入。
 */
import { nativeFunctions, type NativeContract } from './NativeBehaviorSuite.ts';
const identifier = { type: 'string', pattern: '^(?!wb_)[A-Za-z][A-Za-z0-9_]{0,79}$' };
const access = { type: 'object', additionalProperties: false, required: ['variable'], properties: {
  variable: identifier, index: { type: 'integer', minimum: 0, maximum: 255 },
  members: { type: 'array', maxItems: 4, items: identifier },
} };
const argument = { oneOf: Object.entries({
  integer: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]{0,19})$' }, number: { type: 'number' }, boolean: { type: 'boolean' },
  string: { type: 'string', maxLength: 4096 }, read: access, address: access,
}).map(([key, schema]) => ({ type: 'object', additionalProperties: false, required: [key], properties: { [key]: schema } })) };
export function nativeBehaviorSuiteSchema(contract: NativeContract): Record<string, unknown> {
  return { type: 'object', additionalProperties: false, required: ['schemaVersion', 'cases'], properties: {
    schemaVersion: { const: 'native-cases-v1' }, cases: { type: 'array', minItems: 1, maxItems: 64, items: {
      type: 'object', additionalProperties: false, required: ['caseId', 'description', 'sections', 'variables', 'calls', 'observations', 'expected'], properties: {
        caseId: identifier, description: { type: 'string', minLength: 1, maxLength: 2000 },
        sections: { type: 'array', minItems: 1, maxItems: 16, items: { type: 'string', minLength: 1, maxLength: 200 } },
        variables: { type: 'array', maxItems: 16, items: { type: 'object', additionalProperties: false, required: ['name', 'type'], properties: {
          name: identifier, type: { type: 'string', minLength: 1, maxLength: 128 }, arrayLength: { type: 'integer', minimum: 1, maximum: 256 }, initial: argument,
        } } },
        calls: { type: 'array', minItems: 1, maxItems: 16, items: { type: 'object', additionalProperties: false, required: ['function', 'arguments'], properties: {
          function: { enum: [...nativeFunctions(contract).keys()] }, arguments: { type: 'array', maxItems: 16, items: argument }, result: identifier,
        } } },
        observations: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'object', additionalProperties: false, required: ['name', 'kind', 'read'], properties: {
          name: identifier, kind: { enum: ['integer', 'unsigned', 'number', 'boolean', 'string'] }, read: access,
        } } },
        expected: { type: 'object', maxProperties: 32, additionalProperties: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] } },
      },
    } },
  } };
}
