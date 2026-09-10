/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：用真实C/C++编译器验证接口材料隔离、资源上限与进程清理。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { NativeToolchain } from '../../src/infrastructure/evaluation/project/NativeToolchain.ts';
import { buildConstraints } from '../../src/domain/services/workbench/WorkbenchProject.ts';
import { captureIsolated } from '../../src/infrastructure/runtime/IsolatedCommand.ts';

const native = new NativeToolchain();
const build = buildConstraints();
const groups = () => readdirSync('/sys/fs/cgroup').filter((name) => name.startsWith('knowledge-workbench-'));

test('C and C++ compile and run under isolation; failed builds never execute', async () => {
  for (const language of ['c', 'cpp'] as const) {
    const path = `main.${language === 'c' ? 'c' : 'cpp'}`;
    const result = await native.compileAndRun({ language, build, files: [{ path, content: '#include <stdio.h>\nint main(void) { puts("native-ok"); return 0; }' }], entryPaths: [path] });
    assert.equal(result.build.exitCode, 0, result.build.stderr); assert.equal(result.execution?.stdout, 'native-ok\n');
    assert.equal(result.execution?.exitCode, 0);
  }
  const rejected = await native.compileAndRun({ language: 'c', build, files: [{ path: 'bad.c', content: '#include "missing_dependency.h"\nint main(void){return 0;}' }], entryPaths: ['bad.c'] });
  assert.notEqual(rejected.build.exitCode, 0); assert.equal(rejected.execution, null);
  assert.match(rejected.build.stderr, /missing_dependency/);
  await assert.rejects(native.publicInterface({ language: 'c', build, files: [{ path: 'api.h', content: '#include "missing_dependency.h"' }], entryPath: 'api.h', symbols: ['parse'] }), (error: unknown) => {
    assert.ok(error instanceof Error); assert.equal(error.message, 'NATIVE_INTERFACE_COMPILE_FAILED');
    assert.match(String((error.cause as { stderr: string }).stderr), /missing_dependency/); return true;
  });
});

test('Clang projection contains public layouts and signatures but excludes implementation and private members', async () => {
  const declarations = await native.publicInterface({ language: 'c', build, entryPath: 'api.h', symbols: ['Result', 'parse', 'Error'], files: [{ path: 'api.h',
    content: 'typedef struct { int value; } Result; enum Error { BAD=-2, GOOD=4, NEXT }; int parse(Result *result); int parse(Result *result) { const char *s="BODY_SECRET"; return result->value; }' }] });
  assert.doesNotMatch(JSON.stringify(declarations), /BODY_SECRET|CompoundStmt|ReturnStmt|offset|range/);
  assert.equal(declarations.declarations.filter((item) => item.name === 'parse').length, 1);
  assert.deepEqual(declarations.declarations.find((item) => item.name === 'Error')?.values, [{ name: 'BAD', value: '-2' }, { name: 'GOOD', value: '4' }, { name: 'NEXT', value: '5' }]);
  assert.deepEqual(declarations.declarations.find((item) => item.name === 'Result')?.members?.[0]?.fields, [{ name: 'value', type: 'int' }]);
  const cpp = await native.publicInterface({ language: 'cpp', build, entryPath: 'api.h', symbols: ['Convert'], astFilter: 'Convert', files: [{ path: 'api.h', content: 'class Convert { private: static int secret; static int hidden(){return 999;} public: static int ToInt(const char *s){return 123;} };' }] });
  assert.doesNotMatch(JSON.stringify(cpp), /secret|hidden|999|123|CompoundStmt/);
  assert.equal(cpp.declarations[0]?.members?.[0]?.name, 'ToInt'); assert.equal(cpp.declarations[0]?.members?.[0]?.static, true);
});

test('native process limits bound child creation and cleanup leaves no new cgroup', async () => {
  const before = new Set(groups());
  const code = '#include <unistd.h>\n#include <sys/wait.h>\n#include <signal.h>\n#include <stdio.h>\nint main(void){pid_t children[64]; int n=0; for(;n<64;n++){pid_t p=fork(); if(p<0) break; if(p==0){for(;;) pause();} children[n]=p;} for(int i=0;i<n;i++)kill(children[i],SIGKILL); while(wait(0)>0){} printf("%d",n); return n<64?0:2;}';
  const result = await native.compileAndRun({ language: 'c', build, files: [{ path: 'main.c', content: code }], entryPaths: ['main.c'] });
  assert.equal(result.build.exitCode, 0, result.build.stderr); assert.equal(result.execution?.exitCode, 0, result.execution?.stderr);
  const count = Number(result.execution?.stdout); assert.ok(count > 0 && count < 16, `fork count ${count}`);
  assert.deepEqual(groups().filter((name) => !before.has(name)), []);
});

test('cancellation, output limits and unavailable resource controls fail closed and clean their groups', async () => {
  const before = new Set(groups()); const directory = mkdtempSync('/tmp/native-limits-');
  const command = { workspace: directory, command: ['/usr/bin/sleep', '10'], timeoutMs: 3000, memoryBytes: 134_217_728, processLimit: 16 };
  try {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 200);
    try { await assert.rejects(captureIsolated(command, controller.signal), /PROJECT_EVALUATION_CANCELLED/); } finally { clearTimeout(timer); }
    const bounded = await captureIsolated({ ...command, command: ['/usr/bin/yes'], outputBytes: 128 });
    assert.equal(bounded.outputLimitExceeded, true); assert.ok(Buffer.byteLength(bounded.stdout) + Buffer.byteLength(bounded.stderr) <= 128);
    const previous = process.env.WP_EVALUATION_CGROUP_ROOT;
    process.env.WP_EVALUATION_CGROUP_ROOT = directory;
    try { await assert.rejects(captureIsolated(command), /PROJECT_RESOURCE_ISOLATION_UNAVAILABLE/); }
    finally { if (previous === undefined) delete process.env.WP_EVALUATION_CGROUP_ROOT; else process.env.WP_EVALUATION_CGROUP_ROOT = previous; }
    assert.deepEqual(groups().filter((name) => !before.has(name)), []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('native code cannot read an unmounted host file', async () => {
  const directory = mkdtempSync('/tmp/native-host-secret-'); const path = join(directory, 'secret'); writeFileSync(path, 'HOST_SECRET');
  try {
    const result = await native.compileAndRun({ language: 'c', build, entryPaths: ['main.c'], files: [{ path: 'main.c', content: `#include <stdio.h>\nint main(void){FILE *f=fopen("${path}","r"); return f?7:0;}` }] });
    assert.equal(result.build.exitCode, 0, result.build.stderr); assert.equal(result.execution?.exitCode, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('native network namespace cannot reach a listening host socket', async () => {
  let connections = 0;
  const server = createServer((socket) => { connections++; socket.destroy(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    const result = await native.compileAndRun({ language: 'c', build, entryPaths: ['main.c'], files: [{ path: 'main.c', content:
      `#include <sys/socket.h>\n#include <arpa/inet.h>\n#include <unistd.h>\nint main(void){int s=socket(AF_INET,SOCK_STREAM,0); struct sockaddr_in a={0}; a.sin_family=AF_INET; a.sin_port=htons(${address.port}); a.sin_addr.s_addr=inet_addr("127.0.0.1"); int r=connect(s,(struct sockaddr*)&a,sizeof(a)); close(s); return r==0?7:0;}` }] });
    assert.equal(result.build.exitCode, 0, result.build.stderr); assert.equal(result.execution?.exitCode, 0); assert.equal(connections, 0);
  } finally { server.close(); await once(server, 'close'); }
});
