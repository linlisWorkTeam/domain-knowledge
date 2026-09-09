/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：固定代表模块的源码、参考测试、依赖摘要与生成前门禁；只读原项目。
 */
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { sha256 } from '../../../domain/Domain.ts';
import type { AutomatedProjectScenario } from '../../../application/services/AutomatedProjectWorkflow.ts';
import type { ModuleBehaviorSuite } from '../../../domain/agents/testGenAgent/ModuleBehaviorSuite.ts';

/** 此版本验收范围与源快照固定，更新必须重新执行完整验收。 */
export const MARKDOWN_LITE_BASELINE = {
  commit: '1bf4c5894b3f196d2e2aba1d8db3aac77aef7095',
  sourcePath: 'src/chat/markdownLite.ts',
  sourceSha256: '8783c8e83822a97dd25a79e35860b6fe5dc8cf5ae663935db33f266edf645e4e',
  referencePath: 'src/chat/markdownLite.test.ts',
  referenceSha256: '0f4db3eda161b93aebb462331deed18c7d3a0d81f96c32a72b68231bf4f8217b',
  lockfilePath: 'pnpm-lock.yaml',
  lockfileSha256: '6d490bc60496109e58b0c0f9222e1c15fc94f9189d9fbafa93c73c3f3881cf4c',
} as const;

/** 固定门禁是人工编写的行为断言，模型开始前持久化；不由生成代码推导预期。 */
export function markdownLiteFixedSuite(): ModuleBehaviorSuite {
  const pairs: Array<[string, string, string]> = [
    ['empty', '', ''], ['blank', ' \n\t\n', ''],
    ['paragraph', 'alpha', '<p>alpha</p>'],
    ['line-break', 'alpha\nbeta', '<p>alpha<br/>beta</p>'],
    ['paragraph-break', 'alpha\n\nbeta', '<p>alpha</p><p>beta</p>'],
    ['crlf', 'alpha\r\nbeta', '<p>alpha<br/>beta</p>'],
    ['html-escape', 'a <script>alert(1)</script> & "q"', '<p>a &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;</p>'],
    ['heading-levels', '# One\n## Two\n### Three\n#### Four', '<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4>'],
    ['heading-limit', '##### Five', '<p>##### Five</p>'],
    ['heading-space', '#NoSpace', '<p>#NoSpace</p>'],
    ['bold', 'Hello **world**', '<p>Hello <strong>world</strong></p>'],
    ['inline-code', 'Value `x < 1`', '<p>Value <code>x &lt; 1</code></p>'],
    ['emphasis-boundary', '(*yes*) and a*no*b', '<p>(<em>yes</em>) and a*no*b</p>'],
    ['emphasis-punctuation', '*one*, *two*!', '<p><em>one</em>, <em>two</em>!</p>'],
    ['unordered', '- a\n* b', '<ul><li>a</li><li>b</li></ul>'],
    ['ordered', '3. a\n9. b', '<ol><li>a</li><li>b</li></ol>'],
    ['list-boundary', 'first\n- item\nlast', '<p>first</p><ul><li>item</li></ul><p>last</p>'],
    ['safe-link', '[docs](https://example.org/a?x=1&y=2)', '<p><a href="https://example.org/a?x=1&amp;y=2" target="_blank" rel="noreferrer noopener">docs</a></p>'],
    ['http-link', '[docs](http://example.org)', '<p><a href="http://example.org" target="_blank" rel="noreferrer noopener">docs</a></p>'],
    ['unsafe-link', '[bad](javascript:alert)', '<p>[bad](javascript:alert)</p>'],
    ['link-space', '[bad](https://example.org/a b)', '<p>[bad](https://example.org/a b)</p>'],
    ['fenced', '```js\nconst a = 1;\n```', '<pre class="md-code" data-lang="js"><code>const a = 1;</code></pre>'],
    ['fenced-escape', '```\n<a>&"\n```', '<pre class="md-code"><code>&lt;a&gt;&amp;&quot;</code></pre>'],
    ['fenced-no-format', '```txt\n**bold**\n```', '<pre class="md-code" data-lang="txt"><code>**bold**</code></pre>'],
    ['fence-trailing-newline', '```\nx\n\n```', '<pre class="md-code"><code>x\n</code></pre>'],
    ['fence-empty', '```\n```', '<pre class="md-code"><code></code></pre>'],
    ['fence-between', 'before\n```x-y\nz\n```\nafter', '<p>before</p><pre class="md-code" data-lang="x-y"><code>z</code></pre><p>after</p>'],
    ['reference-combined', '# Title\n\nHello **world** and `x`\n\n- a\n- b', '<h1>Title</h1><p>Hello <strong>world</strong> and <code>x</code></p><ul><li>a</li><li>b</li></ul>'],
  ];
  return { schemaVersion: 'module-cases-v1', modulePath: MARKDOWN_LITE_BASELINE.sourcePath,
    exportName: 'markdownToHtml', cases: pairs.map(([caseId, input, expected]) => ({
      caseId: `fixed-${caseId}`, description: `固定行为：${caseId}`, args: [input], expected,
    })) };
}

/** 从用户选择的服务器目录构造固定验收任务，无安装、构建全仓库或写原项目动作。 */
export async function createMarkdownLiteScenario(directory: string): Promise<AutomatedProjectScenario> {
  const repositoryRoot = realpathSync(directory);
  for (const [path, expected] of [
    [MARKDOWN_LITE_BASELINE.sourcePath, MARKDOWN_LITE_BASELINE.sourceSha256],
    [MARKDOWN_LITE_BASELINE.referencePath, MARKDOWN_LITE_BASELINE.referenceSha256],
    [MARKDOWN_LITE_BASELINE.lockfilePath, MARKDOWN_LITE_BASELINE.lockfileSha256],
  ]) {
    const result = spawnSync('git', ['show', `${MARKDOWN_LITE_BASELINE.commit}:${path}`], {
      cwd: repositoryRoot, env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
      maxBuffer: 4 * 1024 * 1024, timeout: 10_000,
    });
    if (result.status !== 0 || sha256(result.stdout) !== expected) throw new Error(`MODULE_BASELINE_MISMATCH: ${path}`);
  }
  const isolation = spawnSync(process.env.WP_DSH_BWRAP_BIN || 'bwrap', [
    '--unshare-all', '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib64', '/lib64', '--symlink', 'usr/bin', '/bin', '/bin/true',
  ], { timeout: 5_000, stdio: 'ignore' });
  if (isolation.status !== 0) throw new Error('MODULE_ISOLATION_UNAVAILABLE');
  return {
    schemaVersion: '1.0', name: 'MarkdownLite 独立模块', moduleId: 'markdown-lite', repositoryRoot,
    expectedCommit: MARKDOWN_LITE_BASELINE.commit,
    sourcePaths: [MARKDOWN_LITE_BASELINE.sourcePath], publicInterfacePaths: [],
    allowedGeneratedPaths: [MARKDOWN_LITE_BASELINE.sourcePath],
    moduleContract: { modulePath: MARKDOWN_LITE_BASELINE.sourcePath, exportName: 'markdownToHtml',
      signature: 'export function markdownToHtml(source: string): string;' },
    fixedSuite: markdownLiteFixedSuite(),
    prepareCommands: [], referenceCommands: [], firstIterationCommands: [], finalCommands: [],
  };
}
