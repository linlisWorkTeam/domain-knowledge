/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证报告提取、修正预算、缺失证据和取消边界。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './CheckAgent.ts';
import type { Input } from './CheckAgentContract.ts';
import { AgentReportFailure, ModelResponseError } from '../AgentExecution.ts';
import { roleExample } from '../../../../tests/helpers/RoleExample.ts';

const sample = () => roleExample<Input>('check');
test('Check assembles full frozen functions and preserves freely formatted analysis', async () => {
  const s = sample(); s.output.findings[0].message = '# 差异\n\n* 返回值不一致。';
  const result = await execute(s.input, s.context);
  assert.equal(result.output.reportVersion, 'check-report-v2');
  assert.equal(result.output.blocking, true);
  const evidence = result.output.findings[0]!.original;
  assert.equal(evidence.status, 'present');
  if (evidence.status === 'present') assert.equal(evidence.excerpts[0]!.content, 'int calculate() { return 4; }');
  assert.equal(result.output.findings[0]!.message, s.output.findings[0].message);
  assert.match(JSON.stringify(result.payload), /int calculate/);
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0]!.outputAttempts, 1);
  assert.equal(JSON.parse(result.artifacts[0]!.content).attempts.length, 1);
});
test('Check missing required materials fails without calling a model', async () => {
  const s = sample(); s.input.materials = [];
  await assert.rejects(execute(s.input, s.context), /AGENT_MATERIAL_MISSING/);
  assert.equal(s.requests.length, 0);
});
test('Check shares two repairs across malformed JSON and source location failures', async () => {
  const s = sample(), prompts: string[] = [];
  s.context.model.execute = async (request) => {
    prompts.push(request.prompt); assert.equal(request.outputAttempts, 1); assert.equal(request.reportAttempt, prompts.length);
    if (prompts.length === 1) throw new ModelResponseError('DSH_AGENT_OUTPUT_NOT_JSON', '{broken report');
    const output = structuredClone(s.output);
    if (prompts.length === 2) output.findings[0].generated.locations[0].startLine = output.findings[0].generated.locations[0].endLine = 99;
    return output;
  };
  const result = await execute(s.input, s.context);
  assert.equal(prompts.length, 3);
  assert.match(prompts[1]!, /broken report/);
  assert.match(prompts[2]!, /findings\[0\]\.generated.*CHECK_LOCATION_INVALID/);
  const attempts = JSON.parse(result.artifacts[0]!.content).attempts;
  assert.equal(attempts[1].validEvidence.length, 1);
  assert.deepEqual(attempts[1].validEvidence[0], attempts[2].validEvidence[0]);
});
test('Check exhausted repairs preserve raw attempts and never emit a successful partial report', async () => {
  const s = sample(); s.output.findings[0].generated.locations[0].startLine = 99;
  let calls = 0; s.context.model.execute = async () => { calls++; return structuredClone(s.output); };
  await assert.rejects(execute(s.input, s.context), (error: unknown) => {
    assert.ok(error instanceof AgentReportFailure);
    assert.match(error.message, /CHECK_REPORT_REPAIR_EXHAUSTED/);
    const attempts = JSON.parse(error.artifacts[0]!.content).attempts;
    assert.equal(attempts.length, 3);
    assert.match(attempts[2].errors.join(), /CHECK_LOCATION_INVALID/);
    return true;
  });
  assert.equal(calls, 3);
});
test('Check reports a one-sided absence without inventing generated code', async () => {
  const s = sample(); s.output.findings[0].generated = { status: 'missing', checkedPaths: s.output.scope, reason: 'Required public implementation was not found in the supplied generated files.' };
  const result = await execute(s.input, s.context);
  assert.equal(result.output.findings[0]!.generated.status, 'missing');
  assert.equal(result.output.blocking, true);
  assert.match(JSON.stringify(result.payload), /程序未证明缺失/);
});
test('Check rejects unauthorized locations, invented rules, incomplete scope and two missing sides', async () => {
  for (const mutate of [
    (s: ReturnType<typeof sample>) => { s.output.findings[0].generated.locations[0].path = '../escape.c'; },
    (s: ReturnType<typeof sample>) => { s.output.findings[0].ruleId = 'invented'; },
    (s: ReturnType<typeof sample>) => { s.output.scope = []; },
    (s: ReturnType<typeof sample>) => { s.output.findings[0].original = s.output.findings[0].generated = { status: 'missing', checkedPaths: s.output.scope, reason: 'missing' }; },
  ]) {
    const s = sample(); mutate(s);
    await assert.rejects(execute(s.input, s.context), /CHECK_REPORT_REPAIR_EXHAUSTED/);
  }
});
test('Check does not repair cancellation or provider failures', async () => {
  for (const during of [false, true]) {
    const s = sample();
    if (!during) s.controller.abort();
    else s.context.model.execute = async () => { s.controller.abort(); return s.output; };
    await assert.rejects(execute(s.input, s.context), /AGENT_CANCELLED/);
  }
  const s = sample(); let calls = 0;
  s.context.model.execute = async () => { calls++; throw new Error('DSH_PROVIDER_REQUEST_FAILED'); };
  await assert.rejects(execute(s.input, s.context), /DSH_PROVIDER_REQUEST_FAILED/);
  assert.equal(calls, 1);
});

test('Check cannot hide a failed citation by deleting or downgrading its finding', async () => {
  const s = sample(); let calls = 0;
  s.context.model.execute = async () => {
    calls++;
    if (calls > 1) return { scope: s.output.scope, findings: [] };
    const output = structuredClone(s.output); output.findings[0].generated.locations[0].startLine = 99; return output;
  };
  await assert.rejects(execute(s.input, s.context), (error: unknown) => {
    assert.ok(error instanceof AgentReportFailure);
    assert.match(error.artifacts[0]!.content, /CHECK_REPAIR_CONCLUSION_CHANGED/);
    return true;
  });
  assert.equal(calls, 3);
});

test('Check preserves conclusions before schema validation, including provider-rejected parsed output', async () => {
  for (const providerRejected of [false, true]) for (const repair of ['delete', 'downgrade', 'fix-scope']) {
    const s = sample(); let calls = 0;
    s.context.model.execute = async () => {
      calls++;
      const output = structuredClone(s.output);
      if (calls === 1) {
        output.scope = [];
        if (providerRejected) throw new ModelResponseError('AGENT_OUTPUT_INVALID: scope is empty', JSON.stringify(output), [output]);
      } else if (repair === 'delete') output.findings = [];
      else if (repair === 'downgrade') output.findings[0].severity = 'INFO';
      return output;
    };
    if (repair === 'fix-scope') {
      const result = await execute(s.input, s.context);
      assert.equal(calls, 2); assert.equal(result.output.blocking, true);
      assert.equal(result.output.findings[0]!.message, s.output.findings[0].message);
    } else {
      await assert.rejects(execute(s.input, s.context), (error: unknown) => {
        assert.ok(error instanceof AgentReportFailure);
        assert.match(error.artifacts[0]!.content, /CHECK_REPAIR_CONCLUSION_CHANGED/);
        return true;
      });
      assert.equal(calls, 3);
    }
  }
});

test('A malformed sibling or location does not discard a recognizable blocking conclusion', async () => {
  for (const brokenLocation of [false, true]) {
    const s = sample(); let calls = 0;
    s.context.model.execute = async () => {
      const output = structuredClone(s.output);
      if (++calls === 1) {
        if (brokenLocation) output.findings[0].generated.locations[0].startLine = 0;
        else output.findings.push({ message: 'incomplete sibling' });
      } else output.findings = [];
      return output;
    };
    await assert.rejects(execute(s.input, s.context), (error: unknown) => {
      assert.ok(error instanceof AgentReportFailure);
      assert.match(error.artifacts[0]!.content, /CHECK_REPAIR_CONCLUSION_CHANGED/);
      return true;
    });
  }
});

test('A rejected downgrade does not prevent the final repair from restoring the original conclusion', async () => {
  const s = sample(); let calls = 0;
  s.context.model.execute = async () => {
    const output = structuredClone(s.output);
    if (++calls === 1) output.scope = [];
    else if (calls === 2) output.findings[0].severity = 'INFO';
    return output;
  };
  const result = await execute(s.input, s.context);
  assert.equal(calls, 3); assert.equal(result.output.blocking, true);
  assert.match(JSON.parse(result.artifacts[0]!.content).attempts[1].errors.join(), /CHECK_REPAIR_CONCLUSION_CHANGED/);
});

test('check: blocking findings bind a criterion to real frozen generated code', async () => {
  const s = sample();
  const result = await execute(s.input, s.context);
  const finding = (result.payload.findings as { criterionId: string; evidenceLocation: string }[])[0]!;
  assert.equal(finding.criterionId, s.output.findings[0].ruleId);
  const side = result.output.findings[0]!.generated;
  assert.equal(side.status, 'present');
  if (side.status === 'present') {
    const excerpt = side.excerpts[0]!;
    assert.ok(finding.evidenceLocation.includes(`${excerpt.path}:${excerpt.startLine}-${excerpt.endLine}`));
  }
  for (const missing of [false, true]) {
    const output = structuredClone(s.output);
    if (missing) output.findings[0].generated.locations = [];
    else output.findings[0].generated.locations[0].startLine = 100;
    s.context.model.execute = async () => output;
    await assert.rejects(execute(s.input, s.context), (error: unknown) => {
      assert.ok(error instanceof AgentReportFailure);
      assert.match(error.message, /CHECK_REPORT_REPAIR_EXHAUSTED/);
      assert.match(error.artifacts[0]!.content, missing ? /AGENT_OUTPUT_INVALID/ : /CHECK_LOCATION_INVALID/);
      return true;
    });
  }
});
