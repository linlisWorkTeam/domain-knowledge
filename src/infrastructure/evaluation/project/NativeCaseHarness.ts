/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将已验证用例数据放入固定C/C++语法骨架，不复制预期值。
 */
import { nativeFunctions, nativeReturnType, assertNativeBehaviorSuite, type NativeContract, type NativeBehaviorCase, type NativeArgument, type NativeAccess } from '../../../domain/services/evaluation/NativeBehaviorSuite.ts';
const access = (value: NativeAccess) => `${value.variable}${value.index === undefined ? '' : `[${value.index}]`}${(value.members ?? []).map((member) => `.${member}`).join('')}`;
const string = (value: string) => `"${[...Buffer.from(value)].map((byte) => `\\${byte.toString(8).padStart(3, '0')}`).join('')}"`;
function argument(value: NativeArgument): string {
  if ('address' in value) return `&(${access(value.address)})`;
  if ('read' in value) return access(value.read);
  if ('string' in value) return string(value.string);
  if ('boolean' in value) return value.boolean ? 'true' : 'false';
  if ('number' in value) { const raw = String(value.number); return /[.e]/i.test(raw) ? raw : `${raw}.0`; }
  if (value.integer === '-9223372036854775808') return '(-9223372036854775807LL-1LL)';
  return `${value.integer}${BigInt(value.integer) > 9223372036854775807n ? 'ULL' : 'LL'}`;
}
export function nativeCaseHarness(test: NativeBehaviorCase, contract: NativeContract): string {
  assertNativeBehaviorSuite({ schemaVersion: 'native-cases-v1', cases: [test] }, contract);
  const functions = nativeFunctions(contract);
  const declarations = test.variables.map((variable) => `${variable.type} ${variable.name}${variable.arrayLength === undefined ? '' : `[${variable.arrayLength}]`} = ${variable.initial ? argument(variable.initial) : '{0}'};`);
  const calls = test.calls.map((call) => `${call.result ? `${nativeReturnType(functions.get(call.function)!, call.arguments.length)} ${call.result} = ` : ''}${call.function}(${call.arguments.map(argument).join(', ')});`);
  const observations = test.observations.map((observation) => {
    const value = access(observation.read);
    switch (observation.kind) {
      case 'integer': return `printf("i:%lld\\n", (long long)(${value}));`;
      case 'unsigned': return `printf("u:%llu\\n", (unsigned long long)(${value}));`;
      case 'number': return `printf("n:%.17g\\n", (double)(${value}));`;
      case 'boolean': return `printf("b:%d\\n", (${value}) ? 1 : 0);`;
      case 'string': return `wb_string((const char *)(${value}));`;
    }
  });
  return `#include <stdio.h>\n#include <stdbool.h>\n#include <stdint.h>\n#include <stddef.h>\n#include "${contract.includePath}"\n
static int wb_bad = 0;
static void wb_string(const char *s) {
  unsigned int n = 0;
  if (!s) { wb_bad = 1; return; }
  fputs("s:", stdout);
  for (; n < 4096 && s[n]; n++) printf("%02x", (unsigned int)(unsigned char)s[n]);
  if (n == 4096 && s[n]) wb_bad = 1;
  putchar('\\n');
}
int main(void) {
${declarations.join('\n')}
${calls.join('\n')}
puts("WB_NATIVE_V1");
${observations.join('\n')}
return wb_bad ? 71 : 0;
}\n`;
}
