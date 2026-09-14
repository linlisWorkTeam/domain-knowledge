/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：确定知识章节边界并验证定点修订未改变未授权正文。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { Input, Outline } from './DocGenAgentContract.ts';
import { StageValidationIssue } from '../StageValidation.ts';

import { markdownSections } from '../../knowledge/KnowledgeSections.ts';
export { markdownSections } from '../../knowledge/KnowledgeSections.ts';

/** 校验概要中每个 H2 唯一且可以无损映射到正文标题。 */
export function validateOutline(outline: Outline): void {
  if (/[\r\n]/.test(outline.title)) throw new StageValidationIssue('DOC_GEN_TITLE_INVALID', 'title', '文档标题只能为单行文本。');
  const seen = new Set<string>();
  for (const { heading } of outline.sections) {
    if (heading !== heading.trim() || /[\r\n]/.test(heading) || heading.startsWith('#') || seen.has(heading)) {
      throw new StageValidationIssue('DOC_GEN_OUTLINE_INVALID', 'sections.heading', 'H2 标题必须唯一、单行，不含前后空白或 # 前缀。');
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
  if (/\r(?!\n)/.test(base)) throw new Error('DOC_GEN_REVISION_LINE_ENDING_UNSUPPORTED');
  const sections = markdownSections(base);
  const headings = new Set<string>();
  for (const value of corrections) {
    if (!value || typeof value !== 'object') throw new Error('DOC_GEN_CORRECTION_INVALID');
    const correction = value;
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

/** 复用 Review 的版本化纠正意见，不在 DocGen 重新归因。 */
export interface Correction {
  correctionId: string; knowledgePath: string; criterion: string; evidenceRefs: ArtifactRef[]; risk: string;
}

/** 只去掉框架生成的描述头，修订比较针对知识正文。 */
function bodyOf(value: string): string {
  if (!value.startsWith('---\n') && !value.startsWith('---\r\n')) return value;
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n(?:\r?\n)?/.exec(value);
  if (!match) throw new Error('DOCGEN_BASE_DOCUMENT_INVALID');
  return value.slice(match[0].length);
}

/** 基础文档必须是唯一引用指向的非空正文。 */
export function baseBody(input: Input): string | undefined {
  const ref = input.payload.baseKnowledgeRef;
  if (!ref) return undefined;
  const material = input.materials.find((item) => item.ref.artifactId === ref.artifactId);
  if (typeof material?.content !== 'string' || !material.content.trim()) throw new Error('DOCGEN_BASE_DOCUMENT_INVALID');
  const body = bodyOf(material.content);
  if (!body.trim()) throw new Error('DOCGEN_BASE_DOCUMENT_INVALID');
  return body;
}

/** 显式文档路径只能指向当前文档，沿用 Review 的裸章节标题定位。 */
function target(input: { moduleId: string }, path: string): string | null {
  const document = `knowledge/${input.moduleId}.md`;
  if (path === document) return null;
  if (path.startsWith(`${document}#`) && path.length > document.length + 1) return path.slice(document.length + 1);
  if (path.includes('/') || path.includes('\\') || /\.md(?:#|$)/i.test(path)) throw new Error('DOCGEN_CORRECTION_DOCUMENT_MISMATCH');
  return path.replace(/^#+\s*/, '');
}

/** 忽略代码围栏中的标题；同名标题有歧义时拒绝猜测。 */
function headingsOf(body: string) {
  const headings: { title: string; level: number; start: number }[] = [];
  let fence: string | undefined;
  for (const match of body.matchAll(/^.*(?:\r?\n|$)/gm)) {
    const line = match[0].replace(/\r?\n$/, '');
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
      continue;
    }
    if (fence) continue;
    const heading = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) headings.push({ title: heading[2]!, level: heading[1]!.length, start: match.index! });
  }
  return headings;
}

function section(body: string, title: string): [number, number] {
  const headings = headingsOf(body);
  const matches = headings.filter((heading) => heading.title === title);
  if (matches.length !== 1) throw new Error(`DOCGEN_CORRECTION_SECTION_INVALID: ${title}`);
  const found = matches[0]!;
  return [found.start, headings.find((heading) => heading.start > found.start && heading.level <= found.level)?.start ?? body.length];
}

/** Review 与 DocGen 共用定位：唯一原文片段归入所在章节，歧义一律拒绝。 */
export function correctionTarget(body: string, moduleId: string, path: string): string | null {
  const title = target({ moduleId }, path);
  if (title === null) return null;
  try { section(body, title); return title; } catch (error) {
    const first = body.indexOf(path);
    if (first < 0 || body.indexOf(path, first + 1) >= 0) throw error;
    const enclosing = headingsOf(body).filter((heading) => heading.start < first).at(-1)?.title;
    if (!enclosing) throw error;
    section(body, enclosing);
    return enclosing;
  }
}

/** 在模型调用前检查修订材料与定位，不让材料缺失变成新的生成任务。 */
export function validateRevisionInput(input: Input): void {
  const { corrections, qualityFeedback, baseKnowledgeRef } = input.payload;
  if ((corrections?.length || qualityFeedback !== undefined) && !baseKnowledgeRef) throw new Error('DOCGEN_REVISION_BASE_REQUIRED');
  const body = baseBody(input);
  const ids = new Set<string>();
  for (const correction of corrections ?? []) {
    if (!correction || typeof correction !== 'object'
      || !/^COR-[0-9]{4,}$/.test(correction.correctionId) || ids.has(correction.correctionId)
      || typeof correction.knowledgePath !== 'string' || !correction.knowledgePath.trim()
      || !correction.criterion?.trim() || !correction.risk?.trim()
      || !Array.isArray(correction.evidenceRefs) || !correction.evidenceRefs.length) throw new Error('DOCGEN_CORRECTION_INVALID');
    ids.add(correction.correctionId);
    const title = correctionTarget(body!, input.moduleId, correction.knowledgePath);
    if (title !== null) section(body!, title);
  }
}

function outside(body: string, ranges: [number, number][]): string[] {
  const chunks: string[] = [];
  let end = 0;
  for (const [start, stop] of ranges.sort((a, b) => a[0] - b[0])) {
    if (start < end) { end = Math.max(end, stop); continue; }
    chunks.push(body.slice(end, start)); end = stop;
  }
  chunks.push(body.slice(end));
  return chunks;
}

/** 仅章节纠正时，保留所有未涉及正文；语义是否修复交给后续测评。 */
export function validateRevisionOutput(input: Input, revised: string): void {
  const body = baseBody(input);
  const corrections = input.payload.corrections ?? [];
  if (body === undefined || !corrections.length || input.payload.qualityFeedback !== undefined) return;
  const titles = corrections.map((correction) => correctionTarget(body!, input.moduleId, correction.knowledgePath));
  if (titles.includes(null)) return;
  const unique = [...new Set(titles as string[])];
  const before = outside(body, unique.map((title) => section(body, title)));
  const after = outside(revised, unique.map((title) => section(revised, title)));
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('DOCGEN_REVISION_OUTSIDE_CORRECTIONS');
}
