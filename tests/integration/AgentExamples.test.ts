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
    assert.equal(saved.configuration.roleExecutionVersion, 'domain-agents-v9-check-evidence');
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

test('Check exhaustion saves every attempt in CAS without a successful result', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'check-report-exhausted-'));
  try {
    const sample = JSON.parse(readFileSync(roleExamplePath('check'), 'utf8'));
    sample.modelOutput.findings[0].generated.locations[0].startLine = 999;
    const path = join(directory, 'invalid.json'); writeFileSync(path, JSON.stringify(sample));
    await assert.rejects(main(['--role', 'check', '--input', path, '--output', directory]), /CHECK_REPORT_REPAIR_EXHAUSTED.*reportEvidence=sha256:/);
    const runDirectory = join(directory, readdirSync(directory).find((name) => name.startsWith('check-'))!);
    const failure = JSON.parse(readFileSync(join(runDirectory, 'failure.json'), 'utf8'));
    const digest = failure.error.match(/reportEvidence=sha256:([a-f0-9]{64})/)[1];
    const files = (root: string): string[] => readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)]);
    const artifact = files(join(runDirectory, 'runtime')).find((file) => file.endsWith(digest) || file.endsWith(digest + '.json'));
    assert.ok(artifact, 'failed report evidence must be persisted');
    const attempts = JSON.parse(readFileSync(artifact, 'utf8')).attempts;
    assert.equal(attempts.length, 3);
    assert.equal(attempts[0].raw.findings[0].generated.locations[0].startLine, 999);
    assert.equal(readdirSync(runDirectory).includes('result.json'), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
