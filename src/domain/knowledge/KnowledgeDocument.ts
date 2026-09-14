/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：校验知识描述并确定性生成单份带 YAML 头的知识文档。
 */

/** 模型生成内容，框架负责描述序列化。 */
export interface KnowledgeDocument { body: string; title: string; description: string; keywords: string[] }

/** 不允许模型插入另一份 YAML 头或空描述；元数据与正文绑定为同一不可变工件。 */
export function renderKnowledgeDocument(document: KnowledgeDocument): string {
  if (!document.title.trim() || !document.description.trim() || !document.keywords.length
    || document.keywords.some((keyword) => !keyword.trim() || keyword !== keyword.trim())
    || new Set(document.keywords).size !== document.keywords.length) throw new Error('KNOWLEDGE_DESCRIPTION_INVALID');
  if (/^\s*---(?:\r?\n|$)/.test(document.body)) throw new Error('KNOWLEDGE_MODEL_FRONTMATTER_DENIED');
  // JSON 字符串与流式数组也是合法 YAML 1.2，固定字段无需引入通用解析器。
  return `---\ntitle: ${JSON.stringify(document.title.trim())}\ndescription: ${JSON.stringify(document.description.trim())}\nkeywords: ${JSON.stringify(document.keywords)}\n---\n\n${document.body}`;
}
