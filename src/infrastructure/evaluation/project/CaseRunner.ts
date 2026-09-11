/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：生成独立用例驱动程序并核对逐用例完成记录。
 */
import type { Output } from '../../../domain/agents/testGenAgent/TestGenAgentContract.ts';

type Case = Output['cases'][number];
export interface CaseRecord { caseId: string; status: 'PASS' | 'FAIL' }

export function caseRunner(cases: Case[], nonce: string): string {
  return '#include <stdio.h>\n' + cases.map(c => `int ${c.entryPoint}(void);`).join('\n')
    + '\nint main(void) { int failed = 0;\n'
    + cases.map(c => `{ int result = ${c.entryPoint}(); failed |= (result != 0); printf("WP_CASE ${nonce} ${c.caseId} %s\\n", result == 0 ? "PASS" : "FAIL"); fflush(stdout); }`).join('\n')
    + '\nreturn failed ? 1 : 0; }\n';
}

export function readCaseRecords(stdout: string, cases: Case[], nonce: string) {
  const records: CaseRecord[] = [], failures: string[] = [];
  const expected = new Set(cases.map(c => c.caseId)), seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith('WP_CASE ')) continue;
    const match = /^WP_CASE ([a-f0-9]+) ([A-Za-z0-9_.-]+) (PASS|FAIL)$/.exec(line);
    if (!match || match[1] !== nonce) { failures.push('invalid execution nonce or record'); continue; }
    const caseId = match[2]!;
    if (!expected.has(caseId)) { failures.push(`unknown case ${caseId}`); continue; }
    if (seen.has(caseId)) { failures.push(`duplicate case ${caseId}`); continue; }
    seen.add(caseId); records.push({ caseId, status: match[3] as CaseRecord['status'] });
  }
  for (const caseId of expected) if (!seen.has(caseId)) failures.push(`missing case ${caseId}`);
  return { records, failures, passed: records.filter(r => r.status === 'PASS').length,
    complete: failures.length === 0 && records.length === cases.length };
}
