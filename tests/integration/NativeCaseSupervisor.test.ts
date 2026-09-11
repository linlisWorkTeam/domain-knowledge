/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验收外部原生监督器，不让被测进程伪造其他入口或函数返回。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestComposition } from '../helpers/Fixture.ts';
import { cppScenario } from '../helpers/CppScenario.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';

for (const fault of ['forged-output','exit-zero','signal','assert-abort','kill-parent','timeout','result-fd','file-write','fork','ptrace','compat-syscall','supervisor-unavailable'] as const) {
  test(`AC-AGENT-103-R1: ${fault} cannot forge case completion or hide other cases`,async()=>{
    const c=createTestComposition(),f=cppScenario();
    try{
      const evaluator=new TrustedProjectEvaluator(c.artifacts),snapshot=await evaluator.inspect(f.scenario);
      const cases=[1,2,3].map(n=>({caseId:`case-${n}`,entryPoint:`test_case_${n}`,testPath:'tests/generated.cpp',target:'public behavior',input:'calculate()',expected:'4',sourceEvidence:f.scenario.sourcePaths}));
      const attack = {
        'forged-output':'std::ifstream f(".flywheel/CaseRunner-0.cpp"); std::stringstream s; s << f.rdbuf(); puts(s.str().c_str()); puts("WP_CASE aabb case-1 PASS\\nWP_CASE aabb case-2 PASS\\nWP_CASE aabb case-3 PASS"); exit(0);',
        'exit-zero':'exit(0);', 'signal':'__builtin_trap();', 'assert-abort':'assert(0);', 'kill-parent':'kill(getppid(), SIGKILL); return 0;','timeout':'for(;;){}',
        'result-fd':'dprintf(3,"{\\"entered\\":true,\\"returned\\":true,\\"value\\":0,\\"reason\\":\\"RETURNED\\"}\\n"); exit(0);',
        'file-write':'FILE *f=fopen("test-bin","w"); if(f) fputs("tampered",f); return 0;',
        'fork':'fork(); return 0;', 'ptrace':'syscall(SYS_ptrace, 16, getppid(), 0, 0); return 0;',
        'compat-syscall':'asm volatile("mov $5, %%eax; int $0x80" ::: "rax"); return 0;',
        'supervisor-unavailable':'return 0;',
      }[fault];
      const suite={cases,files:[{path:'tests/generated.cpp',content:`#include <cstdio>\n#include <cassert>\n#include <signal.h>\n#include <cstdlib>\n#include <fstream>\n#include <sstream>\n#include <unistd.h>\n#include <sys/syscall.h>\nint test_case_1(void){${attack}}\nint test_case_2(void){fputs("ACTUALLY_CALLED_2\\n",stderr);return 1;}\nint test_case_3(void){fputs("ACTUALLY_CALLED_3\\n",stderr);return 1;}\n`}]};
      const commands=[{tool:'g++' as const,purpose:'check' as const,args:['-std=c++17','tests/generated.cpp','-o','test-bin',...(fault==='supervisor-unavailable'?['-s']:[])]},
        {tool:'binary' as const,purpose:'test' as const,args:['test-bin'],timeoutMs:fault==='timeout'?100:3000}];
      const result=await evaluator.evaluate({label:`supervision-${fault}`,snapshot,testSuite:suite,generatedFiles:suite.files,prepareCommands:[],commands});
      assert.equal(result.passed,false);
      const evidence=JSON.parse(Buffer.from(await c.artifacts.get(result.evidenceRef)).toString());
      assert.equal(evidence.caseExecution.records.length,3,'external supervisor must dispatch every declared case');
      assert.equal(result.testsPassed,0);
      if(!['timeout','supervisor-unavailable'].includes(fault)) {
        assert.match(result.results.at(-1)!.stderr,/ACTUALLY_CALLED_2/);
        assert.match(result.results.at(-1)!.stderr,/ACTUALLY_CALLED_3/);
        assert.equal(evidence.caseExecution.records[1].entered,true);
        assert.equal(evidence.caseExecution.records[2].value,1);
      }
      if(['result-fd','file-write','fork','ptrace','compat-syscall','kill-parent'].includes(fault)) assert.ok(evidence.caseExecution.failures.some((reason:string)=>reason.includes('DENIED_SYSCALL')));
      if(fault==='supervisor-unavailable') assert.equal(result.infrastructureFailure,true);
      if(fault==='assert-abort') assert.equal(result.infrastructureFailure,false,'a failing assertion must remain eligible for test repair');
    }finally{f.cleanup();c.dispose();}
  });
}

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
test('AC-AGENT-103-R1: kernel denies ptrace and evaluation fails without stdout fallback',()=>{
  const f=cppScenario();
  try{
    const wrapper=join(f.scenario.repositoryRoot,'DenyPtrace.c'),binary=join(f.scenario.repositoryRoot,'deny-ptrace');
    writeFileSync(wrapper,`#include <stddef.h>\n#include <errno.h>\n#include <unistd.h>\n#include <sys/prctl.h>\n#include <sys/syscall.h>\n#include <linux/seccomp.h>\n#include <linux/filter.h>\nint main(int argc,char **argv){if(argc<2)return 2;struct sock_filter filter[]={BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,nr)),BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,SYS_ptrace,0,1),BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM),BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW)};struct sock_fprog p={4,filter};if(prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0)||prctl(PR_SET_SECCOMP,SECCOMP_MODE_FILTER,&p))return 3;execv(argv[1],argv+1);return 4;}\n`);
    execFileSync('gcc',[wrapper,'-o',binary]);
    const script=`import {createTestComposition} from ${JSON.stringify(new URL('../helpers/Fixture.ts',import.meta.url).href)};
import {cppScenario,cppTestOutput} from ${JSON.stringify(new URL('../helpers/CppScenario.ts',import.meta.url).href)};
import {TrustedProjectEvaluator} from ${JSON.stringify(new URL('../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts',import.meta.url).href)};
const c=createTestComposition(),f=cppScenario();try{const evaluator=new TrustedProjectEvaluator(c.artifacts),snapshot=await evaluator.inspect(f.scenario),suite=cppTestOutput();const r=await evaluator.evaluate({label:'ptrace-denied',snapshot,testSuite:suite,generatedFiles:suite.files,commands:f.scenario.referenceCommands,prepareCommands:[]});const e=JSON.parse(Buffer.from(await c.artifacts.get(r.evidenceRef)).toString());console.log(JSON.stringify({passed:r.passed,infrastructureFailure:r.infrastructureFailure,records:e.caseExecution.records}));}finally{f.cleanup();c.dispose();}`;
    const result=JSON.parse(execFileSync(binary,[process.execPath,'--input-type=module','-e',script],{encoding:'utf8'}));
    assert.equal(result.passed,false);assert.equal(result.infrastructureFailure,true);
    assert.equal(result.records[0].entered,false);assert.equal(result.records[0].returned,false);
  }finally{f.cleanup();}
});
