/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：检查站点资源完整性、离线部署和内容安全边界；不冻结文案和布局。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

test('static pages resolve local assets and anchors under a project subpath', () => {
  for (const page of ['site/index.html', 'web/index.html']) {
    const html = readFileSync(page, 'utf8');
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
    for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) {
      assert.ok(ids.has(anchor), `${page}: missing anchor ${anchor}`);
    }
    for (const [, target] of html.matchAll(/(?:src|href|srcset)="([^"]+)"/g)) {
      if (target.startsWith('#') || /^(?:https?:|data:|mailto:)/.test(target)) continue;
      if (page.startsWith('site/')) assert.ok(!target.startsWith('/'), `${page}: asset assumes domain root: ${target}`);
      const local = target.split(/[?#]/)[0].replace(/^\//, '');
      assert.ok(existsSync(resolve(dirname(page), local)), `${page}: missing asset ${target}`);
    }
    assert.doesNotMatch(html, /(?:src|srcset)="https?:\/\//i, 'rendered assets must remain local');
    assert.doesNotMatch(html, /(?:fonts\.googleapis|fonts\.gstatic|unpkg|jsdelivr)/i);
  }
  for (const path of ['site/Styles.css', 'web/Styles.css']) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /(?:@import|url\(\s*["']?https?:\/\/)/i);
  }
});

test('published release and capture digests match the delivered bytes', () => {
  const release = JSON.parse(readFileSync('site/Release.json', 'utf8'));
  const digest = createHash('sha256');
  // Release.contentDigest 的既有机器格式；新增发布格式时须版本化，而非冻结视觉内容。
  for (const asset of ['App.js', 'index.html', 'Mark.svg', 'SocialCard.svg', 'Styles.css']) {
    digest.update(asset).update('\0').update(readFileSync(`site/${asset}`)).update('\0');
  }
  assert.equal(release.contentDigest, `sha256:${digest.digest('hex')}`);
  for (const asset of [release.featureRelease.capture.gif, release.featureRelease.capture.poster]) {
    assert.equal(createHash('sha256').update(readFileSync(asset.path)).digest('hex'), asset.sha256);
  }
});

test('site and Console content security policies restrict active content', () => {
  for (const [path, connections] of [['site/index.html', "'none'"], ['web/index.html', "'self'"]]) {
    const html = readFileSync(path, 'utf8');
    const policy = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
    assert.ok(policy, `${path}: missing content security policy`);
    const directives = new Map(policy.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }));
    assert.deepEqual(directives.get('default-src'), ["'self'"]);
    assert.deepEqual(directives.get('connect-src'), [connections]);
    if (path.startsWith('web/')) assert.deepEqual(directives.get('object-src'), ["'none'"]);
    assert.ok(!directives.get('script-src')?.some((value) => ["'unsafe-inline'", "'unsafe-eval'", '*'].includes(value)));
  }
});
