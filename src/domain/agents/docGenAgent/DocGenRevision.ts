/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：确定知识章节边界并验证定点修订未改变未授权正文。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { Input, Outline } from './DocGenAgentContract.ts';

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
  for (const section of sections) section.text = body.slice(section.start, section.end);
  return sections;
}

/** 校验概要中每个 H2 唯一且可以无损映射到正文标题。 */
export function validateOutline(outline: Outline): void {
  const seen = new Set<string>();
  for (const { heading } of outline.sections) {
    if (heading !== heading.trim() || /[\r\n]/.test(heading) || heading.startsWith('#') || seen.has(heading)) {
      throw new Error('DOC_GEN_OUTLINE_INVALID');
    }
    seen.add(heading);
  }
}

/** 首次正文必须完成概要承诺，不能在两阶段间漏掉或替换章节。 */
export function validateOutlineBody(outline: Outline, body: string): void {
  const sections = markdownSections(body);
  if (sections.length !== outline.sections.length
    || sections.some((section, index) => section.heading !== outline.sections[index]!.heading)) {
    throw new Error('DOC_GEN_OUTLINE_BODY_MISMATCH');
  }
}

/** 只接收带有效评测证据和精确 H2 定位的 Correction，不用模糊意见授权全文改写。 */
export function revisionScope(input: Input): { base: string; headings: Set<string> } | undefined {
  const corrections = input.payload.corrections ?? [];
  if (!corrections.length) return undefined;
  const baseRef = input.payload.baseKnowledgeRef;
  if (!baseRef) throw new Error('DOC_GEN_REVISION_BASE_REQUIRED');
  const base = input.materials.find(({ ref }) => ref.artifactId === baseRef.artifactId)?.content;
  if (typeof base !== 'string') throw new Error('DOC_GEN_REVISION_BASE_INVALID');
  const sections = markdownSections(base);
  const headings = new Set<string>();
  for (const value of corrections) {
    if (!value || typeof value !== 'object') throw new Error('DOC_GEN_CORRECTION_INVALID');
    const correction = value as Record<string, unknown>;
    const path = correction.knowledgePath;
    const prefix = `knowledge/${input.moduleId}.md#`;
    if (typeof path !== 'string' || !path.startsWith(prefix) || !path.slice(prefix.length)) {
      throw new Error('DOC_GEN_CORRECTION_SCOPE_REQUIRED');
    }
    const heading = path.slice(prefix.length);
    if (sections.filter((section) => section.heading === heading).length !== 1) {
      throw new Error('DOC_GEN_CORRECTION_SECTION_AMBIGUOUS');
    }
    if (typeof correction.criterion !== 'string' || !correction.criterion.trim()
      || !Array.isArray(correction.evidenceRefs) || correction.evidenceRefs.length === 0
      || correction.evidenceRefs.some((ref) => !input.materials.some((material) => material.ref.artifactId === (ref as ArtifactRef)?.artifactId))) {
      throw new Error('DOC_GEN_CORRECTION_EVIDENCE_REQUIRED');
    }
    // 尚无细粒度授权协议，显式拒绝范围字段，避免误将局部意见扩展成整个 H2。
    if ('range' in correction) throw new Error('DOC_GEN_CORRECTION_RANGE_UNSUPPORTED');
    headings.add(heading);
  }
  return { base, headings };
}

/** 逐字比较所有未指名区域；不能通过改标题、移动章节或无实际变化假装修订成功。 */
export function validateRevision(base: string, revised: string, allowed: Set<string>): void {
  const before = markdownSections(base);
  const after = markdownSections(revised);
  if (before.length !== after.length || before.some((section, index) => section.heading !== after[index]!.heading)
    || base.slice(0, before[0]?.start ?? base.length) !== revised.slice(0, after[0]?.start ?? revised.length)) {
    throw new Error('KNOWLEDGE_REVISION_OUTSIDE_CORRECTION');
  }
  for (const [index, section] of before.entries()) {
    const current = after[index]!;
    if (allowed.has(section.heading)) {
      if (section.text === current.text) throw new Error('KNOWLEDGE_CORRECTION_NOT_APPLIED');
      if (section.text.split('\n', 1)[0] !== current.text.split('\n', 1)[0]) {
        throw new Error('KNOWLEDGE_REVISION_OUTSIDE_CORRECTION');
      }
    } else if (section.text !== current.text) throw new Error('KNOWLEDGE_REVISION_OUTSIDE_CORRECTION');
  }
}
