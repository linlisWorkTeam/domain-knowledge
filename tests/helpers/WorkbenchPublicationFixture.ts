/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供联合证据测试替身，不代表真实发布验收。
 */
import { sha256 } from '../../src/domain/Domain.ts';
import type { PublicationEvidence } from '../../src/domain/services/workbench/WorkbenchPublication.ts';
import { createStageTask, canonicalJson, type StageTask, type StageInput, type StageResult } from '../../src/domain/services/workbench/StageTask.ts';
import { SOURCE_VERIFICATION_CONTRACT } from '../../src/domain/services/knowledge/KnowledgeSourceVerification.ts';
export const publicationRef = (text: string) => ({ artifactId: `sha256:${sha256(text)}`, sha256: sha256(text), size: text.length, mediaType: 'application/json' });
export function publicationFixture(): PublicationEvidence {
  const base: StageInput = { projectId: 'project', stage: 'FLYWHEEL', sourceRevision: 'commit', sourceDigest: sha256('source'), configurationDigest: sha256('configuration'), cardVersionIds: ['version'], parameters: { snapshotId: 'snapshot' } };
  const done = (input: StageInput, summary: StageResult['summary']): StageTask => ({ ...createStageTask(input, {}, 'now'), status: 'SUCCEEDED', result: { artifactRefs: [], summary } });
  const reconstruction = done(base, { modules: [{ moduleId: 'module', language: 'c', codeRef: publicationRef('{"files":[]}'), cardVersionIds: ['version'], interfaceComparison: { compatible: true } }] });
  const params = { snapshotId: 'snapshot', reconstructionTaskId: reconstruction.taskId, reconstructionDigest: sha256(canonicalJson(reconstruction.result)) };
  const evaluation = done({ ...base, stage: 'EVALUATE', parameters: params }, { reconstructionTaskId: reconstruction.taskId, requestedModules: 1, completedModules: 1,
    modules: [{ moduleId: 'module', status: 'BEHAVIOR_PASSED', interfaceCompatible: true, passed: 2, total: 2 }] });
  const suiteRef = publicationRef('fixed');
  const fixedEvaluation = done({ ...base, stage: 'EVALUATE', parameters: { ...params, operation: 'FIXED_NATIVE_EVALUATION', fixedEvaluationContract: 'fixed-native-evaluation-v1', suiteRefs: { module: suiteRef }, fingerprints: { c: publicationRef('{"toolchain":"test"}') } } },
    { reconstructionTaskId: reconstruction.taskId, publicationVerified: false, modules: [{ moduleId: 'module', status: 'FIXED_PASSED', interfaceCompatible: true, referencePassed: true, passed: 2, total: 2 }] });
  const cards = [{ cardId: 'card', versionId: 'version', moduleId: 'module', bodyDigest: sha256('body') }];
  const sourceVerification = done({ ...base, stage: 'EVALUATE', parameters: { snapshotId: 'snapshot', operation: 'KNOWLEDGE_SOURCE_VERIFICATION', verificationContract: SOURCE_VERIFICATION_CONTRACT,
    evaluationTaskId: evaluation.taskId, evaluationDigest: sha256(canonicalJson(evaluation.result)) } },
    { snapshotId: 'snapshot', evaluationTaskId: evaluation.taskId, publicationVerified: false, outcome: 'SOURCE_MATCHED', cards: cards.map(card => ({ ...card, outcome: 'SOURCE_MATCHED' })) });
  return { reconstruction, evaluation, fixedEvaluation, sourceVerification, cards, fixedSuites: [{ moduleId: 'module', suiteRef }] };
}
