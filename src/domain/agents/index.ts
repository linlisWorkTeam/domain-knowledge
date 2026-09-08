import * as Orchestrator from './orchestrator/agent.ts';
import { definition as OrchestratorDefinition } from './orchestrator/prompt.ts';
import * as DocWorker from './doc-worker/agent.ts';
import { definition as DocWorkerDefinition } from './doc-worker/prompt.ts';
import * as DocGen from './doc-gen/agent.ts';
import { definition as DocGenDefinition } from './doc-gen/prompt.ts';
import * as TestGen from './test-gen/agent.ts';
import { definition as TestGenDefinition } from './test-gen/prompt.ts';
import * as Code from './code/agent.ts';
import { definition as CodeDefinition } from './code/prompt.ts';
import * as Check from './check/agent.ts';
import { definition as CheckDefinition } from './check/prompt.ts';
import * as Review from './review/agent.ts';
import { definition as ReviewDefinition } from './review/prompt.ts';

export const agents = {
  'orchestrator': Orchestrator,
  'doc-worker': DocWorker,
  'doc-gen': DocGen,
  'test-gen': TestGen,
  'code': Code,
  'check': Check,
  'review': Review
};
export const roleDefinitions = [OrchestratorDefinition, DocGenDefinition, DocWorkerDefinition, TestGenDefinition, CodeDefinition, CheckDefinition, ReviewDefinition];
