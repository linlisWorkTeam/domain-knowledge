/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：生成单入口分发程序；完成事实只接受外部监督器的独立通道。
 */
import type { Output } from '../../../domain/agents/testGenAgent/TestGenAgentContract.ts';
type Case = Output['cases'][number];
export interface SupervisedReturn { entered: boolean; returned: boolean; value: number; reason: string }
export interface CaseRecord extends SupervisedReturn { caseId: string; status: 'PASS' | 'FAIL' }

export function caseRunner(cases: Case[]): string {
  return '#include <stdio.h>\n' + cases.map(c => `int ${c.entryPoint}(void);`).join('\n')
    + '\nint main(int argc, char **argv) { if(argc < 2) return 125; unsigned selected = 0;'
    + ' for(const char *p = argv[1]; *p; p++) { if(*p < \'0\' || *p > \'9\') return 125; selected = selected * 10 + (*p - \'0\'); }'
    + ' setbuf(stdout, NULL); setbuf(stderr, NULL); switch(selected) {\n'
    + cases.map((c, i) => `case ${i}: return ${c.entryPoint}();`).join('\n')
    + '\ndefault: return 125; } }\n';
}

/** 此参数必须来自监督进程 FD 3，不得把被测 stdout/stderr 传入。 */
export function readSupervisedReturn(channel: string): SupervisedReturn {
  try {
    const value = JSON.parse(channel);
    if (typeof value.entered === 'boolean' && typeof value.returned === 'boolean'
      && Number.isSafeInteger(value.value) && typeof value.reason === 'string'
      && (!value.returned || value.entered && value.reason === 'RETURNED')) return value;
  } catch { /* 缺失、截断或多条记录都不能代表完成。 */ }
  return { entered: false, returned: false, value: 0, reason: 'SUPERVISOR_RESULT_INVALID' };
}
