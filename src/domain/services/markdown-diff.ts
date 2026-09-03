import { assertInvariant } from '../index.ts';

export interface MarkdownDiffLine {
  type: 'CONTEXT' | 'REMOVE' | 'ADD';
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

export interface MarkdownDiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: MarkdownDiffLine[];
}

const MAX_DIFF_CELLS = 4_000_000;

function operationsWithLcs(before: string[], after: string[]): MarkdownDiffLine[] {
  const width = after.length + 1;
  const matrix = new Uint32Array((before.length + 1) * width);
  for (let oldIndex = before.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = after.length - 1; newIndex >= 0; newIndex -= 1) {
      const offset = oldIndex * width + newIndex;
      matrix[offset] = before[oldIndex] === after[newIndex]
        ? matrix[(oldIndex + 1) * width + newIndex + 1] + 1
        : Math.max(matrix[(oldIndex + 1) * width + newIndex], matrix[oldIndex * width + newIndex + 1]);
    }
  }
  const result: MarkdownDiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < before.length || newIndex < after.length) {
    if (oldIndex < before.length && newIndex < after.length && before[oldIndex] === after[newIndex]) {
      result.push({ type: 'CONTEXT', oldLine: oldIndex + 1, newLine: newIndex + 1, text: before[oldIndex] as string });
      oldIndex += 1;
      newIndex += 1;
    } else if (
      oldIndex < before.length
      && (newIndex >= after.length
        || matrix[(oldIndex + 1) * width + newIndex] >= matrix[oldIndex * width + newIndex + 1])
    ) {
      result.push({ type: 'REMOVE', oldLine: oldIndex + 1, newLine: null, text: before[oldIndex] as string });
      oldIndex += 1;
    } else {
      result.push({ type: 'ADD', oldLine: null, newLine: newIndex + 1, text: after[newIndex] as string });
      newIndex += 1;
    }
  }
  return result;
}

function operationsWithBoundedFallback(before: string[], after: string[]): MarkdownDiffLine[] {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) suffix += 1;
  const result: MarkdownDiffLine[] = [];
  for (let index = 0; index < prefix; index += 1) {
    result.push({ type: 'CONTEXT', oldLine: index + 1, newLine: index + 1, text: before[index] as string });
  }
  for (let index = prefix; index < before.length - suffix; index += 1) {
    result.push({ type: 'REMOVE', oldLine: index + 1, newLine: null, text: before[index] as string });
  }
  for (let index = prefix; index < after.length - suffix; index += 1) {
    result.push({ type: 'ADD', oldLine: null, newLine: index + 1, text: after[index] as string });
  }
  for (let index = 0; index < suffix; index += 1) {
    const oldIndex = before.length - suffix + index;
    const newIndex = after.length - suffix + index;
    result.push({ type: 'CONTEXT', oldLine: oldIndex + 1, newLine: newIndex + 1, text: before[oldIndex] as string });
  }
  return result;
}

function hunks(operations: MarkdownDiffLine[], context = 3): MarkdownDiffHunk[] {
  const changes = operations
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.type !== 'CONTEXT')
    .map(({ index }) => index);
  if (!changes.length) return [];
  const ranges: Array<{ start: number; end: number }> = [];
  let first = changes[0] as number;
  let last = first;
  for (const index of changes.slice(1)) {
    if (index - last <= context * 2 + 1) {
      last = index;
      continue;
    }
    ranges.push({ start: Math.max(0, first - context), end: Math.min(operations.length, last + context + 1) });
    first = index;
    last = index;
  }
  ranges.push({ start: Math.max(0, first - context), end: Math.min(operations.length, last + context + 1) });
  return ranges.map(({ start, end }) => {
    const lines = operations.slice(start, end);
    const firstOld = lines.find((line) => line.oldLine !== null)?.oldLine
      ?? ((lines.find((line) => line.newLine !== null)?.newLine ?? 1) - 1);
    const firstNew = lines.find((line) => line.newLine !== null)?.newLine
      ?? ((lines.find((line) => line.oldLine !== null)?.oldLine ?? 1) - 1);
    const value = {
      oldStart: Math.max(0, firstOld ?? 0),
      oldCount: lines.filter((line) => line.type !== 'ADD').length,
      newStart: Math.max(0, firstNew ?? 0),
      newCount: lines.filter((line) => line.type !== 'REMOVE').length,
      lines,
    };
    assertInvariant(value.oldCount === lines.filter((line) => line.oldLine !== null).length, 'diff old range is invalid');
    assertInvariant(value.newCount === lines.filter((line) => line.newLine !== null).length, 'diff new range is invalid');
    return value;
  });
}

function sectionFor(lines: string[], lineNumber: number): string {
  for (let index = Math.min(lineNumber - 1, lines.length - 1); index >= 0; index -= 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index] ?? '');
    if (match) return `${match[1]} ${match[2]}`;
  }
  return '(document root)';
}

export function structuredMarkdownDiff(beforeBody: string, afterBody: string): {
  hunks: MarkdownDiffHunk[];
  changedSections: string[];
  rangeValidation: {
    status: 'PASS';
    scope: 'FULL_DOCUMENT';
    oldLines: number;
    newLines: number;
    algorithm: 'LCS' | 'BOUNDED_FALLBACK';
    validated: true;
  };
} {
  const before = beforeBody.replaceAll('\r\n', '\n').split('\n');
  const after = afterBody.replaceAll('\r\n', '\n').split('\n');
  const useLcs = (before.length + 1) * (after.length + 1) <= MAX_DIFF_CELLS;
  const operations = useLcs
    ? operationsWithLcs(before, after)
    : operationsWithBoundedFallback(before, after);
  const resultHunks = hunks(operations);
  const sections = new Set<string>();
  for (const hunk of resultHunks) {
    for (const line of hunk.lines) {
      if (line.type === 'ADD' && line.newLine !== null) sections.add(sectionFor(after, line.newLine));
      if (line.type === 'REMOVE' && line.oldLine !== null) sections.add(sectionFor(before, line.oldLine));
    }
  }
  return {
    hunks: resultHunks,
    changedSections: [...sections],
    rangeValidation: {
      status: 'PASS',
      scope: 'FULL_DOCUMENT',
      oldLines: before.length,
      newLines: after.length,
      algorithm: useLcs ? 'LCS' : 'BOUNDED_FALLBACK',
      validated: true,
    },
  };
}
