/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证工作台重建输入隔离、版本与路径边界。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../../src/domain/Domain.ts';
import { execute } from '../../src/domain/agents/codeAgent/CodeAgent.ts';
import { validateInput, type Input } from '../../src/domain/agents/codeAgent/CodeAgentContract.ts';
import { definition } from '../../src/domain/agents/codeAgent/CodeAgentPrompt.ts';
import type { ExecutionContext } from '../../src/domain/agents/AgentExecution.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';

function sample(language = 'cpp') {
  const path = language === 'typescript' ? 'src/Module.ts' : 'src/Module.cpp';
  const config: Record<string, unknown> = language === 'typescript'
    ? { schemaVersion: 'typescript-build-v1', language, target: 'ES2022', module: 'ESNext', allowedGeneratedPaths: [path] }
    : { schemaVersion: 'native-build-v1', language, build: {}, includePath: path, scope: null,
      behaviorVerified: false, previousGeneratedAttempt: null, allowedGeneratedPaths: [path] };
  const materials = ['Knowledge describes return value', { declarations: ['int calculate();'] }, config, 'REFERENCE_AND_HIDDEN_TEST_SECRET'].map((content) => {
    const bytes = JSON.stringify(content), digest = sha256(bytes);
    return { ref: { artifactId: `sha256:${digest}`, sha256: digest, size: Buffer.byteLength(bytes), mediaType: 'application/json' }, content };
  });
  const input: Input = { payload: { executionContract: 'workbench-code-v1', knowledgeRef: materials[0]!.ref,
    publicInterfaceRefs: [materials[1]!.ref], buildContractRef: materials[2]!.ref, languageId: language, allowedGeneratedPaths: [path] },
  materials, sourcePaths: ['secret.cpp'], publicInterfacePaths: ['secret.hpp'], provenance: [], moduleId: 'module' };
  return { input, config, path };
}
test('workbench Code supports C/C++ and TypeScript only through the explicit contract', () => {
  for (const language of ['c', 'cpp', 'typescript']) {
    const { input } = sample(language); validateInput(input);
    delete input.payload.executionContract;
    assert.throws(() => validateInput(input), /CODE_CONFIGURATION_INVALID/);
  }
  assert.throws(() => validateInput(sample('rust').input), /CODE_LANGUAGE_INVALID/);
});
test('workbench Code rejects hidden material in configuration and mixed input contracts', () => {
  for (const language of ['cpp', 'typescript']) {
    const { input, config } = sample(language);
    config.referenceCommands = ['hidden test'];
    assert.throws(() => validateInput(input), /CODE_CONFIGURATION_INVALID/);
    delete config.referenceCommands;
    input.payload.projectConfigurationRef = input.payload.buildContractRef;
    assert.throws(() => validateInput(input), /CODE_CONFIGURATION_INVALID/);
  }
});
test('workbench Code rejects missing materials, escaping paths and unbound required files', () => {
  const { input } = sample();
  input.payload.allowedGeneratedPaths = ['../escape.cpp'];
  assert.throws(() => validateInput(input), /PROJECT_PATH_DENIED/);
  const next = sample().input; next.materials = [];
  assert.throws(() => validateInput(next), /AGENT_MATERIAL_MISSING/);
  const required = sample().input; required.payload.requiredGeneratedPaths = ['unselected.cpp'];
  assert.throws(() => validateInput(required), /CODE_RECONSTRUCTION_SCOPE_INVALID/);
});
test('workbench Code repair accepts only prior generated files and compiler diagnostics', () => {
  const { input, config, path } = sample();
  const prior = { files: [{ path, content: 'int calculate() { return 4; }' }], knowledgeErrorProven: false,
    diagnostic: { exitCode: 1, timedOut: false, outputLimitExceeded: false, durationMs: 2, stdout: '', stderr: 'missing declaration' } };
  config.previousGeneratedAttempt = prior; validateInput(input);
  prior.files[0]!.path = 'reference.cpp';
  assert.throws(() => validateInput(input), /CODE_CONFIGURATION_INVALID/);
  prior.files[0]!.path = path;
  Object.assign(prior.diagnostic, { expected: 'hidden test answer' });
  assert.throws(() => validateInput(input), /CODE_CONFIGURATION_INVALID/);
});
test('workbench Code passes only referenced materials and grants no repository read paths', async () => {
  const { input, path } = sample();
  let calls = 0;
  const context: ExecutionContext = { command: { schemaVersion: '1.0', commandId: 'code', runId: 'run', agentType: 'code',
    generationKey: 'workbench-code-test', payload: input.payload as unknown as Record<string, unknown> },
  effectivePrompt: definition.basePrompt, iteration: 0, signal: new AbortController().signal,
  model: { assertOutput: assertModelOutput, execute: async (request) => {
    calls++; assert.deepEqual(request.readablePaths, []);
    assert.doesNotMatch(request.prompt, /REFERENCE_AND_HIDDEN_TEST_SECRET|secret\.cpp|secret\.hpp/);
    assert.match(request.prompt, /int calculate/);
    return { files: [{ path, content: 'int calculate() { return 4; }' }] };
  } } };
  const result = await execute(input, context);
  assert.equal(calls, 1); assert.equal(result.output.files[0]!.path, path);
});
