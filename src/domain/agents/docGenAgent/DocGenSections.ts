/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：用稳定章节标识组装正文，修订只替换授权章节的内容。
 */
import { StageValidationIssue } from '../StageValidation.ts';
import type { Outline, Output } from './DocGenAgentContract.ts';
import { markdownSections, validateOutlineBody, validateRevision } from './DocGenRevision.ts';

/** 模型不重复生成文档和章节标题，元数据由概要固定；修订仍返回展示元数据。 */
export interface SectionOutput { title: string; description: string; sections: Array<{ sectionId: string; body: string }> }
/** 可交给模型的章节目录，编号仅在本次冻结概要或旧正文中有效。 */
export interface SectionTarget { sectionId: string; heading: string }

/** 按冻结顺序分配章节编号，修订仅公开允许修改的编号。 */
export function sectionTargets(outline?: Outline, revision?: { base: string; headings: Set<string> }): SectionTarget[] {
  return (outline?.sections ?? markdownSections(revision!.base)).map(({ heading }, index) => ({ sectionId: `section-${index + 1}`, heading }))
    .filter(({ heading }) => !revision || revision.headings.has(heading));
}

/** 章节体结构闭合，重复或缺漏通过语义反馈定位，越权章节直接拒绝。 */
export function sectionSchema(): Record<string, unknown> {
  return { type: 'object', required: ['title', 'description', 'sections'], additionalProperties: false, properties: {
    title: { type: 'string', minLength: 1 }, description: { type: 'string', minLength: 1 },
    sections: { type: 'array', minItems: 1, maxItems: 20, items: {
      type: 'object', required: ['sectionId', 'body'], additionalProperties: false,
      properties: { sectionId: { type: 'string', minLength: 1 }, body: { type: 'string', minLength: 1 } },
    } },
  } };
}

function validateSection(body: string, field: string): void {
  if (/\r(?!\n)/.test(body)) throw new StageValidationIssue('DOC_GEN_SECTION_LINE_ENDING_INVALID', field, '章节正文使用 LF 或 CRLF，不能以单独 CR 隐藏标题边界。');
  let fence: { marker: string; length: number } | undefined;
  for (const line of body.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = { marker: marker[1]![0]!, length: marker[1]!.length };
      else if (marker[1]![0] === fence.marker && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = undefined;
      continue;
    }
    if (!fence && (/^ {0,3}#{1,2}(?:[ \t]|$)/.test(line) || /^ {0,3}(?:=+|-+)[ \t]*$/.test(line))) {
      throw new StageValidationIssue('DOC_GEN_SECTION_HEADING_INVALID', field, '章节标题由系统生成；body 只包含章节内容，子主题使用 ###，示例标题放在闭合代码围栏内。');
    }
  }
  if (fence) throw new StageValidationIssue('DOC_GEN_FENCE_UNCLOSED', field, '关闭本章节的代码围栏，不能让围栏跨越其他章节。');
}

/** 将模型段落放入受信骨架，仍运行既有章节范围检查。 */
export function assembleSections(raw: SectionOutput, targets: SectionTarget[], outline?: Outline,
  revision?: { base: string; headings: Set<string> }): Output {
  if (/[\r\n]/.test(raw.title)) throw new StageValidationIssue('DOC_GEN_TITLE_INVALID', 'title', '文档标题只能为单行文本。');
  const allowed = new Set(targets.map(({ sectionId }) => sectionId));
  if (raw.sections.some(({ sectionId }) => !allowed.has(sectionId))) throw new Error('DOC_GEN_SECTION_DENIED');
  if (raw.sections.length !== targets.length || new Set(raw.sections.map(({ sectionId }) => sectionId)).size !== targets.length) {
    throw new StageValidationIssue('DOC_GEN_SECTION_SET_MISMATCH', 'sections', `每个指定编号恰好返回一次：${targets.map(({ sectionId }) => sectionId).join(', ')}。`);
  }
  const bodies = new Map(raw.sections.map(({ sectionId, body }) => {
    validateSection(body, sectionId);
    return [sectionId, body] as const;
  }));
  let body: string;
  if (revision) {
    body = revision.base;
    const sections = markdownSections(revision.base);
    for (let index = sections.length - 1; index >= 0; index--) {
      const section = sections[index]!;
      const replacement = bodies.get(`section-${index + 1}`);
      if (replacement === undefined) continue;
      const newline = revision.base.indexOf('\n', section.start);
      const contentStart = newline < 0 || newline >= section.end ? section.end : newline + 1;
      // 原标题含换行原样保留，边界末尾须有换行才能与下一节分开。
      if (contentStart === section.end) throw new Error('DOC_GEN_REVISION_SECTION_BODY_MISSING');
      const content = replacement.endsWith('\n') ? replacement : `${replacement}\n`;
      if (content === revision.base.slice(contentStart, section.end)) {
        throw new StageValidationIssue('KNOWLEDGE_CORRECTION_NOT_APPLIED', `section-${index + 1}`, '此授权章节未改变，请根据对应 Correction 和证据实际修订正文。');
      }
      body = body.slice(0, contentStart) + content + body.slice(section.end);
    }
    validateRevision(revision.base, body, revision.headings);
  } else {
    if (raw.title !== outline!.title || raw.description !== outline!.description) {
      throw new StageValidationIssue('DOC_GEN_OUTLINE_METADATA_MISMATCH', 'title/description', '逐字使用已确认概要的 title 和 description。');
    }
    body = `# ${outline!.title}\n\n` + targets.map(({ sectionId, heading }) => {
      const content = bodies.get(sectionId)!;
      return `## ${heading}\n${content}${content.endsWith('\n') ? '' : '\n'}`;
    }).join('');
    validateOutlineBody(outline!, body);
  }
  if (body.length < 200) throw new StageValidationIssue('DOC_GEN_BODY_INCOMPLETE', 'sections', '正文至少 200 字符，补充有源码依据的接口、行为和边界说明。');
  return { body, title: outline?.title ?? raw.title, description: outline?.description ?? raw.description };
}
