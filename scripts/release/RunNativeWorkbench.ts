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
import type { StageTask } from '../../src/domain/services/workbench/StageTask.ts';
const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]!, value = process.argv[index + 1];
  if (!['--target', '--repository', '--runtime', '--report', '--resume-task'].includes(key) || !value || args.has(key)) throw new Error('NATIVE_ACCEPTANCE_ARGUMENTS_INVALID');
  args.set(key, value);
}
for (const key of ['--target', '--repository', '--runtime', '--report']) if (!args.has(key)) throw new Error(`NATIVE_ACCEPTANCE_ARGUMENT_REQUIRED: ${key}`);
const targets = JSON.parse(readFileSync(fileURLToPath(new URL('../../tests/fixtures/nativeTargets/Targets.json', import.meta.url)), 'utf8')).targets as Array<{
  name: string; commit: string; language: 'c' | 'cpp'; files: Record<string, string>; scope: string[];
}>;
const target = targets.find((item) => item.name === args.get('--target'));
if (!target) throw new Error('NATIVE_ACCEPTANCE_TARGET_INVALID');
const repository = resolve(args.get('--repository')!);
const git = (...parameters: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...parameters], { cwd: repository, maxBuffer: 4_194_304 });
if (git('rev-parse', `${target.commit}^{commit}`).toString().trim() !== target.commit) throw new Error('NATIVE_ACCEPTANCE_COMMIT_MISMATCH');
for (const [path, digest] of Object.entries(target.files)) if (sha256(git('show', `${target.commit}:${path}`)) !== digest) throw new Error('NATIVE_ACCEPTANCE_INPUT_CHANGED');
const reportPath = resolve(args.get('--report')!); mkdirSync(dirname(reportPath), { recursive: true });
const composition = createComposition({ runtimeDir: resolve(args.get('--runtime')!) });
const controller = new AbortController(); let active: string | null = null;
const report: { schemaVersion: string; target: string; commit: string; startedAt: string; tasks: StageTask[]; outcome: string; published: false; errorCode?: string } = {
  schemaVersion: 'native-workbench-acceptance-v1', target: target.name, commit: target.commit, startedAt: new Date().toISOString(), tasks: [], outcome: 'RUNNING', published: false,
};
const save = () => { writeFileSync(`${reportPath}.tmp`, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); renameSync(`${reportPath}.tmp`, reportPath); };
const cancel = () => { if (active) composition.apps.workbenchStages.cancel(active); controller.abort(new Error('NATIVE_ACCEPTANCE_CANCELLED')); };
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
  if (args.has('--resume-task')) {
    const previous = composition.apps.workbenchStages.get(args.get('--resume-task')!);
    if (previous.input.projectId !== project.projectId || previous.input.sourceRevision !== target.commit) throw new Error('NATIVE_ACCEPTANCE_RESUME_MISMATCH');
    if (previous.status !== 'SUCCEEDED') await wait(composition.apps.workbenchStages.resume(previous.taskId, previous.inputDigest));
  }
  const generated = await wait(await composition.apps.workbenchGeneration.start(project.snapshotId, target.language === 'cpp'
    ? { [target.name]: { entryPath: 'tinyxml2.h', astFilter: 'tinyxml2::XMLUtil', symbols: target.scope.map((symbol) => `tinyxml2::${symbol}`) } }
    : { [target.name]: { entryPath: 'jsmn.h' } }));
  const versionIds = (generated.result!.summary.cards as Array<{ versionId: string }>).map((card) => card.versionId);
  await wait(composition.apps.workbenchStages.start(composition.apps.knowledgeIndex.prepare(versionIds)));
  const reconstructed = await wait(await composition.apps.workbenchReconstruction.start(project.snapshotId, versionIds));
  const evaluated = await wait(await composition.apps.workbenchEvaluation.start(reconstructed.taskId));
  await wait(composition.apps.workbenchStages.start(composition.apps.workbenchAssociations.prepare(versionIds)));
  const modules = evaluated.result!.summary.modules as Array<{ status: string }>;
  report.outcome = modules.every((module) => module.status === 'BEHAVIOR_PASSED') && modules.length === project.modules.length ? 'BEHAVIOR_PASSED_PUBLICATION_PENDING' : 'BEHAVIOR_FAILED';
} catch (error) {
  const code = error instanceof Error ? /^([A-Z][A-Z0-9_]+)(?::|$)/.exec(error.message)?.[1] : null;
  report.outcome = 'INCOMPLETE'; report.errorCode = code ?? 'NATIVE_ACCEPTANCE_FAILED'; process.exitCode = 1;
  console.log(JSON.stringify({ target: report.target, outcome: report.outcome, errorCode: report.errorCode }));
} finally { save(); await composition.close(); process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
