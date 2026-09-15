/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证证据复核角色的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './ReviewAgent.ts';
import { buildPrompt } from './WorkbenchReviewPrompt.ts';
import { validateOutput, type Input } from './WorkbenchReviewContract.ts';
import { roleExample } from '../../../../tests/helpers/RoleExample.ts';

test('review: normal output uses one model call and validates before returning artifacts', async () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.output, sample.output);
  assert.deepEqual(sample.phases, ['model', 'validate']);
  assert.ok(result.payload.resultKind);
});
test('review: missing referenced material fails before model execution', async () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  sample.input.materials = [];
  await assert.rejects(execute(sample.input, sample.context), /AGENT_MATERIAL_MISSING/);
  assert.deepEqual(sample.phases, []);
});
test('review: invalid output is rejected without a business retry', async () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  let calls = 0;
  sample.context.model.execute = async () => { calls++; return {}; };
  await assert.rejects(execute(sample.input, sample.context), /AGENT_OUTPUT_INVALID/);
  assert.equal(calls, 1);
});
test('review: cancellation before and during model execution cannot return success', async () => {
  const before = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json'); before.controller.abort();
  await assert.rejects(execute(before.input, before.context), /AGENT_CANCELLED/);
  assert.deepEqual(before.phases, []);
  const during = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  during.context.model.execute = async () => { during.controller.abort(); return during.output; };
  await assert.rejects(execute(during.input, during.context), /AGENT_CANCELLED/);
  assert.deepEqual(during.phases, []);
});
test('review: correction IDs are normalized and bound to evaluation evidence', async () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  sample.output.correction.correctionId = 'newline-failure';
  const result = await execute(sample.input, sample.context);
  const corrections = result.payload.corrections as { correctionId: string; evidenceRefs: unknown[] }[];
  assert.match(corrections[0]!.correctionId, /^COR-[0-9]{4,}$/);
  assert.deepEqual(corrections[0]!.evidenceRefs, [sample.input.payload.evaluationReportRef]);
  sample.output.blocking = true; sample.output.correction = null;
  const blocked = await execute(sample.input, sample.context);
  assert.deepEqual(blocked.payload.unresolvedRisks, ['review reported a blocking condition without a correction']);
});

test('review: correction binds both evaluation and Check evidence and rejects unknown H2', async () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  sample.input.payload.checkReportRef = sample.input.payload.criteriaRef;
  const result = await execute(sample.input, sample.context);
  assert.deepEqual((result.payload.corrections as { evidenceRefs: unknown[] }[])[0]!.evidenceRefs,
    [sample.input.payload.evaluationReportRef, sample.input.payload.checkReportRef]);
  sample.output.correction.knowledgePath = 'knowledge/markdown-diff.md#Missing';
  await assert.rejects(execute(sample.input, sample.context), /REVIEW_CORRECTION_SCOPE_INVALID/);
});

test('review: replacement cannot introduce another H2 and PASS cannot hide unresolved risks', async () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  sample.output.correction.replacementMarkdown = '## Behavior\nFix\n## Purpose\nChanged';
  await assert.rejects(execute(sample.input, sample.context), /REVIEW_CORRECTION_RANGE_INVALID/);
  sample.output.correction = null;
  sample.output.recommendation = 'PASS';
  sample.output.unresolvedRisks = ['missing evidence'];
  await assert.rejects(execute(sample.input, sample.context), /REVIEW_PASS_CONTRADICTION/);
});

test('review: fenced example headings cannot authorize a correction', async () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  const knowledge = sample.input.materials.find(({ ref }) => ref.artifactId === sample.input.payload.knowledgeRef.artifactId)!;
  knowledge.content = '# Knowledge\n\n## Behavior\nReal section\n\n```markdown\n## Example only\n```\n';
  sample.output.correction.knowledgePath = 'knowledge/markdown-diff.md#Example only';
  await assert.rejects(execute(sample.input, sample.context), /REVIEW_CORRECTION_SCOPE_INVALID/);
  sample.output.correction.knowledgePath = 'knowledge/markdown-diff.md#Behavior';
  await execute(sample.input, sample.context);
});


test('review: prompt lists exact existing H2 targets and does not authorize subheadings or fenced headings', () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  const material = sample.input.materials.find(({ ref }) => ref.artifactId === sample.input.payload.knowledgeRef.artifactId)!;
  material.content = '# Knowledge\n\n## Block syntax\n### Paragraphs\nRules\n```markdown\n## Fake heading\n```\n';
  const prompt = buildPrompt(sample.input, sample.context);
  const line = prompt.split('\n').find(x => x.startsWith('本次唯一允许的修订目标'))!;
  assert.ok(line.includes('"heading":"Block syntax"'));
  assert.ok(line.includes('knowledge/markdown-diff.md#Block syntax'));
  assert.ok(!line.includes('"heading":"Paragraphs"'));
  assert.ok(!line.includes('"heading":"Fake heading"'));
});


test('review: contradictory PASS receives one bounded feedback and preserves unresolved risk', async () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  const attempts: any[] = [];
  sample.context.stageJournal = { read: async () => attempts, record: async entry => { attempts.push(entry); } };
  let calls = 0;
  sample.context.model.execute = async request => {
    calls++;
    if (calls === 2) {
      assert.match(request.prompt, /REVIEW_PASS_CONTRADICTION/);
      assert.match(request.prompt, /不能为满足结构而删除风险/);
    }
    return { blocking: true, recommendation: calls === 1 ? 'PASS' : 'ITERATE', correction: null,
      unresolvedRisks: ['missing source branch evidence'] };
  };
  const result = await execute(sample.input, sample.context);
  assert.equal(calls, 2);
  assert.deepEqual(result.payload.unresolvedRisks, ['missing source branch evidence']);
  assert.deepEqual(attempts.map(entry => entry.status), ['STARTED', 'REJECTED', 'STARTED', 'PASSED']);
  assert.equal(attempts[0].deadlineAt, attempts[2].deadlineAt);
});

test('review: an incomplete replacement gets one bounded correction without relaxing section scope', async () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  const valid = structuredClone(sample.output);
  let calls = 0;
  sample.context.model.execute = async request => {
    calls++;
    if (calls === 1) return { ...valid, correction: { ...valid.correction, replacementMarkdown: '### Detail\nOnly a subsection' } };
    assert.match(request.prompt, /REVIEW_CORRECTION_RANGE_INVALID/);
    assert.match(request.prompt, /correction.replacementMarkdown/);
    return { ...valid, correction: { ...valid.correction, replacementMarkdown: '## Behavior\nComplete scoped correction' } };
  };
  const result = await execute(sample.input, sample.context);
  assert.equal(calls, 2);
  assert.equal(result.output.correction?.replacementMarkdown, '## Behavior\nComplete scoped correction');
  calls = 0;
  sample.context.model.execute = async () => {
    calls++; return { ...valid, correction: { ...valid.correction, replacementMarkdown: '### Detail\nStill incomplete' } };
  };
  await assert.rejects(execute(sample.input, sample.context), /REVIEW_CORRECTION_RANGE_INVALID/);
  assert.equal(calls, 2);
});

test('review: format repair cannot discard the correction or revise its factual claim', async () => {
  for (const change of ['pass', 'criterion']) {
    const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
    const original = structuredClone(sample.output); let calls = 0;
    sample.context.model.execute = async request => {
      calls++;
      if (calls === 1) return { ...original, correction: { ...original.correction, replacementMarkdown: '### Detail\nFragment' } };
      assert.match(request.prompt, /其他字段必须保留/);
      return change === 'pass' ? { blocking: false, recommendation: 'PASS', correction: null, unresolvedRisks: [] }
        : { ...original, correction: { ...original.correction, criterion: 'Different claim', replacementMarkdown: '## Behavior\nValid format' } };
    };
    await assert.rejects(execute(sample.input, sample.context), /REVIEW_REPAIR_FACTS_CHANGED/);
    assert.equal(calls, 2);
  }
});

test('review: persisted format failure also prevents replaying a later contradictory PASS', async () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  const original = structuredClone(sample.output); let calls = 0;
  sample.context.stageJournal = { read: async () => [
    { schemaVersion: 'role-stage-v1', stage: 'evidence-attribution', attempt: 1, startedAt: 0, deadlineAt: 1000, status: 'FAILED',
      output: { ...original, correction: { ...original.correction, replacementMarkdown: '### Detail\nFragment' } } },
    { schemaVersion: 'role-stage-v1', stage: 'evidence-attribution', attempt: 2, startedAt: 0, deadlineAt: 1000, status: 'PASSED',
      output: { blocking: false, recommendation: 'PASS', correction: null, unresolvedRisks: [] } },
  ], record: async () => { throw new Error('must not rewrite history'); } };
  sample.context.model.execute = async () => { calls++; return original; };
  await assert.rejects(execute(sample.input, sample.context), /REVIEW_REPAIR_FACTS_CHANGED/);
  assert.equal(calls, 0);
});

test('review: pending concerns cannot disappear and disproof quotes must exist in the frozen source', () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  const criteria = sample.input.materials.find(m => m.ref.artifactId === sample.input.payload.criteriaRef.artifactId)!;
  criteria.content = { ...(criteria.content as object), pendingReviewConcerns: [{ concernId: 'concern-1', criterion: 'A declaration was described as inline', risk: 'Wrong location' }] };
  const source = sample.input.materials.find(m => m.ref.artifactId === sample.input.payload.evaluationReportRef.artifactId)!;
  sample.input.payload.checkReportRef = source.ref; source.content = { files: [{ path: 'api.h', content: 'inline int value() { return 1; }' }] };
  const pass = { blocking: false, recommendation: 'PASS' as const, correction: null, unresolvedRisks: [] };
  assert.throws(() => validateOutput(pass, sample.input), /REVIEW_CONCERN_UNRESOLVED/);
  const resolution = { concernId: 'concern-1', disposition: 'DISPROVED' as const, reason: 'The function is defined inline here.', sourceQuotes: [{ path: 'api.h', quote: 'inline int value() { return 1; }' }] };
  assert.doesNotThrow(() => validateOutput({ ...pass, concernResolutions: [resolution] }, sample.input));
  assert.throws(() => validateOutput({ ...pass, concernResolutions: [{ ...resolution, sourceQuotes: [{ path: 'api.h', quote: 'invented source' }] }] }, sample.input), /REVIEW_CONCERN_UNRESOLVED/);
  assert.throws(() => validateOutput({ ...pass, concernResolutions: [{ ...resolution, disposition: 'CONFIRMED' }] }, sample.input), /REVIEW_CONCERN_UNRESOLVED/);
  assert.throws(() => validateOutput({ ...pass, concernResolutions: [{ ...resolution, disposition: 'UNRESOLVED' }] }, sample.input), /REVIEW_CONCERN_UNRESOLVED/);
  assert.throws(() => validateOutput({ ...pass, concernResolutions: [resolution, resolution] }, sample.input), /REVIEW_CONCERN_UNRESOLVED/);
});

test('review: newline-only quote mismatches receive repair guidance without accepting changed source', () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  const criteria = sample.input.materials.find(m => m.ref.artifactId === sample.input.payload.criteriaRef.artifactId)!;
  criteria.content = { pendingReviewConcerns: [{ concernId: 'one', criterion: 'Definition location', risk: 'Wrong location' }] };
  const source = sample.input.materials.find(m => m.ref.artifactId === sample.input.payload.evaluationReportRef.artifactId)!;
  sample.input.payload.checkReportRef = source.ref;
  const content = 'inline int value() {\r\n    return 1;\r\n}';
  source.content = { files: [{ path: 'api.h', content }] };
  const output = (quote: string) => ({ blocking: false, recommendation: 'PASS' as const, correction: null,
    concernResolutions: [{ concernId: 'one', disposition: 'DISPROVED' as const, reason: 'The definition is inline.', sourceQuotes: [{ path: 'api.h', quote }] }] });
  assert.throws(() => validateOutput(output(content.replaceAll('\r\n', '\n')), sample.input),
    (error: unknown) => error instanceof Error && 'issue' in error && /CRLF\/LF/.test((error.issue as { hint: string }).hint));
  assert.doesNotThrow(() => validateOutput(output(content), sample.input));
  assert.doesNotThrow(() => validateOutput(output('inline int value() {'), sample.input));
  for (const quote of [content.replace('return 1', 'return 2'), content.replace('    return', '\treturn'), content.replace('value()', 'value( )')]) {
    assert.throws(() => validateOutput(output(quote), sample.input), /REVIEW_CONCERN_UNRESOLVED/);
  }
});

test('review: recovery carries prior format facts without consuming the new attempt slots', async () => {
  for (const changesFacts of [false, true]) {
    const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
    const original = structuredClone(sample.output);
    const previous = { schemaVersion: 'role-stage-v1' as const, stage: 'evidence-attribution', attempt: 1,
      startedAt: 0, deadlineAt: 1, status: 'REJECTED' as const,
      output: { ...original, correction: { ...original.correction, replacementMarkdown: '### Detail\nFragment' } } };
    const before = structuredClone(previous); let calls = 0;
    sample.context.stageJournal = { read: async () => [], history: async () => [previous], record: async () => {} };
    sample.context.model.execute = async request => {
      calls++;
      assert.match(request.prompt, /本次恢复仍受原格式修复约束/);
      return changesFacts ? { blocking: false, recommendation: 'PASS', correction: null, unresolvedRisks: [] } : original;
    };
    if (changesFacts) { await assert.rejects(execute(sample.input, sample.context), /REVIEW_REPAIR_FACTS_CHANGED/); assert.equal(calls, 2); }
    else { assert.deepEqual((await execute(sample.input, sample.context)).output, original); assert.equal(calls, 1); }
    assert.deepEqual(previous, before, 'prior attempts and their deadline remain immutable');
  }
});


test('review: invalid quotes identify their file and a literal source line without relaxing acceptance', () => {
  const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
  const criteria = sample.input.materials.find(m => m.ref.artifactId === sample.input.payload.criteriaRef.artifactId)!;
  criteria.content = { pendingReviewConcerns: [{ concernId: 'one', criterion: 'Declaration location', risk: 'Wrong location' }] };
  const source = sample.input.materials.find(m => m.ref.artifactId === sample.input.payload.evaluationReportRef.artifactId)!;
  sample.input.payload.checkReportRef = source.ref;
  const line = '\tfloat FloatAttribute(const char* name, float defaultValue = 0) const;';
  source.content = { files: [{ path: 'api.h', content: '// Fixed comment\r\n' + line + '\r\n' }] };
  const output = (quote: string) => ({ blocking: false, recommendation: 'PASS' as const, correction: null,
    concernResolutions: [{ concernId: 'one', disposition: 'DISPROVED' as const, reason: 'The header declares the function.', sourceQuotes: [{ path: 'api.h', quote }] }] });
  for (const quote of ['    ' + line.trim(), '// Wrong comment\r\n' + line]) {
    assert.throws(() => validateOutput(output(quote), sample.input), (error: unknown) => {
      if (!(error instanceof Error) || !('issue' in error)) return false;
      const hint = (error.issue as { hint: string }).hint;
      assert.match(hint, /api\.h/); assert.ok(hint.includes(JSON.stringify(line)));
      assert.match(hint, /不是整段引用或语义通过证据/); return true;
    });
  }
  assert.doesNotThrow(() => validateOutput(output(line), sample.input));
  assert.throws(() => validateOutput(output('unrelated statement'), sample.input), /REVIEW_CONCERN_UNRESOLVED/);
});
