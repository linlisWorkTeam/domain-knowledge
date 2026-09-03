#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { startKnowledgeServer } from '../runner/server.ts';

export {
  createKnowledgeServer,
  mapHttpError,
  resolveServerBinding,
  startKnowledgeServer,
} from '../runner/server.ts';
export type { ServerBinding } from '../runner/server.ts';

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startKnowledgeServer();
}
