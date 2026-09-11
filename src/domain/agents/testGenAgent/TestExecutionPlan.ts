/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证项目原生构建计划包含测试入口及匹配的可执行文件。
 */
import type { Output } from './TestGenAgentContract.ts';

interface Command { tool: string; purpose: string; args: string[]; cwd?: string }
export interface NativeTestBinding { compileIndex: number; runIndices: number[]; testPaths: string[] }

/** 只接受可审计的原生编译/链接及执行绑定；不猜测或替换项目参数。 */
export function nativeTestBindings(commands: readonly Command[], suite: Output): NativeTestBinding[] {
  const entries = [...new Set(suite.cases.map(item => item.testPath))];
  const fail = (reason: string): never => { throw new Error(`TEST_BUILD_CONFIGURATION_INVALID: ${reason}`); };
  const normalized = (path: string) => path.replace(/^\.\//, '');
  const bindings: NativeTestBinding[] = [];
  for (let index = 0; index < commands.length; index++) {
    const command = commands[index]!;
    if (!['gcc', 'g++'].includes(command.tool)) continue;
    const relative = (path: string) => normalized(command.cwd ? `${command.cwd}/${path}` : path);
    const paths = entries.filter(entry => command.args.some(arg => relative(arg) === entry));
    if (!paths.length) continue;
    if (command.args.some(arg => ['-c', '-S', '-E', '-x'].includes(arg) || arg.startsWith('@')))
      fail('unsupported compile mode or opaque response file');
    const outputs = command.args.flatMap((arg, i) => arg === '-o' ? [command.args[i + 1] ?? ''] : []);
    if (outputs.length !== 1 || !outputs[0] || outputs[0].startsWith('-')) fail('one explicit -o output is required');
    const executable = relative(outputs[0]!);
    const runIndices = commands.flatMap((run, i) => i > index && run.tool === 'binary' && run.purpose === 'test'
      && normalized(run.args[0] ?? '') === executable ? [i] : []);
    if (!runIndices.length) fail(`no matching binary execution for ${executable}`);
    bindings.push({ compileIndex: index, runIndices, testPaths: paths });
  }
  if (!entries.length || entries.some(entry => bindings.filter(binding => binding.testPaths.includes(entry)).length !== 1))
    fail('each generated test translation unit must belong to exactly one native build');
  if (new Set(bindings.flatMap(binding => binding.runIndices)).size !== bindings.flatMap(binding => binding.runIndices).length)
    fail('binary output is shared by multiple builds');
  return bindings;
}
