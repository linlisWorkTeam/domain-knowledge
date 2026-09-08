#!/usr/bin/env node
/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：执行evaluateframework相关的开发与工程维护操作。
 */
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const node = process.execPath;
const checks = [
  {
    id: 'architecture-boundaries',
    claim: 'DDD dependency direction and the fixed seven-Agent ownership remain enforced',
    args: ['--test', 'tests/contract/Architecture.test.ts'],
    evidence: ['tests/contract/Architecture.test.ts'],
  },
  {
    id: 'agent-topology-and-recovery',
    claim: 'LangGraph executes the fixed topology, parallel branches, routes, cancellation and checkpoint recovery',
    args: ['--test', 'tests/integration/LanggraphInfrastructure.test.ts'],
    evidence: ['tests/integration/LanggraphInfrastructure.test.ts'],
  },
  {
    id: 'runtime-contracts',
    claim: 'AgentCommand is rejected before dispatch and every node emits a validated AgentResult',
    args: ['--test', 'tests/integration/AgentContracts.test.ts'],
    evidence: [
      'tests/integration/AgentContracts.test.ts',
      'docs/specs/schemas/AgentCommand.schema.json',
      'docs/specs/schemas/AgentResult.schema.json',
    ],
  },
  {
    id: 'company-codeagent-contract',
    claim: 'Company CodeAgent CLI preserves role, stdin, session, cancellation, error, and output validation boundaries',
    args: ['--test', 'tests/integration/CompanyCodeagentCli.test.ts'],
    evidence: [
      'src/infrastructure/agentAdapters/companyCodeAgent/CompanyCodeAgentCliAdapter.ts',
      'tests/integration/CompanyCodeagentCli.test.ts',
    ],
  },
  {
    id: 'run-configuration-freeze',
    claim: 'A Run keeps an immutable, secret-free snapshot and rejects recovery with changed provider, prompts, tools or schema digests',
    args: ['--test', 'tests/integration/RunConfiguration.test.ts'],
    evidence: ['tests/integration/RunConfiguration.test.ts'],
  },
  {
    id: 'schema-conformance',
    claim: 'Versioned schemas, positive/negative role fixtures and P0 traceability remain valid',
    args: ['scripts/ValidateSpecs.ts'],
    evidence: ['scripts/ValidateSpecs.ts'],
  },
  {
    id: 'fixture-end-to-end',
    claim: 'All seven Agents participate in a deterministic fail-correct-regenerate-evaluate-publish flow',
    args: ['--test', 'tests/acceptance/AutomatedLanggraphFlow.test.ts'],
    evidence: ['tests/acceptance/AutomatedLanggraphFlow.test.ts'],
  },
];

function tail(text, maximum = 1200) {
  const value = text.trim();
  return value.length <= maximum ? value : value.slice(-maximum);
}

const startedAt = new Date().toISOString();
const results = checks.map((check) => {
  const start = performance.now();
  const child = spawnSync(node, check.args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    shell: false,
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    id: check.id,
    claim: check.claim,
    status: child.status === 0 && !child.error ? 'PASS' : 'FAIL',
    durationMs: Math.round(performance.now() - start),
    evidence: check.evidence,
    ...(child.status === 0 && !child.error ? {} : {
      exitCode: child.status,
      error: child.error?.message ?? null,
      stdoutTail: tail(child.stdout ?? ''),
      stderrTail: tail(child.stderr ?? ''),
    }),
  };
});

const passed = results.filter((result) => result.status === 'PASS').length;
const report = {
  schemaVersion: '1.0',
  reportKind: 'framework-mechanics-evaluation',
  startedAt,
  completedAt: new Date().toISOString(),
  outcome: passed === results.length ? 'ACCEPTED' : 'REJECTED',
  score: { passed, total: results.length },
  results,
  conclusions: {
    frameworkMechanics: passed === results.length ? 'VERIFIED' : 'NOT_VERIFIED',
    agentOutputQuality: 'NOT_EVALUATED',
    companyCodeAgentIntegration: results.find((result) => result.id === 'company-codeagent-contract')?.status === 'PASS'
      ? 'CONTRACT_VERIFIED_LIVE_NOT_EVALUATED' : 'NOT_VERIFIED',
    productionCapacityAndAvailability: 'NOT_EVALUATED',
    hostileCodeExecutionSecurity: 'NOT_EVALUATED',
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.outcome !== 'ACCEPTED') process.exitCode = 1;
