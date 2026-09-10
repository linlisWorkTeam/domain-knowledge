/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证固定编译数据库的路径、参数与未支持项边界。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compilationCandidates } from '../../src/infrastructure/source/CompilationDatabase.ts';
const parse = (row: unknown) => compilationCandidates(JSON.stringify([row]), 'build/compile_commands.json', '/repo')[0]!;
test('compilation candidates decode argv or quoted command and preserve separate configurations', () => {
  const row = { directory: '/repo/build', file: '../src/parser.c', arguments: ['/usr/bin/gcc', '-std=c17', '-I', '../include', '-DFEATURE=1', '-c', '../src/parser.c', '-o', 'parser.o'] };
  const candidate = parse(row);
  assert.equal(candidate.sourcePath, 'src/parser.c'); assert.deepEqual(candidate.issues, []);
  assert.deepEqual(candidate.build, { cCompiler: 'gcc', cStandard: 'c17', includeDirectories: ['include'], definitions: ['FEATURE=1'] });
  const command = parse({ directory: '/repo', file: 'x.cpp', command: '"/usr/bin/clang++" -std=c++20 -I. -D FLAG=2 -c x.cpp' });
  assert.equal(command.build.cppCompiler, 'clang++'); assert.equal(command.build.cppStandard, 'c++20'); assert.deepEqual(command.issues, []);
  const preferred = parse({ ...row, command: '$(touch SHOULD_NOT_RUN)' }); assert.deepEqual(preferred, candidate);
  const multiple = compilationCandidates(JSON.stringify([row, { ...row, arguments: ['gcc', '-DFEATURE=2', '-c', '../src/parser.c'] }]), 'build/compile_commands.json', '/repo');
  assert.equal(multiple.length, 2); assert.equal(multiple[1]!.record, 2);
});
test('external includes and unsupported or dynamic flags are visible rather than silently dropped', () => {
  for (const argument of ['-I/etc', '-pthread', '@secret.rsp', '-include', '-std=gnu23']) {
    const candidate = parse({ directory: '/repo', file: 'a.c', arguments: ['gcc', argument, '-c', 'a.c'] });
    assert.ok(candidate.issues.length, argument);
  }
  assert.match(parse({ directory: '/repo', file: '../outside.c', arguments: ['gcc'] }).issues.join(), /仓库外/);
  assert.match(parse({ directory: '/repo', file: 'a.c', command: 'gcc $(touch sentinel) a.c' }).issues.join(), /未支持/);
  assert.ok(compilationCandidates('{', 'compile_commands.json', '/repo')[0]!.issues.length);
  assert.ok(compilationCandidates('{}', 'compile_commands.json', '/repo')[0]!.issues.length);
});
