import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProjectScenario } from '../../application/services/project-scenario.ts';

export function loadProjectScenario(path: string, repositoryRoot?: string) {
  return parseProjectScenario(JSON.parse(readFileSync(resolve(path), 'utf8')),
    repositoryRoot ? resolve(repositoryRoot) : undefined);
}
