#!/usr/bin/env node
/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：静态检查文档链接、Schema JSON、需求与追踪；不加载生产运行时或第三方依赖。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTraceabilityMatrix } from './TraceabilityValidator.ts';

const componentRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specRoot = join(componentRoot, 'docs', 'specs');
const schemaRoot = join(specRoot, 'schemas');

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function markdownFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? markdownFiles(path) : path.endsWith('.md') ? [path] : [];
  });
}

function validateMarkdown(): number {
  const link = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const path of new Set([...markdownFiles(join(componentRoot, 'docs')), ...readdirSync(componentRoot).filter((name) => name.endsWith('.md')).map((name) => join(componentRoot, name)), ...markdownFiles(join(componentRoot, '.github')), ...markdownFiles(join(componentRoot, 'site'))])) {
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(link)) {
      const target = match[1].split('#', 1)[0].replace(/^<|>$/g, '');
      if (!target || target.includes('://') || target.startsWith('mailto:')) continue;
      let decodedTarget: string;
      try {
        decodedTarget = decodeURIComponent(target);
      } catch {
        throw new Error(`Invalid encoded link in ${path.slice(specRoot.length + 1)}: ${match[1]}`);
      }
      invariant(statSafe(resolve(dirname(path), decodedTarget)), `Broken link in ${path.slice(specRoot.length + 1)}: ${match[1]}`);
    }
  }
  const requirementSources = [
    join(specRoot, 'totalRules', 'Requirements.md'),
    join(specRoot, 'totalRules', 'UiuxDesign.md'),
  ];
  const requirementPattern = /^\| ((?:KF-SYS|KF-UI|NFR)-\d+) \| (P[012]) \| [^|\n]+ \| ([^|\n]+) \|$/gm;
  const requirements = requirementSources.flatMap((path) => {
    const text = readFileSync(path, 'utf8');
    return [...text.matchAll(requirementPattern)].map((match) => ({
      id: match[1], priority: match[2], acceptance: match[3],
    }));
  });
  const requirementIds = requirements.map(({ id }) => id);
  invariant(requirementIds.length === new Set(requirementIds).size, 'Requirement IDs must be unique');

  const acceptanceSources = [
    join(specRoot, 'totalRules', 'UiuxDesign.md'),
    join(specRoot, 'totalRules', 'Verification.md'),
  ];
  const acceptancePattern = /^\| (AC-[A-Z0-9-]+) \| Given/gm;
  const acceptanceIds = acceptanceSources.flatMap((path) => {
    const text = readFileSync(path, 'utf8');
    return [...text.matchAll(acceptancePattern)].map((match) => match[1]);
  });
  invariant(acceptanceIds.length === new Set(acceptanceIds).size, 'Acceptance criterion IDs must be unique');
  const acceptanceSet = new Set(acceptanceIds);
  for (const { id, acceptance } of requirements) {
    const references = acceptance.match(/AC-[A-Z0-9-]+/g) ?? [];
    invariant(references.length > 0, `${id} must reference acceptance criteria`);
    for (const reference of references) {
      invariant(acceptanceSet.has(reference), `${id} references undefined acceptance criterion ${reference}`);
    }
  }

  const trace = readFileSync(join(specRoot, 'totalRules', 'Verification.md'), 'utf8');
  validateTraceabilityMatrix(trace, componentRoot);
  for (const { id, priority } of requirements.filter(({ id, priority }) => priority === 'P0' || id.startsWith('KF-UI-'))) {
    const count = trace.split('\n').filter((line) => line.startsWith(`| ${id} |`)).length;
    invariant(count === 1, `${id} must appear exactly once in traceability matrix; got ${count}`);
  }
  return requirements.filter(({ priority }) => priority === 'P0').length;
}

function statSafe(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

// 文档层只检查 JSON 与标识；Schema 编译及运行时正反例属于 contract:test。
const schemaIds = new Set<string>();
for (const name of readdirSync(schemaRoot).filter((name) => name.endsWith('.schema.json'))) {
  const schema = JSON.parse(readFileSync(join(schemaRoot, name), 'utf8'));
  invariant(typeof schema.$id === 'string' && !schemaIds.has(schema.$id), `Missing or duplicate Schema $id: ${name}`);
  schemaIds.add(schema.$id);
}
JSON.parse(readFileSync(join(componentRoot, 'docs/FileCatalog.json'), 'utf8'));
const requirements = validateMarkdown();
process.stdout.write(`SPEC_LINT_OK schemas=${schemaIds.size} p0=${requirements}\n`);
