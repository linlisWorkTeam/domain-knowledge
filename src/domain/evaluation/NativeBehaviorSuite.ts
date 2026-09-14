/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：校验原生声明式用例、限制调用能力并在宿主判定观察值。
 */
import type { NativeDeclaration } from '../sourceScan/PublicInterface.ts';
export interface NativeContract {
  schemaVersion: 'native-contract-v1'; language: 'c' | 'cpp'; includePath: string;
  entryPaths: string[]; declarations: NativeDeclaration[]; targetFunctions: string[];
}
export type NativeScalar = string | number | boolean;
export interface NativeAccess { variable: string; index?: number; members?: string[] }
export type NativeArgument = { integer: string } | { number: number } | { boolean: boolean } | { string: string } | { read: NativeAccess } | { address: NativeAccess };
export interface NativeBehaviorCase {
  caseId: string; description: string; sections: string[];
  variables: Array<{ name: string; type: string; arrayLength?: number; initial?: NativeArgument }>;
  calls: Array<{ function: string; arguments: NativeArgument[]; result?: string }>;
  observations: Array<{ name: string; kind: 'integer' | 'unsigned' | 'number' | 'boolean' | 'string'; read: NativeAccess }>;
  expected: Record<string, NativeScalar>;
}
export interface NativeBehaviorSuite { schemaVersion: 'native-cases-v1'; cases: NativeBehaviorCase[] }
export const NATIVE_NUMBER_TOLERANCE = 1e-7;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value) && !value.startsWith('wb_');
const qualified = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value: Record<string, unknown>, required: string[], optional: string[] = []) => required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const fail = (): never => { throw new Error('NATIVE_BEHAVIOR_SUITE_INVALID'); };
export function nativeFunctions(contract: NativeContract): Map<string, NativeDeclaration[]> {
  const functions = new Map<string, NativeDeclaration[]>();
  const add = (declaration: NativeDeclaration, name: string) => {
    if (!qualified(name)) throw new Error('NATIVE_CONTRACT_INVALID');
    const entries = functions.get(name) ?? []; entries.push({ ...declaration, name }); functions.set(name, entries);
  };
  for (const declaration of contract.declarations) {
    if (declaration.kind === 'FunctionDecl' || declaration.kind === 'CXXMethodDecl' && declaration.static) add(declaration, declaration.name);
    if (declaration.kind === 'CXXRecordDecl') for (const member of declaration.members ?? []) if (member.kind === 'CXXMethodDecl' && member.static) add(member, `${declaration.name}::${member.name}`);
  }
  return functions;
}
export function nativeReturnType(declarations: NativeDeclaration[], arity: number): string {
  const types = new Set(declarations.filter((entry) => entry.parameters?.length === arity).map((entry) => /^(.+?)\s*\(/.exec(entry.type ?? '')?.[1]?.trim()));
  if (types.size !== 1 || types.has(undefined)) throw new Error('NATIVE_CALL_SIGNATURE_UNSUPPORTED');
  const type = [...types][0]!;
  if (!/^[A-Za-z_][\w :]*(?:\s*\*)*$/.test(type)) throw new Error('NATIVE_CALL_SIGNATURE_UNSUPPORTED');
  return type;
}
export function assertNativeContract(contract: NativeContract): void {
  const path = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_./-]{1,512}$/.test(value)
    && value.split('/').every((part) => part && part !== '.' && part !== '..' && part !== '.git');
  if (!contract || contract.schemaVersion !== 'native-contract-v1' || !['c', 'cpp'].includes(contract.language)
    || !path(contract.includePath) || !Array.isArray(contract.entryPaths) || contract.entryPaths.length > 64 || !contract.entryPaths.every(path)
    || !Array.isArray(contract.declarations) || !Array.isArray(contract.targetFunctions) || !contract.targetFunctions.length
    || !contract.targetFunctions.every((name) => nativeFunctions(contract).has(name))) throw new Error('NATIVE_CONTRACT_INVALID');
}
export function assertNativeBehaviorSuite(value: unknown, contract: NativeContract): asserts value is NativeBehaviorSuite {
  assertNativeContract(contract);
  if (!record(value) || !keys(value, ['schemaVersion', 'cases']) || value.schemaVersion !== 'native-cases-v1'
    || !Array.isArray(value.cases) || !value.cases.length || value.cases.length > 64 || JSON.stringify(value).length > 262144) return fail();
  const types = new Set(['bool', 'char', 'int', 'unsigned', 'unsigned int', 'long', 'unsigned long', 'long long', 'unsigned long long', 'float', 'double', 'int64_t', 'uint64_t', 'size_t']);
  for (const declaration of contract.declarations) {
    if (['TypedefDecl', 'TypeAliasDecl', 'CXXRecordDecl'].includes(declaration.kind) && qualified(declaration.name)) types.add(declaration.name);
    if (['RecordDecl', 'EnumDecl'].includes(declaration.kind) && qualified(declaration.name)) types.add(`${declaration.kind === 'RecordDecl' ? 'struct' : 'enum'} ${declaration.name}`);
  }
  const functions = nativeFunctions(contract); const ids = new Set<string>();
  for (const raw of value.cases) {
    if (!record(raw) || !keys(raw, ['caseId', 'description', 'sections', 'variables', 'calls', 'observations', 'expected'])
      || !identifier(raw.caseId) || ids.has(raw.caseId) || typeof raw.description !== 'string' || !raw.description.trim() || raw.description.length > 2000
      || !Array.isArray(raw.sections) || !raw.sections.length || raw.sections.length > 16 || raw.sections.some((section) => typeof section !== 'string' || !section.trim() || section.length > 200)
      || !Array.isArray(raw.variables) || raw.variables.length > 16 || !Array.isArray(raw.calls) || !raw.calls.length || raw.calls.length > 16
      || !Array.isArray(raw.observations) || !raw.observations.length || raw.observations.length > 32 || !record(raw.expected)) return fail();
    ids.add(raw.caseId);
    const variables = new Map<string, number | undefined>(); const touched = new Set<string>(); const affected = new Set<string>();
    const access = (input: unknown): NativeAccess => {
      if (!record(input) || !keys(input, ['variable'], ['index', 'members']) || !identifier(input.variable) || !variables.has(input.variable)
        || (input.index !== undefined && (!Number.isSafeInteger(input.index) || Number(input.index) < 0 || Number(input.index) >= (variables.get(input.variable) ?? 0)))
        || (input.members !== undefined && (!Array.isArray(input.members) || input.members.length > 4 || !input.members.every(identifier)))) return fail();
      return input as unknown as NativeAccess;
    };
    const argument = (input: unknown, references: boolean): void => {
      if (!record(input) || Object.keys(input).length !== 1) return fail();
      if (Object.hasOwn(input, 'integer')) {
        if (typeof input.integer !== 'string' || !/^-?(?:0|[1-9][0-9]{0,19})$/.test(input.integer) || BigInt(input.integer) < -9223372036854775808n || BigInt(input.integer) > 18446744073709551615n) return fail();
      } else if (Object.hasOwn(input, 'number')) { if (typeof input.number !== 'number' || !Number.isFinite(input.number)) return fail(); }
      else if (Object.hasOwn(input, 'boolean')) { if (typeof input.boolean !== 'boolean') return fail(); }
      else if (Object.hasOwn(input, 'string')) { if (typeof input.string !== 'string' || input.string.length > 4096) return fail(); }
      else if (references && (Object.hasOwn(input, 'read') || Object.hasOwn(input, 'address'))) { touched.add(access(input.read ?? input.address).variable); }
      else return fail();
    };
    for (const variable of raw.variables) {
      if (!record(variable) || !keys(variable, ['name', 'type'], ['arrayLength', 'initial']) || !identifier(variable.name) || variables.has(variable.name)
        || typeof variable.type !== 'string' || !types.has(variable.type)
        || (variable.arrayLength !== undefined && (!Number.isSafeInteger(variable.arrayLength) || Number(variable.arrayLength) < 1 || Number(variable.arrayLength) > 256))
        || (variable.arrayLength !== undefined && variable.initial !== undefined)) return fail();
      if (variable.initial !== undefined) argument(variable.initial, false);
      variables.set(variable.name, variable.arrayLength as number | undefined);
    }
    let targetCalled = false;
    for (const call of raw.calls) {
      if (!record(call) || !keys(call, ['function', 'arguments'], ['result']) || typeof call.function !== 'string' || !functions.has(call.function)
        || !Array.isArray(call.arguments) || call.arguments.length > 16) return fail();
      touched.clear(); call.arguments.forEach((item) => argument(item, true));
      const dependent = contract.targetFunctions.includes(call.function) || [...touched].some((name) => affected.has(name));
      if (dependent) for (const item of call.arguments as NativeArgument[]) {
        if ('address' in item) affected.add(item.address.variable);
        if ('read' in item && variables.get(item.read.variable) !== undefined) affected.add(item.read.variable);
      }
      const resultType = nativeReturnType(functions.get(call.function)!, call.arguments.length);
      if (call.result !== undefined) {
        if (!identifier(call.result) || variables.has(call.result) || resultType === 'void') return fail();
        variables.set(call.result, undefined); if (dependent) affected.add(call.result);
      }
      targetCalled ||= contract.targetFunctions.includes(call.function);
    }
    if (!targetCalled) return fail();
    const observed = new Set<string>();
    for (const observation of raw.observations) {
      if (!record(observation) || !keys(observation, ['name', 'kind', 'read']) || !identifier(observation.name) || observed.has(observation.name)
        || !['integer', 'unsigned', 'number', 'boolean', 'string'].includes(String(observation.kind))) return fail();
      if (!affected.has(access(observation.read).variable)) return fail();
      observed.add(observation.name);
      const expected = raw.expected[observation.name];
      if (observation.kind === 'integer' || observation.kind === 'unsigned') {
        if (typeof expected !== 'string' || !/^-?(?:0|[1-9][0-9]{0,19})$/.test(expected)) return fail();
        const n = BigInt(expected); if (n < (observation.kind === 'unsigned' ? 0n : -9223372036854775808n) || n > (observation.kind === 'unsigned' ? 18446744073709551615n : 9223372036854775807n)) return fail();
      } else if (observation.kind === 'number') { if (typeof expected !== 'number' || !Number.isFinite(expected)) return fail(); }
      else if (typeof expected !== observation.kind || typeof expected === 'string' && expected.length > 4096) return fail();
    }
    if (Object.keys(raw.expected).length !== observed.size) return fail();
  }
}
export function compareNativeObservations(test: NativeBehaviorCase, actual: Record<string, NativeScalar>): string[] {
  return test.observations.filter((observation) => {
    const expected = test.expected[observation.name]; const value = actual[observation.name];
    return observation.kind === 'number' ? typeof value !== 'number' || !Number.isFinite(value)
      || Math.abs(value - Number(expected)) > NATIVE_NUMBER_TOLERANCE * Math.max(1, Math.abs(Number(expected))) : value !== expected;
  }).map((observation) => observation.name);
}
