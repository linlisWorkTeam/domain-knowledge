import assert from 'node:assert/strict';
import test from 'node:test';
import { DeterministicQualityPolicy } from '../../src/application/services/quality-policy.ts';
import { GOOD_BODY } from '../helpers/fixture.ts';

test('quality policy accepts structured and pinned knowledge', () => {
  const report = new DeterministicQualityPolicy(70).evaluate(GOOD_BODY, {
    title: 'Knowledge Gate',
    description: 'Separates document and behavior gates.',
    provenance: [{ path: 'spec.md', commit: 'abc123', pinned: true }],
  });
  assert.equal(report.outcome, 'ACCEPTED');
  assert.ok(report.score >= 70);
  assert.equal(report.signals.humanReadability, 1);
});

test('quality policy rejects unsupported prose without provenance', () => {
  const report = new DeterministicQualityPolicy(70).evaluate('short note', {
    title: '', description: '', provenance: [],
  });
  assert.equal(report.outcome, 'REJECTED');
  assert.ok(report.weakPoints.length >= 3);
});

test('quality policy reports formulaic AI-style writing as a readability weak point', () => {
  const formulaic = GOOD_BODY + '\n\n## 补充说明\n\n'
    + '随着技术的发展，值得注意的是，这不仅仅是一次改进，而是一次全方位赋能。'
    + '综上所述，该方案处于不断演变的格局中，显而易见，它至关重要。';
  const report = new DeterministicQualityPolicy(70).evaluate(formulaic, {
    title: 'Knowledge Gate',
    description: 'A deliberately formulaic candidate.',
    provenance: [{ path: 'spec.md', commit: 'abc123', pinned: true }],
  });
  assert.ok(report.signals.humanReadability < 0.75);
  assert.ok(report.weakPoints.some((point) => point.startsWith('readability:')));
});
