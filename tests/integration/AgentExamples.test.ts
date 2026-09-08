/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证角色Examples的行为、约束及失败场景。
 */
import { roleExamplePath } from '../helpers/RoleExample.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { AGENT_IDS } from '../../src/domain/agents/AgentContracts.ts';
import { main } from '../../src/interfaces/runner/AgentRun.ts';

for (const role of AGENT_IDS) test(`standalone ${role} sample commits through the production role and records one stage`, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-sample-'));
  try {
    const result = await main(['--role', role, '--input', roleExamplePath(role), '--output', directory]);
    const saved = JSON.parse(readFileSync(join(result.outputDirectory, 'result.json'), 'utf8'));
    assert.equal(saved.result.agentType, role);
    assert.equal(saved.result.status, 'SUCCEEDED');
    assert.equal(saved.configuration.provider.kind, 'fixture');
    assert.equal(saved.configuration.roleExecutionVersion, 'domain-agents-v1');
    assert.equal(saved.publication, 'NOT_EVALUATED');
    assert.ok(saved.outputs.length >= 1);
    const audit = readFileSync(join(result.outputDirectory, 'audit.json'), 'utf8');
    assert.match(audit, /COMPLETED/);
    assert.doesNotMatch(audit, /PublicationCommitted/);
    assert.equal(readdirSync(result.outputDirectory).includes('failure.json'), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('standalone invalid output records failure and retains the failed Run for inspection', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-failure-'));
  try {
    const sample = JSON.parse(readFileSync('src/domain/agents/codeAgent/examples/CodeAgentSample.json', 'utf8'));
    sample.modelOutput.files[0].path = 'unauthorized.ts';
    const path = join(directory, 'invalid.json'); writeFileSync(path, JSON.stringify(sample));
    await assert.rejects(main(['--role', 'code', '--input', path, '--output', directory]), /AGENT_OUTPUT_INVALID/);
    const runDirectory = readdirSync(directory).find((name) => name.startsWith('code-'))!;
    assert.equal(JSON.parse(readFileSync(join(directory, runDirectory, 'failure.json'), 'utf8')).status, 'FAILED');
    assert.ok(readdirSync(join(directory, runDirectory, 'runtime')).length > 0);
    assert.equal(readdirSync(join(directory, runDirectory)).includes('result.json'), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
