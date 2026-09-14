/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从冻结文本提取完整代码范围，不判断行为或证明符号缺失。
 */
export interface Location { path: string; startLine: number; endLine: number; kind: 'function' | 'declaration' }
export interface CodeEvidence extends Location { content: string }
interface Span { start: number; end: number; kind: Location['kind'] }
/** 屏蔽注释、字符串和预处理行，保留偏移；不展开宏或执行代码。 */
function lexicalText(source: string): { text: string; macros: Span[] } {
  const chars = source.split('');
  const hide = (start: number, end: number) => { for (let i = start; i < end; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' '; };
  const tokens = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|(?:u8|u|U|L)?R"([^\s()\\]{0,16})\([\s\S]*?\)\1"|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g;
  for (const match of source.matchAll(tokens)) hide(match.index, match.index + match[0].length);
  const macros: Span[] = [];
  for (const match of chars.join('').matchAll(/^[ \t]*#[^\n]*(?:\n|$)/gm)) {
    let end = match.index + match[0].length;
    while (/\\\r?\n$/.test(source.slice(match.index, end)) && end < source.length) {
      const next = source.indexOf('\n', end); end = next < 0 ? source.length : next + 1;
    }
    if (/^[ \t]*#[ \t]*define\b/.test(match[0])) macros.push({ start: match.index, end, kind: 'declaration' });
    hide(match.index, end);
  }
  return { text: chars.join(''), macros };
}
/** 有界词法提取。未知或不完整语法显式失败，不回退为猜测或省略片段。 */
function spans(source: string): Span[] {
  const { text, macros } = lexicalText(source);
  const result = [...macros];
  const stack: Array<{ start: number; segment: number; function: boolean; declaration: boolean }> = [];
  let segment = 0, parens = 0;
  const segmentStart = () => stack.at(-1)?.segment ?? segment;
  const advance = (offset: number) => { if (stack.length) stack.at(-1)!.segment = offset; else segment = offset; };
  const first = (offset: number) => { while (offset < text.length && /\s/.test(text[offset]!)) offset++; return offset; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(') parens++;
    if (char === ')') parens--;
    if (char === '{') {
      const start = first(segmentStart());
      const header = text.slice(start, i).trim();
      // 初始化列表中的花括号不是函数体；尚不能可靠解析时，不能从后续逗号处重启函数。
      if (!stack.some((item) => item.function)
        && /\)\s*(?:noexcept(?:\s*\([^{}]*\))?\s*)?(?:try\s*)?:(?!:)/.test(header)) {
        throw new Error('CHECK_SOURCE_BOUNDARY_INVALID: constructor initializer list is unsupported');
      }
      const isFunction = !stack.some((item) => item.function)
        && /\)\s*(?:(?:const|volatile|override|final|noexcept)\b\s*|&&?\s*|->\s*[^{};]+)*$/.test(header)
        && !/^(?:if|for|while|switch|catch)\s*\(/.test(header) && !/[=]\s*\[/.test(header);
      stack.push({ start, segment: i + 1, function: isFunction,
        declaration: /^(?:template\s*<[\s\S]*>\s*)?(?:typedef\s+)?(?:struct|union|enum|class)\b/.test(header) });
    } else if (char === '}') {
      const item = stack.pop();
      if (!item) throw new Error('CHECK_SOURCE_BOUNDARY_INVALID: unmatched closing brace');
      if (item.function) result.push({ start: item.start, end: i + 1, kind: 'function' });
      if (item.function || (!item.declaration && !/^\s*;/.test(text.slice(i + 1)))) advance(i + 1);
    } else if (char === ';' && parens === 0 && !stack.some((item) => item.function)) {
      const start = first(segmentStart());
      if (start < i && !stack.some((item) => item.declaration)) result.push({ start, end: i + 1, kind: 'declaration' });
      advance(i + 1);
    }
  }
  if (stack.length || parens !== 0) throw new Error('CHECK_SOURCE_BOUNDARY_INVALID: incomplete lexical boundary');
  return result;
}
export function extractEvidence(location: Location, source: string): CodeEvidence {
  const lines = source.split('\n');
  if (!Number.isSafeInteger(location.startLine) || !Number.isSafeInteger(location.endLine)
    || location.startLine < 1 || location.endLine < location.startLine || location.endLine > lines.length) {
    throw new Error(`CHECK_LOCATION_INVALID: ${location.path}:${location.startLine}-${location.endLine} outside 1-${lines.length}`);
  }
  const line = (offset: number) => source.slice(0, offset).split('\n').length;
  const matches = spans(source).filter((span) => span.kind === location.kind
    && line(span.start) <= location.startLine && line(span.end - 1) >= location.endLine);
  matches.sort((a, b) => (a.end - a.start) - (b.end - b.start));
  if (matches.length > 1) throw new Error('CHECK_LOCATION_INVALID: ambiguous code boundaries');
  const span = matches[0];
  if (!span) throw new Error(`CHECK_LOCATION_INVALID: ${location.path}:${location.startLine}-${location.endLine} is not inside one complete ${location.kind}`);
  const start = source.lastIndexOf('\n', span.start - 1) + 1;
  const begin = source.slice(start, span.start).trim() ? span.start : start;
  return { ...location, startLine: line(begin), endLine: line(span.end - 1), content: source.slice(begin, span.end) };
}
