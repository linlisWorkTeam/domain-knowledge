import { basename, extname } from 'node:path';

const RETIRED = new Map([
  ['score', 'Document score is reported during ingest and is not publication authority.'],
  ['eval', 'Synthetic repeated document scoring was retired; use the independent EvalRunner workflow.'],
  ['harvest', 'Timer harvesting was retired; use scan plus an authorized workflow run.'],
]);

const PASSTHROUGH = new Set([
  '--file', '--content', '--title', '--description', '--category', '--tags',
  '--source', '--source-lines', '--pinned', '--q', '--top', '--action', '--rating', '--note',
]);

function slugFromFile(path: string): string {
  const raw = basename(path, extname(path)).toLowerCase();
  const slug = raw.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'legacy-candidate';
}

function valueAfter(argv: string[], flag: string): string {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1] || argv[index + 1].startsWith('--')) return '';
  return argv[index + 1];
}

function normalizedStatus(value: string): string {
  const statuses = value.split(',').map((status) => status.trim().toLowerCase()).filter(Boolean);
  return statuses.map((status) => {
    if (status === 'verified') return 'VERIFIED';
    if (status === 'draft') return 'CANDIDATE';
    if (status === 'all') return 'CANDIDATE,VERIFIED,LOW_CONFIDENCE,SUPERSEDED';
    throw new Error(`LEGACY_ARGUMENT_UNSUPPORTED: status ${status}`);
  }).join(',');
}

export function translateLegacyArgs(argv: string[]): string[] {
  const filtered = argv.filter((token) => !['--json', '--no-feedback'].includes(token));
  if (filtered.includes('--root')) {
    throw new Error('LEGACY_ARGUMENT_UNSUPPORTED: --root; configure WP_FLYWHEEL_HOME instead');
  }
  const command = filtered[0] ?? 'help';
  const retiredReason = RETIRED.get(command);
  if (retiredReason) throw new Error(`LEGACY_COMMAND_RETIRED: ${command}. ${retiredReason}`);
  if (command === 'help' || command === '--help') return ['help'];
  if (['init', 'status', 'scan'].includes(command)) {
    if (filtered.length !== 1) throw new Error(`LEGACY_ARGUMENT_UNSUPPORTED: ${filtered[1]}`);
    return [command];
  }

  const translated: string[] = [];
  if (command === 'ingest') {
    translated.push('ingest');
    const name = valueAfter(filtered, '--name') || slugFromFile(valueAfter(filtered, '--file'));
    translated.push('--module', name);
    const source = valueAfter(filtered, '--source') || valueAfter(filtered, '--file') || 'legacy-cli';
    translated.push('--source', source);
  } else if (command === 'query') {
    translated.push('query');
  } else if (command === 'get') {
    translated.push('get', '--module', valueAfter(filtered, '--name'));
  } else if (command === 'feedback') {
    translated.push('feedback', '--module', valueAfter(filtered, '--name'));
  } else {
    throw new Error(`LEGACY_COMMAND_UNSUPPORTED: ${command}`);
  }

  for (let index = 1; index < filtered.length; index += 1) {
    const token = filtered[index];
    if (command === 'ingest' && token === '--source') {
      index += 1;
      continue;
    }
    if (['--name', '--force-draft'].includes(token)) {
      if (token === '--name') index += 1;
      continue;
    }
    if (token === '--silent-file') {
      throw new Error('LEGACY_ARGUMENT_UNSUPPORTED: --silent-file; timer state was retired');
    }
    if (token === '--status') {
      translated.push('--status', normalizedStatus(filtered[index + 1] ?? ''));
      index += 1;
      continue;
    }
    if (!PASSTHROUGH.has(token)) throw new Error(`LEGACY_ARGUMENT_UNSUPPORTED: ${token}`);
    translated.push(token);
    if (token !== '--pinned') {
      const value = filtered[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`LEGACY_ARGUMENT_REQUIRED: ${token}`);
      translated.push(value);
      index += 1;
    }
  }
  return translated;
}
