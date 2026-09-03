import { statSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIREMENT_ID = /^(?:KF-SYS|KF-UI|NFR)-\d+$/;
const PATH_TOKEN = /`([^`]+)`/g;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

export function validateTraceabilityMatrix(trace: string, componentRoot: string): void {
  const rows = trace.split('\n').filter((line) => {
    const firstCell = line.split('|')[1]?.trim() ?? '';
    return REQUIREMENT_ID.test(firstCell);
  });
  invariant(rows.length > 0, 'Traceability matrix must contain requirement rows');

  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
    invariant(cells.length === 5, `Traceability row must have five columns: ${row}`);
    const [requirementId, acceptance, status, implementation, tests] = cells;
    invariant(acceptance.length > 0, `${requirementId} must reference acceptance criteria`);
    invariant(['Implemented', 'Partial', 'Planned'].includes(status), `${requirementId} has unsupported status ${status}`);

    if (status === 'Planned') {
      invariant(implementation === '—' && tests === '—', `${requirementId} is Planned and must not claim implementation or tests`);
      continue;
    }

    for (const [column, value] of [['implementation', implementation], ['tests', tests]] as const) {
      const paths = [...value.matchAll(PATH_TOKEN)].map((match) => match[1]);
      invariant(paths.length > 0, `${requirementId} ${column} column must contain at least one backticked path`);
      for (const path of paths) {
        invariant(!path.includes('://'), `${requirementId} ${column} path must be repository-relative: ${path}`);
        invariant(exists(resolve(componentRoot, path)), `${requirementId} ${column} path does not exist: ${path}`);
      }
    }
  }
}
