/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：按公开调用族与类型布局划分稳定知识卡片身份。
 */
import { sha256 } from '../../Domain.ts';
import type { NativeDeclaration } from '../sourceScan/PublicInterface.ts';
export interface KnowledgeUnit {
  cardId: string; storageModuleId: string; sourceModule: string; symbol: string;
  declarations: NativeDeclaration[]; supportingTypes: NativeDeclaration[];
}
const callable = new Set(['FunctionDecl', 'CXXMethodDecl', 'CXXConstructorDecl', 'CXXDestructorDecl']);
export function knowledgeUnits(repositoryId: string, sourceModule: string, declarations: NativeDeclaration[]): KnowledgeUnit[] {
  const functions = new Map<string, NativeDeclaration[]>(); const types: NativeDeclaration[] = [];
  for (const declaration of declarations) {
    if (callable.has(declaration.kind)) {
      const group = functions.get(declaration.name) ?? []; group.push(declaration); functions.set(declaration.name, group);
    } else {
      const members = declaration.members ?? [];
      for (const member of members.filter((item) => callable.has(item.kind))) {
        const name = `${declaration.name}::${member.name}`;
        const group = functions.get(name) ?? []; group.push({ ...member, name }); functions.set(name, group);
      }
      if (declaration.kind !== 'CXXRecordDecl' || declaration.fields?.length || members.some((item) => !callable.has(item.kind))) types.push({ ...declaration, members: members.filter((item) => !callable.has(item.kind)) });
    }
  }
  const groups: Array<[string, NativeDeclaration[]]> = [...functions];
  for (const name of [...new Set(types.map((type) => type.name))]) groups.push([`@type:${name}`, types.filter((type) => type.name === name)]);
  return groups.sort(([a], [b]) => a.localeCompare(b)).map(([symbol, entries]) => {
    const cardId = `card-${sha256(JSON.stringify([repositoryId, sourceModule, symbol])).slice(0, 32)}`;
    return { cardId, storageModuleId: `unit-${cardId.slice(5)}`, sourceModule, symbol,
      declarations: [...new Map(entries.map((entry) => [JSON.stringify(entry), entry])).values()], supportingTypes: symbol.startsWith('@type:') ? [] : types };
  });
}
/** 新卡片携带确定性来源尾注，源码版本改变不能误复用旧来源的正文版本。 */
export function cardBodyWithSource(body: string, commit: string, symbol: string): string {
  return `${body.trim()}\n\n---\n\n来源提交：\`${commit}\`；知识单元：\`${symbol}\`。\n`;
}
