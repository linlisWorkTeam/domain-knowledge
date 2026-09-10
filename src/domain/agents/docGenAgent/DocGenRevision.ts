/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：限定 DocGen 修订目标，并保护纠正范围外的原正文。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { Input } from './DocGenAgentContract.ts';

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
function target(input: Input, path: string): string | null {
  const document = `knowledge/${input.moduleId}.md`;
  if (path === document) return null;
  if (path.startsWith(`${document}#`) && path.length > document.length + 1) return path.slice(document.length + 1);
  if (path.includes('/') || path.includes('\\') || /\.md(?:#|$)/i.test(path)) throw new Error('DOCGEN_CORRECTION_DOCUMENT_MISMATCH');
  return path.replace(/^#+\s*/, '');
}

/** 忽略代码围栏中的标题；同名标题有歧义时拒绝猜测。 */
function section(body: string, title: string): [number, number] {
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
  const matches = headings.filter((heading) => heading.title === title);
  if (matches.length !== 1) throw new Error(`DOCGEN_CORRECTION_SECTION_INVALID: ${title}`);
  const found = matches[0]!;
  return [found.start, headings.find((heading) => heading.start > found.start && heading.level <= found.level)?.start ?? body.length];
}

/** 在模型调用前检查修订材料与定位，不让材料缺失变成新的生成任务。 */
export function validateRevision(input: Input): void {
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
    const title = target(input, correction.knowledgePath);
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
  const titles = corrections.map((correction) => target(input, correction.knowledgePath));
  if (titles.includes(null)) return;
  const unique = [...new Set(titles as string[])];
  const before = outside(body, unique.map((title) => section(body, title)));
  const after = outside(revised, unique.map((title) => section(revised, title)));
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('DOCGEN_REVISION_OUTSIDE_CORRECTIONS');
}
