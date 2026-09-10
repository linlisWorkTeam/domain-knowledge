/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：以固定开源提交运行真实工作台阶段，保存可追溯编号，不冒充完整发布验收。
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../src/domain/Domain.ts';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { PIPELINE_CONTRACT, pipelineFixedFailure, pipelineSourceFailure, type WorkbenchPipeline } from '../../src/domain/services/workbench/WorkbenchPipeline.ts';
import { canonicalJson, type StageTask } from '../../src/domain/services/workbench/StageTask.ts';
const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]!, value = process.argv[index + 1];
  if (!['--target', '--repository', '--runtime', '--report', '--resume-task', '--mode', '--resume-pipeline', '--material-ids'].includes(key) || !value || args.has(key)) throw new Error('NATIVE_ACCEPTANCE_ARGUMENTS_INVALID');
  args.set(key, value);
}
for (const key of ['--target', '--repository', '--runtime', '--report']) if (!args.has(key)) throw new Error(`NATIVE_ACCEPTANCE_ARGUMENT_REQUIRED: ${key}`);
const mode = args.get('--mode') ?? 'steps';
const materialIds = args.has('--material-ids') ? args.get('--material-ids')!.split(',') : [];
if (args.has('--material-ids') && (args.has('--resume-task') || args.has('--resume-pipeline'))) throw new Error('NATIVE_ACCEPTANCE_ARGUMENTS_INVALID');
if (!['steps', 'pipeline'].includes(mode) || (args.has('--resume-pipeline') && mode !== 'pipeline') || (args.has('--resume-task') && mode !== 'steps')) throw new Error('NATIVE_ACCEPTANCE_ARGUMENTS_INVALID');
const targets = JSON.parse(readFileSync(fileURLToPath(new URL('../../tests/fixtures/nativeTargets/Targets.json', import.meta.url)), 'utf8')).targets as Array<{
  name: string; commit: string; language: 'c' | 'cpp'; files: Record<string, string>; scope: string[]; fixedSuite: { path: string; sha256: string; caseCount: number };
}>;
const target = targets.find((item) => item.name === args.get('--target'));
if (!target) throw new Error('NATIVE_ACCEPTANCE_TARGET_INVALID');
const suiteBytes = readFileSync(fileURLToPath(new URL(`../../tests/fixtures/nativeTargets/${target.fixedSuite.path}`, import.meta.url)));
if (sha256(suiteBytes) !== target.fixedSuite.sha256) throw new Error('NATIVE_ACCEPTANCE_FIXED_SUITE_CHANGED');
const fixedSuite = JSON.parse(suiteBytes.toString('utf8')) as import('../../src/domain/services/evaluation/NativeBehaviorSuite.ts').NativeBehaviorSuite;
if (fixedSuite.cases.length !== target.fixedSuite.caseCount) throw new Error('NATIVE_ACCEPTANCE_FIXED_SUITE_CHANGED');
const repository = resolve(args.get('--repository')!);
const git = (...parameters: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...parameters], { cwd: repository, maxBuffer: 4_194_304 });
if (git('rev-parse', `${target.commit}^{commit}`).toString().trim() !== target.commit) throw new Error('NATIVE_ACCEPTANCE_COMMIT_MISMATCH');
for (const [path, digest] of Object.entries(target.files)) if (sha256(git('show', `${target.commit}:${path}`)) !== digest) throw new Error('NATIVE_ACCEPTANCE_INPUT_CHANGED');
const reportPath = resolve(args.get('--report')!); mkdirSync(dirname(reportPath), { recursive: true });
const composition = createComposition({ runtimeDir: resolve(args.get('--runtime')!) });
const controller = new AbortController(); let active: string | null = null; let activePipeline: string | null = null;
const report: { schemaVersion: string; mode: string; pipeline?: WorkbenchPipeline; target: string; commit: string; startedAt: string; tasks: StageTask[]; outcome: string; published: false; errorCode?: string } = {
  schemaVersion: 'native-workbench-acceptance-v3', mode, target: target.name, commit: target.commit, startedAt: new Date().toISOString(), tasks: [], outcome: 'RUNNING', published: false,
};
const save = () => { writeFileSync(`${reportPath}.tmp`, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); renameSync(`${reportPath}.tmp`, reportPath); };
const cancel = () => { if (activePipeline) composition.apps.workbenchPipelines.cancel(activePipeline); if (active) composition.apps.workbenchStages.cancel(active); controller.abort(new Error('NATIVE_ACCEPTANCE_CANCELLED')); };
process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
async function wait(task: StageTask): Promise<StageTask> {
  active = task.taskId; const position = report.tasks.findIndex((item) => item.taskId === task.taskId);
  const slot = position < 0 ? report.tasks.push(task) - 1 : position;
  const refresh = () => { const current = composition.apps.workbenchStages.get(task.taskId); report.tasks[slot] = current; save();
    console.log(JSON.stringify({ target: report.target, stage: current.input.stage, taskId: current.taskId, status: current.status, reasonCode: current.reasonCode, usage: current.usage })); };
  refresh(); const timer = setInterval(refresh, 10000);
  try { const current = await composition.apps.workbenchStages.wait(task.taskId, controller.signal); refresh();
    if (current.status !== 'SUCCEEDED') throw new Error(current.reasonCode ?? `STAGE_${current.status}`); return current;
  } finally { clearInterval(timer); active = null; }
}
try {
  const settings = composition.apps.providerOperations.getSettings();
  if (!settings.enabled || settings.verification.status !== 'VERIFIED') throw new Error('NATIVE_ACCEPTANCE_REAL_PROVIDER_REQUIRED');
  const project = await composition.apps.workbenchProjects.create({ directory: repository, revision: target.commit, moduleIds: [target.name] });
  const scopes = target.language === 'cpp'
    ? { [target.name]: { entryPath: 'tinyxml2.h', astFilter: 'tinyxml2::XMLUtil', symbols: target.scope.map((symbol) => `tinyxml2::${symbol}`) } }
    : { [target.name]: { entryPath: 'jsmn.h' } };
  if (mode === 'pipeline') {
    const app = composition.apps.workbenchPipelines;
    composition.apps.workbenchStages.recover(); app.recover();
    let pipeline: WorkbenchPipeline;
    if (args.has('--resume-pipeline')) {
      pipeline = app.get(args.get('--resume-pipeline')!);
      if (pipeline.contractVersion !== PIPELINE_CONTRACT) throw new Error('PIPELINE_CONTRACT_READ_ONLY');
      if (pipeline.children.GENERATE?.input.parameters.snapshotId !== project.snapshotId) throw new Error('NATIVE_ACCEPTANCE_RESUME_MISMATCH');
      const fixed = pipeline.fixedSuites;
      if (fixed?.length !== 1 || fixed[0]!.moduleId !== target.name || !await composition.artifacts.verify(fixed[0]!.suiteRef)
        || canonicalJson(JSON.parse(Buffer.from(await composition.artifacts.get(fixed[0]!.suiteRef)).toString('utf8'))) !== canonicalJson(fixedSuite)) throw new Error('NATIVE_ACCEPTANCE_FIXED_SUITE_CHANGED');
      if (pipeline.status !== 'SUCCEEDED') pipeline = app.resume(pipeline.pipelineId, pipeline.inputDigest);
    } else pipeline = await app.start(project.snapshotId, scopes, materialIds, [{ moduleId: target.name, suite: fixedSuite }]);
    activePipeline = pipeline.pipelineId;
    const refresh = () => { const detail = app.detail(pipeline.pipelineId); report.pipeline = detail.pipeline; report.tasks = detail.tasks; save();
      console.log(JSON.stringify({ target: target.name, pipelineId: pipeline.pipelineId, stage: detail.pipeline.currentStage, status: detail.pipeline.status, reasonCode: detail.pipeline.reasonCode, usage: detail.usage })); };
    refresh(); const timer = setInterval(refresh, 10000);
    try { const final = await app.wait(pipeline.pipelineId); refresh();
      if (final.status !== 'SUCCEEDED') throw new Error(final.reasonCode ?? `PIPELINE_${final.status}`);
      const round = final.iterations?.at(-1);
      if (!round?.fixedEvaluation || !round.reconstruction) throw new Error('NATIVE_ACCEPTANCE_FIXED_RESULT_MISSING');
      const fixedReason = pipelineFixedFailure(composition.apps.workbenchStages.get(round.fixedEvaluation.taskId), round.reconstruction.taskId);
      if (fixedReason) throw new Error(fixedReason);
      report.outcome = 'FIXED_BEHAVIOR_AND_SOURCE_PASSED_PUBLICATION_PENDING';
    } finally { clearInterval(timer); activePipeline = null; }
  } else {
  if (args.has('--resume-task')) {
    const previous = composition.apps.workbenchStages.get(args.get('--resume-task')!);
    if (previous.input.projectId !== project.projectId || previous.input.sourceRevision !== target.commit) throw new Error('NATIVE_ACCEPTANCE_RESUME_MISMATCH');
    if (previous.status !== 'SUCCEEDED') await wait(composition.apps.workbenchStages.resume(previous.taskId, previous.inputDigest));
  }
  const generated = await wait(await composition.apps.workbenchGeneration.start(project.snapshotId, scopes));
  const versionIds = (generated.result!.summary.cards as Array<{ versionId: string }>).map((card) => card.versionId);
  await wait(composition.apps.workbenchStages.start(composition.apps.knowledgeIndex.prepare(versionIds)));
  const reconstructed = await wait(await composition.apps.workbenchReconstruction.start(project.snapshotId, versionIds));
  const evaluated = await wait(await composition.apps.workbenchEvaluation.start(reconstructed.taskId));
  const modules = evaluated.result!.summary.modules as Array<{ status: string }>;
  if (!modules.length || modules.length !== project.modules.length || modules.some(module => module.status !== 'BEHAVIOR_PASSED')) {
    report.outcome = 'BEHAVIOR_FAILED'; process.exitCode = 1;
  } else {
    const fixed = await wait(await composition.apps.workbenchFixedEvaluation.start(reconstructed.taskId, [{ moduleId: target.name, suite: fixedSuite }]));
    const fixedReason = pipelineFixedFailure(fixed, reconstructed.taskId);
    if (fixedReason) throw new Error(fixedReason);
    const source = await wait(await composition.apps.workbenchSourceVerification.start(evaluated.taskId));
    const reason = pipelineSourceFailure(source);
    if (reason) throw new Error(reason);
    await wait(composition.apps.workbenchStages.start(composition.apps.workbenchAssociations.prepare(versionIds, materialIds)));
    report.outcome = 'FIXED_BEHAVIOR_AND_SOURCE_PASSED_PUBLICATION_PENDING';
  }
  }
} catch (error) {
  const code = error instanceof Error ? /^([A-Z][A-Z0-9_]+)(?::|$)/.exec(error.message)?.[1] : null;
  report.outcome = 'INCOMPLETE'; report.errorCode = code ?? 'NATIVE_ACCEPTANCE_FAILED'; process.exitCode = 1;
  console.log(JSON.stringify({ target: report.target, outcome: report.outcome, errorCode: report.errorCode }));
} finally { save(); await composition.close(); process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
