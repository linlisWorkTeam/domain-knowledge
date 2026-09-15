/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：共用知识H2边界，供定点修订与测试来源定位。
 */
interface Section { heading: string; start: number; end: number; text: string; }
/** 忽略 fenced code 中的伪标题，并保留原始字节边界供修订范围核验。 */
export function markdownSections(body: string): Section[] {
  const sections: Section[] = [];
  let fence: { marker: string; length: number } | undefined;
  for (const match of body.matchAll(/[^\n]*(?:\n|$)/g)) {
    const line = match[0].replace(/\r?\n$/, '');
    if (!line && match.index === body.length) continue;
    const code = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (code) {
      if (!fence) fence = { marker: code[1]![0]!, length: code[1]!.length };
      else if (code[1]![0] === fence.marker && code[1]!.length >= fence.length && !code[2]!.trim()) fence = undefined;
      continue;
    }
    if (fence) continue;
    // H2 是本版本唯一可定位边界。
    if (sections.length && /^ {0,3}#[ \t]+/.test(line)) throw new Error('DOC_GEN_DOCUMENT_HIERARCHY_INVALID');
    const heading = /^ {0,3}##[ \t]+(.+?)[ \t]*$/.exec(line);
    if (!heading) continue;
    const previous = sections.at(-1);
    if (previous) previous.end = match.index;
    sections.push({ heading: heading[1]!, start: match.index, end: body.length, text: '' });
  }
  if (fence) throw new Error('DOC_GEN_FENCE_UNCLOSED');
  for (const section of sections) section.text = body.slice(section.start, section.end);
  return sections;
}

