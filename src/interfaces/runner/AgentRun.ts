#!/usr/bin/env node
/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供角色运行的外部入口、参数转换与响应处理。
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AGENT_IDS, type AgentId } from '../../domain/agents/AgentContracts.ts';
import type { AgentExampleInput } from '../../application/services/AgentExample.ts';
import { createComposition } from './Composition.ts';

/** 执行命令行入口请求。 */
export async function main(argv = process.argv.slice(2)) {
  const options = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--role', '--input', '--output', '--provider'].includes(argv[i]!) || !argv[i + 1]) throw new Error('ARGUMENT_INVALID');
    options.set(argv[i]!, argv[i + 1]!);
  }
  const role = options.get('--role') as AgentId;
  if (!AGENT_IDS.includes(role) || !options.get('--input') || !options.get('--output')) throw new Error('ARGUMENT_REQUIRED: --role, --input, --output');
  const sample = JSON.parse(readFileSync(resolve(options.get('--input')!), 'utf8')) as AgentExampleInput;
  if (options.has('--provider')) sample.provider = options.get('--provider') as AgentExampleInput['provider'];
  sample.scenario.repositoryRoot = resolve(sample.scenario.repositoryRoot);
  const outputRoot = resolve(options.get('--output')!);
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(outputRoot, `${role}-`));
  const composition = createComposition({ runtimeDir: join(directory, 'runtime'), ...(sample.provider === 'fixture' ? { agentProviderMode: 'fixture' as const } : {}) });
  const abort = new AbortController(); const cancel = () => abort.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const result = await composition.apps.agentExample.run(role, sample, abort.signal);
    writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    const audit = await composition.apps.orchestrator.buildDemoReport(result.runId);
    writeFileSync(join(directory, 'audit.json'), JSON.stringify(audit, null, 2), { mode: 0o600 });
    return { runId: result.runId, role, provider: sample.provider, outputDirectory: directory, publication: result.publication,
      ...(result.decisionRequired ? { decisionRequired: result.decisionRequired } : {}) };
  } catch (error) {
    writeFileSync(join(directory, 'failure.json'), JSON.stringify({ role, status: abort.signal.aborted ? 'CANCELLED' : 'FAILED', error: error instanceof Error ? error.message.split('\n')[0] : 'AGENT_EXAMPLE_FAILED' }), { mode: 0o600 });
    throw error;
  } finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); composition.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message.split('\n')[0] : 'AGENT_EXAMPLE_FAILED'}\n`); process.exitCode = 1;
  });
}
