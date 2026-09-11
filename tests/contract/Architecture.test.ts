/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证分层依赖方向；不固定模块文件、角色数量或实现语法。
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function imports(source: string): string[] {
  const dependencies: string[] = [];
  // 跳过整段注释/字符串，避免把 Prompt 正文当作依赖；覆盖字面量导入和重导出。
  const tokens = [...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]/g)]
    .map(([token]) => token).filter((token) => !token.startsWith('//') && !token.startsWith('/*'));
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!/^['"]/.test(token)) continue;
    const previous = tokens[i - 1];
    if (previous === 'from' || previous === 'import'
      || previous === '(' && ['import', 'require'].includes(tokens[i - 2] ?? '')) {
      dependencies.push(token.slice(1, -1));
    }
  }
  return dependencies;
}

// 目录只标识架构层的所有权；层内移动、合并文件或重命名不改变判定。
// Domain 的既有资源能力使用 Node 标准库/YAML；数据库和第三方 SDK 留在 Infrastructure。
for (const [layer, forbidden] of Object.entries({
  domain: ['application', 'infrastructure', 'interfaces'],
  application: ['infrastructure', 'interfaces'],
  infrastructure: ['interfaces'],
})) test(`${layer} respects inward dependency direction`, () => {
  for (const path of files(`src/${layer}`).filter((path) =>
    /\.tsx?$/.test(path) && !/\.(?:test|spec)\.tsx?$/.test(path) && !path.includes('/examples/'))) {
    for (const dependency of imports(readFileSync(path, 'utf8'))) {
      if (dependency.startsWith('.')) {
        const targetLayer = relative(resolve('src'), resolve(dirname(path), dependency)).split('/')[0];
        assert.ok(!forbidden.includes(targetLayer), `${path}: forbidden dependency ${dependency}`);
      } else if (layer !== 'infrastructure') {
        assert.ok((dependency.startsWith('node:') && dependency !== 'node:sqlite')
          || (layer === 'domain' && dependency === 'yaml'),
        `${path}: concrete SDK dependency ${dependency}`);
      }
    }
  }
});

test('dependency scanning covers imports and exports without matching prompt prose', () => {
  assert.deepEqual(imports(`
    // import 'fake-comment';
    const prompt = "from 'fake-prompt'";
    import type { Port } from './static.ts';
    export * from './export.ts';
    const adapter = import('./dynamic.ts');
    const legacy = require('./legacy.ts');
    type Shape = import('./type.ts').Shape;
  `), ['./static.ts', './export.ts', './dynamic.ts', './legacy.ts', './type.ts']);
});
