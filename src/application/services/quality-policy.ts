import type { ProvenanceRef } from '../../domain/index.ts';
import type { QualityPolicy, QualityReport } from '../ports/index.ts';
import { assessKnowledgeReadability } from './knowledge-writing-guide.ts';

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class DeterministicQualityPolicy implements QualityPolicy {
  readonly threshold: number;

  constructor(threshold = 70) {
    this.threshold = threshold;
  }

  evaluate(body: string, input: {
    title: string;
    description: string;
    provenance: ProvenanceRef[];
  }): QualityReport {
    const sections = (body.match(/^##\s+/gm) ?? []).length;
    const explanation = /为什么|原因|because|rationale|适用场景/i.test(body);
    const verification = /##\s*验证|https?:\/\/|`[^`]*(?:test|npm|python|node|curl)[^`]*`|\b\d+(?:\.\d+)?%/i.test(body);
    const pinned = input.provenance.some((source) => Boolean(
      source.pinned || source.commit || source.lines || source.symbol || source.url,
    ));
    const readability = assessKnowledgeReadability(body);
    const signals = {
      provenance: clamp(input.provenance.length ? (pinned ? 1 : 0.65) : 0),
      structure: clamp(
        (input.title.trim() ? 0.2 : 0) +
        (input.description.trim() ? 0.2 : 0) +
        Math.min(0.4, sections * 0.1) +
        (explanation ? 0.2 : 0),
      ),
      verifiability: verification ? 1 : 0,
      substance: clamp(body.trim().length / 600),
      humanReadability: readability.score,
    };
    const score = Math.round(100 * (
      signals.provenance * 0.30 + signals.structure * 0.25 +
      signals.verifiability * 0.20 + signals.substance * 0.15 +
      signals.humanReadability * 0.10
    ));
    const weakPoints: string[] = [];
    if (signals.provenance < 1) weakPoints.push('provenance: add a pinned commit, symbol, line range, or URL');
    if (signals.structure < 0.8) weakPoints.push('structure: add explanation and explicit sections');
    if (signals.verifiability < 1) weakPoints.push('verifiability: add a reproducible command, metric, or evidence link');
    if (signals.substance < 0.5) weakPoints.push('substance: candidate is too short to support reliable reuse');
    if (signals.humanReadability < 0.75) {
      weakPoints.push('readability: replace formulaic filler and oversized paragraphs with direct, concrete language');
    }
    return {
      score,
      outcome: score >= this.threshold ? 'ACCEPTED' : 'REJECTED',
      signals,
      weakPoints,
    };
  }
}
