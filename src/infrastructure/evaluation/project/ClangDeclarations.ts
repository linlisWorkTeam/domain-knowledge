/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将Clang语法树投影为无函数体、源码片段和私有成员的接口材料。
 */
import type { NativeDeclaration } from '../../../application/ports/LanguageToolchainPorts.ts';
interface Node {
  id?: string; kind?: string; name?: string; tagUsed?: string; access?: string;
  storageClass?: string; isImplicit?: boolean; completeDefinition?: boolean;
  type?: { qualType?: string }; value?: string; ownedTagDecl?: { id?: string };
  inner?: Node[];
}
const declarationKinds = new Set(['FunctionDecl', 'CXXMethodDecl', 'CXXConstructorDecl', 'CXXDestructorDecl', 'RecordDecl', 'CXXRecordDecl', 'EnumDecl', 'TypedefDecl', 'TypeAliasDecl']);
const containers = new Set(['TranslationUnitDecl', 'NamespaceDecl', 'LinkageSpecDecl', 'RecordDecl', 'CXXRecordDecl']);
export function clangDeclarations(raw: unknown, symbols: string[]): NativeDeclaration[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(symbols) || !symbols.length || symbols.length > 100) throw new Error('NATIVE_INTERFACE_INVALID');
  const root = raw as Node; const ids = new Map<string, Node>();
  const index = (node: Node, depth = 0) => {
    if (depth > 128) throw new Error('NATIVE_AST_TOO_DEEP');
    if (node.id && (!ids.has(node.id) || node.completeDefinition)) ids.set(node.id, node);
    for (const child of node.inner ?? []) index(child, depth + 1);
  };
  index(root);
  const candidates: Array<{ qualified: string; node: Node }> = [];
  const children = (node: Node): Node[] => {
    let access = node.tagUsed === 'class' ? 'private' : 'public';
    return (node.inner ?? []).filter((child) => {
      if (child.kind === 'AccessSpecDecl') { access = child.access ?? access; return false; }
      return access === 'public' && !child.isImplicit;
    });
  };
  const collect = (node: Node, scope: string[]) => {
    if (node.isImplicit) return;
    const name = node.name ? [...scope, node.name].join('::') : scope.join('::');
    if (node.name && declarationKinds.has(node.kind ?? '') && !(node.kind === 'FunctionDecl' && node.storageClass === 'static')) candidates.push({ qualified: name, node });
    if (containers.has(node.kind ?? '')) for (const child of children(node)) collect(child, node.name ? [...scope, node.name] : scope);
  };
  collect(root, []);
  const type = (node: Node) => node.type?.qualType ?? '';
  const owned = (node: Node): Node | undefined => {
    if (node.ownedTagDecl?.id) return ids.get(node.ownedTagDecl.id);
    for (const child of node.inner ?? []) { const found = owned(child); if (found) return found; }
    return undefined;
  };
  const constant = (node: Node): string | undefined => {
    if (typeof node.value === 'string' && /^-?\d+$/.test(node.value)) return node.value;
    for (const child of node.inner ?? []) { const found = constant(child); if (found !== undefined) return found; }
    return undefined;
  };
  const project = (node: Node, name: string): NativeDeclaration => {
    const kind = node.kind ?? 'unknown'; const result: NativeDeclaration = { kind, name };
    if (node.storageClass === 'static') result.static = true;
    if (node.type) result.type = type(node);
    if (['FunctionDecl', 'CXXMethodDecl', 'CXXConstructorDecl', 'CXXDestructorDecl'].includes(kind)) {
      result.parameters = (node.inner ?? []).filter((child) => child.kind === 'ParmVarDecl').map((child) => ({ name: child.name ?? '', type: type(child) }));
    } else if (kind === 'RecordDecl' || kind === 'CXXRecordDecl') {
      const publicChildren = children(node);
      result.fields = publicChildren.filter((child) => child.kind === 'FieldDecl').map((child) => ({ name: child.name ?? '', type: type(child) }));
      result.members = publicChildren.filter((child) => declarationKinds.has(child.kind ?? '') && child.name).map((child) => project(child, child.name!));
    } else if (kind === 'EnumDecl') {
      let next = 0n;
      result.values = (node.inner ?? []).filter((child) => child.kind === 'EnumConstantDecl').map((child) => {
        const value = constant(child) ?? String(next); next = BigInt(value) + 1n;
        return { name: child.name ?? '', value };
      });
    } else if (kind === 'TypedefDecl' || kind === 'TypeAliasDecl') {
      const declaration = owned(node); if (declaration) result.members = [project(declaration, declaration.name ?? name)];
    }
    return result;
  };
  const output: NativeDeclaration[] = [];
  for (const symbol of [...new Set(symbols)].sort()) {
    if (!/^[A-Za-z_][\w]*(?:::[A-Za-z_][\w]*)*$/.test(symbol)) throw new Error('NATIVE_INTERFACE_SYMBOL_INVALID');
    const matches = candidates.filter((candidate) => candidate.qualified === symbol || candidate.qualified.endsWith(`::${symbol}`));
    if (!matches.length) throw new Error(`NATIVE_INTERFACE_SYMBOL_MISSING: ${symbol}`);
    if (new Set(matches.map((match) => match.qualified)).size > 1) throw new Error('NATIVE_INTERFACE_SYMBOL_AMBIGUOUS');
    const unique = new Map<string, NativeDeclaration>();
    for (const match of matches) {
      const result = project(match.node, match.qualified);
      const key = `${result.kind}:${result.name}:${result.type ?? ''}`;
      if (!unique.has(key) || JSON.stringify(result).length > JSON.stringify(unique.get(key)).length) unique.set(key, result);
    }
    output.push(...unique.values());
  }
  return output;
}
