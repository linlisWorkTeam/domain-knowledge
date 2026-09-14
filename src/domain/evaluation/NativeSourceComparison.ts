/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：对公开函数进行有界词法代码比较，不将文本相似度当作行为证据。
 */
import type { NativeDeclaration } from '../sourceScan/PublicInterface.ts';
export const SOURCE_COMPARISON_CONTRACT = 'native-source-comparison-v1';
interface Token { value: string; line: number }
interface File { path: string; content: string }
interface Definition { path: string; startLine: number; endLine: number; tokens: string[] }
const keywords = ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'return', 'throw', 'try', 'catch'];
/** 保留字符串和原始字符串内部内容；注释不会把相邻标识符粘连。 */
function tokenize(text: string, limit = 100000): Token[] {
  const output: Token[] = []; let index = 0, line = 1;
  const advance = (value: string) => { line += (value.match(/\n/g) ?? []).length; index += value.length; };
  while (index < text.length) {
    if (output.length >= limit) throw new Error('TOKEN_LIMIT');
    const rest = text.slice(index); const start = line;
    const white = /^\s+/.exec(rest)?.[0]; if (white) { advance(white); continue; }
    if (rest.startsWith('//')) { advance(rest.slice(0, rest.indexOf('\n') < 0 ? rest.length : rest.indexOf('\n'))); continue; }
    if (rest.startsWith('/*')) { const end = rest.indexOf('*/', 2); if (end < 0) throw new Error('UNTERMINATED_COMMENT'); advance(rest.slice(0, end + 2)); continue; }
    const raw = /^(?:u8|u|U|L)?R"([^\s()\\]{0,16})\(/.exec(rest);
    if (raw) { const end = rest.indexOf(`)${raw[1]}"`, raw[0].length); if (end < 0) throw new Error('UNTERMINATED_LITERAL'); const value = rest.slice(0, end + raw[1]!.length + 2); output.push({ value, line: start }); advance(value); continue; }
    const quote = /^(?:u8|u|U|L)?["']/.exec(rest);
    if (quote) {
      const delimiter = quote[0].at(-1); let end = quote[0].length;
      for (; end < rest.length; end++) { if (rest[end] === '\\') end++; else if (rest[end] === delimiter) break; }
      if (end >= rest.length) throw new Error('UNTERMINATED_LITERAL');
      const value = rest.slice(0, end + 1); output.push({ value, line: start }); advance(value); continue;
    }
    const value = /^(?:[A-Za-z_$][\w$]*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eEpP][+-]?\d+)?[\w.]*|::|->|\+\+|--|&&|\|\||==|!=|<=|>=|<<|>>|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|\.\.\.|.)/.exec(rest)?.[0];
    if (!value) throw new Error('LEXICAL_UNSUPPORTED'); output.push({ value, line: start }); advance(value);
  }
  return output;
}
function closing(tokens: Token[], start: number, left: string, right: string): number {
  let depth = 0;
  for (let index = start; index < tokens.length; index++) { if (tokens[index]!.value === left) depth++; if (tokens[index]!.value === right && --depth === 0) return index; }
  return -1;
}
function functions(declarations: NativeDeclaration[], prefix = ''): NativeDeclaration[] {
  return declarations.flatMap((item) => {
    const name = prefix && !item.name.includes('::') ? `${prefix}::${item.name}` : item.name;
    return ['FunctionDecl', 'CXXMethodDecl'].includes(item.kind) ? [{ ...item, name }]
      : functions(item.members ?? [], name);
  });
}
function scopes(tokens: Token[]): string[] {
  const openings = new Map<number, string>();
  for (let index = 0; index < tokens.length - 2; index++) {
    if (!['namespace', 'class', 'struct'].includes(tokens[index]!.value) || !/^[A-Za-z_]\w*$/.test(tokens[index + 1]!.value)) continue;
    let name = tokens[index + 1]!.value, end = index + 2;
    while (tokens[end]?.value === '::' && /^[A-Za-z_]\w*$/.test(tokens[end + 1]?.value ?? '')) { name += `::${tokens[end + 1]!.value}`; end += 2; }
    for (; end < Math.min(tokens.length, index + 64); end++) {
      if ([';', '=', '}'].includes(tokens[end]!.value)) break;
      if (tokens[end]!.value === '{') { openings.set(end, name); break; }
    }
  }
  const stack: { name: string; depth: number }[] = []; let depth = 0;
  return tokens.map((token, index) => {
    const value = stack.map((item) => item.name).join('::');
    if (token.value === '{') { depth++; if (openings.has(index)) stack.push({ name: openings.get(index)!, depth }); }
    if (token.value === '}') { if (stack.at(-1)?.depth === depth) stack.pop(); depth--; }
    return value;
  });
}
function parameterType(tokens: string[]): string {
  const expanded: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!, next = tokens[index + 1];
    if (token === 'unsigned') { expanded.push(token); if (!['int', 'char', 'short', 'long', '__int128'].includes(next ?? '')) expanded.push('int'); }
    else if (token === 'signed' && next !== 'char') { if (!['int', 'short', 'long', '__int128'].includes(next ?? '')) expanded.push('int'); }
    else if (!(token === 'int' && ['short', 'long'].includes(tokens[index - 1] ?? ''))) expanded.push(token);
  }
  const firstPointer = expanded.findIndex((value) => ['*', '&', '&&', '[', '('].includes(value));
  const boundary = firstPointer < 0 ? expanded.length : firstPointer;
  const base = expanded.slice(0, boundary), qualifiers = base.filter((value) => ['const', 'volatile'].includes(value)).sort();
  return [...qualifiers, ...base.filter((value) => !['const', 'volatile'].includes(value)), ...expanded.slice(boundary)].join(' ');
}
function definitions(files: { path: string; tokens: Token[]; scopes: string[] }[], declaration: NativeDeclaration): Definition[] {
  const output: Definition[] = []; const leaf = declaration.name.split('::').at(-1)!;
  const expected = (declaration.parameters ?? []).map((parameter) => parameterType(tokenize(parameter.type).map((item) => item.value)));
  for (const file of files) for (let index = 0; index < file.tokens.length - 1; index++) {
    const tokens = file.tokens;
    if (tokens[index]!.value !== leaf || tokens[index + 1]!.value !== '(') continue;
    let qualified = leaf; for (let cursor = index - 1; cursor >= 1 && tokens[cursor]!.value === '::'; cursor -= 2) qualified = `${tokens[cursor - 1]!.value}::${qualified}`;
    if (file.scopes[index] && !qualified.startsWith(`${file.scopes[index]}::`)) qualified = `${file.scopes[index]}::${qualified}`;
    if (qualified !== declaration.name) continue;
    const end = closing(tokens, index + 1, '(', ')'); if (end < 0) continue;
    const parameters: string[][] = [[]]; let nested = 0;
    for (const token of tokens.slice(index + 2, end)) {
      if (['(', '[', '<'].includes(token.value)) nested++;
      if ([')', ']', '>'].includes(token.value)) nested--;
      if (token.value === ',' && nested === 0) parameters.push([]); else parameters.at(-1)!.push(token.value);
    }
    if (parameters.length === 1 && (!parameters[0]!.length || parameters[0]!.join('') === 'void')) parameters.length = 0;
    if (parameters.length !== expected.length || parameters.some((parameter, offset) => {
      const equal = parameter.indexOf('='); const value = equal < 0 ? parameter : parameter.slice(0, equal); const type = expected[offset]!;
      return parameterType(value) !== type && !(/^[A-Za-z_]\w*$/.test(value.at(-1) ?? '') && parameterType(value.slice(0, -1)) === type);
    })) continue;
    let body = end + 1; while (['const', 'noexcept', 'override', 'final'].includes(tokens[body]?.value ?? '')) body++;
    if (tokens[body]?.value !== '{') continue;
    const finish = closing(tokens, body, '{', '}'); if (finish < 0) continue;
    output.push({ path: file.path, startLine: tokens[index]!.line, endLine: tokens[finish]!.line, tokens: tokens.slice(body, finish + 1).map((token) => token.value) });
  }
  return output;
}
function structure(tokens: string[]) { return Object.fromEntries(keywords.map((keyword) => [keyword, tokens.filter((token) => token === keyword).length])); }
function difference(reference: string[], generated: string[], budget: { cells: number }) {
  let prefix = 0; while (prefix < reference.length && prefix < generated.length && reference[prefix] === generated[prefix]) prefix++;
  let left = reference.length, right = generated.length; while (left > prefix && right > prefix && reference[left - 1] === generated[right - 1]) { left--; right--; }
  const a = reference.slice(prefix, left), b = generated.slice(prefix, right); let distance: number | null = null;
  const cells = a.length * b.length;
  if (cells <= budget.cells) {
    budget.cells -= cells; let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row++) { const current = [row]; for (let column = 1; column <= b.length; column++) current[column] = Math.min(previous[column]! + 1, current[column - 1]! + 1, previous[column - 1]! + (a[row - 1] === b[column - 1] ? 0 : 1)); previous = current; }
    distance = previous[b.length]!;
  }
  return { exact: !a.length && !b.length, distance, similarity: distance === null ? null : 1 - distance / Math.max(reference.length, generated.length, 1),
    changedTokenRange: { prefix, referenceEnd: left, generatedEnd: right }, referencePreview: a.slice(0, 200).join(' '), generatedPreview: b.slice(0, 200).join(' '), previewTruncated: a.length > 200 || b.length > 200 };
}
export function compareNativeSources(reference: File[], generated: File[], declarations: NativeDeclaration[], scope?: string | null) {
  const budget = { cells: 8000000 }; const unresolved: Array<{ symbol: string; reason: string }> = [];
  let remainingTokens = 100000;
  const prepare = (files: File[]) => files.map((file) => { const tokens = tokenize(file.content, remainingTokens); remainingTokens -= tokens.length; return { path: file.path, tokens, scopes: scopes(tokens) }; });
  if ([...reference, ...generated].reduce((sum, file) => sum + file.content.length, 0) > 8388608) throw new Error('SOURCE_COMPARISON_LIMIT');
  const expected = prepare(reference), actual = prepare(generated);
  const selected = functions(declarations); if (selected.length > 256) throw new Error('SOURCE_COMPARISON_SCOPE_LIMIT');
  const reports = selected.map((original) => {
    const leaf = scope?.split('::').at(-1);
    const declaration = scope && leaf && original.name.startsWith(`${leaf}::`) ? { ...original, name: `${scope}${original.name.slice(leaf.length)}` } : original;
    const symbol = `${declaration.name}(${(declaration.parameters ?? []).map((value) => value.type).join(', ')})`;
    const left = definitions(expected, declaration), right = definitions(actual, declaration);
    if (left.length !== 1 || right.length !== 1) { unresolved.push({ symbol, reason: left.length !== 1 ? 'REFERENCE_DEFINITION_NOT_UNIQUE' : 'GENERATED_DEFINITION_NOT_UNIQUE' }); return { symbol, status: 'UNRESOLVED' as const, referenceMatches: left.length, generatedMatches: right.length }; }
    const a = left[0]!, b = right[0]!; const diff = difference(a.tokens, b.tokens, budget);
    if (diff.distance === null) unresolved.push({ symbol, reason: 'EDIT_DISTANCE_BUDGET_EXCEEDED' });
    return { symbol, status: 'COMPARED' as const, reference: { path: a.path, startLine: a.startLine, endLine: a.endLine, normalized: a.tokens.join(' '), structure: structure(a.tokens) },
      generated: { path: b.path, startLine: b.startLine, endLine: b.endLine, normalized: b.tokens.join(' '), structure: structure(b.tokens) }, ...diff };
  });
  return { schemaVersion: SOURCE_COMPARISON_CONTRACT, available: true, scope: scope ?? null, limits: { tokens: 100000, distanceCells: 8000000, functions: 256 }, method: 'scoped-lexical-levenshtein', formula: '1 - token edit distance / max(reference token count, generated token count, 1)',
    normalization: 'Comments and whitespace removed; identifiers, literals and preprocessor branches retained. Control keyword counts are lexical, not a control-flow graph.',
    behaviorVerified: false, knowledgeErrorProven: false, requested: reports.length, compared: reports.filter((item) => item.status === 'COMPARED').length, unresolved, functions: reports };
}
