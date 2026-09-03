import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const siteRoot = 'site';
const htmlPath = `${siteRoot}/index.html`;
const html = readFileSync(htmlPath, 'utf8');
const css = readFileSync(`${siteRoot}/styles.css`, 'utf8');
const script = readFileSync(`${siteRoot}/app.js`, 'utf8');
const release = JSON.parse(readFileSync(`${siteRoot}/release.json`, 'utf8')) as {
  schemaVersion: number;
  releaseId: string;
  assetVersion: string;
  contentDigest: string;
  contentCommit: string;
  sourceRepository: string;
  evidenceRunId: string;
  siteRoot: string;
};

function themeTokens(source: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(block, `missing theme block: ${selector}`);
  return Object.fromEntries(
    [...block[1].matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)]
      .map((match) => [match[1], match[2].toLowerCase()]),
  );
}

function relativeLuminance(hex: string): number {
  const channels = hex.slice(1).match(/../g)?.map((channel) => Number.parseInt(channel, 16) / 255);
  assert.ok(channels && channels.length === 3, `invalid color: ${hex}`);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const values = [relativeLuminance(foreground), relativeLuminance(background)]
    .sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function assertReadablePalette(
  tokens: Record<string, string>,
  foregrounds: string[],
  label: string,
): void {
  for (const foreground of foregrounds) {
    assert.ok(tokens[foreground], `${label} misses --${foreground}`);
    assert.ok(tokens.bg, `${label} misses --bg`);
    assert.ok(
      contrastRatio(tokens[foreground], tokens.bg) >= 4.5,
      `${label} --${foreground} does not reach WCAG AA against --bg`,
    );
  }
}

test('GitHub Pages site is self-contained and project-path safe', () => {
  for (const path of [
    'index.html', 'styles.css', 'app.js', 'mark.svg', 'social-card.svg', '.nojekyll', 'README.md',
    'release.json',
  ]) {
    assert.equal(existsSync(`${siteRoot}/${path}`), true, `missing site asset: ${path}`);
  }
  assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/, 'local assets must not assume a domain root');
  assert.doesNotMatch(html, /(?:unpkg|jsdelivr|fonts\.googleapis|googletagmanager)/i);
  assert.match(html, /connect-src 'none'/);

  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  for (const match of html.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.has(match[1]), `broken site anchor: #${match[1]}`);
  }

  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)) {
    assert.equal(
      existsSync(resolve(dirname(htmlPath), match[1])),
      true,
      `missing local asset: ${match[1]}`,
    );
  }
});

test('public release marker binds the site assets to their migration source and live evidence', () => {
  assert.equal(release.schemaVersion, 1);
  assert.match(release.releaseId, /^migration-\d{4}-\d{2}-\d{2}-[a-f0-9]{7}$/);
  assert.match(release.contentCommit, /^[a-f0-9]{40}$/);
  assert.equal(release.sourceRepository, 'linlisWorkTeam/wpKnowledge');
  assert.match(release.contentDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(release.assetVersion, /^\d{8}-\d+$/);
  assert.match(release.evidenceRunId, /^[a-f0-9-]{36}$/);
  assert.equal(release.siteRoot, siteRoot);
  assert.ok(html.includes(release.evidenceRunId.slice(0, 8)), 'site must render the evidence Run');
  for (const asset of ['mark.svg', 'styles.css', 'app.js']) {
    assert.ok(html.includes(`./${asset}?v=${release.assetVersion}`), `${asset} must use the release asset version`);
  }
  const digest = createHash('sha256');
  for (const asset of ['app.js', 'index.html', 'mark.svg', 'social-card.svg', 'styles.css']) {
    digest.update(asset).update('\0').update(readFileSync(`${siteRoot}/${asset}`)).update('\0');
  }
  assert.equal(release.contentDigest, `sha256:${digest.digest('hex')}`);
});

test('project site exposes human and Agent onboarding without weakening trust gates', () => {
  const gettingStarted = readFileSync('docs/GETTING_STARTED.md', 'utf8');
  assert.match(html, /data-onboarding-tab="human"/);
  assert.match(html, /data-onboarding-tab="agent"/);
  assert.match(html, /id="agent-setup-prompt"/);
  assert.match(html, /npm run validate:specs/);
  assert.match(html, /不得跳过测试、降低阈值或伪造通过结果/);
  assert.match(html, /不得手工把候选状态改成已验证/);
  assert.match(script, /data-onboarding-panel/);
  assert.match(script, /navigator\.clipboard/);
  for (const command of [
    'npm ci', 'npm run typecheck', 'npm run validate:specs', 'npm test',
    'WP_FLYWHEEL_HOME=.workpanel npm run knowledge -- init',
    'WP_FLYWHEEL_HOME=.workpanel npm run knowledge:serve',
  ]) {
    assert.ok(html.includes(command), `site misses onboarding command: ${command}`);
    assert.ok(gettingStarted.includes(command), `guide misses onboarding command: ${command}`);
  }
  for (const boundary of [
    '不得跳过测试、降低阈值或伪造通过结果',
    '不得手工把候选状态改成已验证',
  ]) {
    assert.ok(html.includes(boundary), `site misses Agent boundary: ${boundary}`);
    assert.ok(gettingStarted.includes(boundary), `guide misses Agent boundary: ${boundary}`);
  }
});

test('public surfaces use consistent Chinese copy and keep only the approved English heading', () => {
  const consoleHtml = readFileSync('web/index.html', 'utf8');
  const consoleScript = readFileSync('web/app.js', 'utf8');
  const socialCard = readFileSync('site/social-card.svg', 'utf8');
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(consoleHtml, /<html lang="zh-CN">/);
  assert.match(html, /<meta property="og:locale" content="zh_CN">/);
  assert.match(consoleHtml, />WORKPANEL · KNOWLEDGE FLYWHEEL</);
  assert.doesNotMatch(html, /English summary|WHY WPKNOWLEDGE|THE FLYWHEEL|USE CASES|LIVE EVIDENCE|GET STARTED|BUILD KNOWLEDGE THAT HOLDS/);
  assert.doesNotMatch(consoleScript, /LANGGRAPH EXECUTION PROJECTION|LATEST GATE|EVENT SEQUENCE|IMMUTABLE EVIDENCE|HUMAN IN THE LOOP|PRODUCTIZATION/);
  assert.doesNotMatch(css, /content:\s*["']EVIDENCE["']/);
  assert.doesNotMatch(socialCard, /Evidence-driven|Spec-driven|Evidence-first|Deterministic Gate|>VERIFIED</);
  assert.match(html, /规范驱动/);
  assert.match(consoleScript, /服务端尚未配置写入令牌。请到“设置”查看配置方法。/);
});

test('UI prototype navigation and frontend spec reflect the reviewed delivery boundary', () => {
  const prototypeHtml = readFileSync('web/prototype/index.html', 'utf8');
  const prototypeScript = readFileSync('web/prototype/app.js', 'utf8');
  const frontendSpec = readFileSync('specs/04-product/frontend-product-design.md', 'utf8');
  const httpApiSpec = readFileSync('specs/10-interfaces/http-api.md', 'utf8');

  for (const label of ['工作区', '操作中心', '飞轮运行', '知识', '图谱', '质量', '评测', '来源']) {
    assert.ok(prototypeHtml.includes(`>${label}<`), `prototype navigation misses Chinese label: ${label}`);
  }
  assert.doesNotMatch(prototypeHtml, /<p>WORKSPACE<\/p>|<p>QUALITY<\/p>|<span>Action center<\/span>|<span>Flywheel runs<\/span>|<small>Workspace owner<\/small>/);
  assert.doesNotMatch(prototypeHtml, /fonts\.googleapis|fonts\.gstatic/);
  assert.match(prototypeScript, /titles=\['操作中心','飞轮运行','知识','图谱探索'\]/);
  assert.match(frontendSpec, /### 前台交付 F1：/);
  assert.match(frontendSpec, /### 系统实施 Phase 1：/);
  assert.match(frontendSpec, /Preview HTTP API 规范/);
  assert.match(httpApiSpec, /\| `GET \/api\/v1\/system\/status` \| Available \|/);
  assert.match(httpApiSpec, /\| `GET \/api\/v1\/knowledge\/:versionId\/lineage` \| Planned \|/);
  assert.match(httpApiSpec, /第一阶段 Action Center 只能从 `FAILED`、`LOW_CONFIDENCE`/);
});

test('site and Console expose the embedded workflow boundary and prompt-only Agent customization', () => {
  const consoleHtml = readFileSync('web/index.html', 'utf8');
  const consoleScript = readFileSync('web/app.js', 'utf8');
  const frontendSpec = readFileSync('specs/04-product/frontend-product-design.md', 'utf8');

  assert.match(html, /基础设施层/);
  assert.match(html, /智能体只能追加提示词/);
  assert.match(html, /id="evidence-demo"/);
  assert.match(html, /官方开发工具包闭环/);
  assert.match(html, /AGENT-CUSTOMIZATION\.md/);
  assert.match(consoleHtml, /data-page="agent-settings"/);
  assert.match(consoleScript, /\/api\/v1\/agents/);
  assert.match(consoleScript, /promptAddon/);
  assert.match(consoleScript, /workflowNodes/);
  assert.match(frontendSpec, /KF-UI-014/);
  assert.match(frontendSpec, /KF-UI-015/);
  assert.match(frontendSpec, /KF-UI-016/);
});

test('project site and Console implement separate light and dark themes', () => {
  const consoleHtml = readFileSync('web/index.html', 'utf8');
  const consoleCss = readFileSync('web/styles.css', 'utf8');
  const consoleScript = readFileSync('web/app.js', 'utf8');
  const frontendSpec = readFileSync('specs/04-product/frontend-product-design.md', 'utf8');
  const siteDark = themeTokens(css, ':root');
  const siteLight = themeTokens(css, ':root[data-theme="light"]');
  const consoleDark = themeTokens(consoleCss, ':root');
  const consoleLight = themeTokens(consoleCss, ':root[data-theme="light"]');

  assert.match(css, /:root\[data-theme="light"\]/);
  assert.match(script, /prefers-color-scheme: light/);
  assert.match(script, /wpknowledge-site-theme/);
  assert.match(script, /function setTheme\(theme, persist = false\)/);
  assert.match(script, /setTheme\(root\.dataset\.theme === 'light' \? 'dark' : 'light', true\)/);
  assert.match(consoleHtml, /id="theme-button"/);
  assert.match(consoleCss, /:root\[data-theme="light"\]/);
  assert.match(consoleScript, /wp-knowledge-theme/);
  assert.match(consoleScript, /function applyTheme\(theme, persist = false\)/);
  assert.match(consoleScript, /applyTheme\(document\.documentElement\.dataset\.theme === 'light' \? 'dark' : 'light', true\)/);
  assert.doesNotMatch(consoleScript, /localStorage\.setItem\([^\n]+token/i);
  assert.match(frontendSpec, /KF-UI-013/);
  assert.match(frontendSpec, /AC-UI-013/);

  const sharedPalette = {
    bg: ['#080b10', '#f4f7f9'],
    surface: ['#10151d', '#ffffff'],
    text: ['#eef2f7', '#17212b'],
    muted: ['#9aa8ba', '#586b7d'],
    success: ['#76efbd', '#087c58'],
    warning: ['#ffd27d', '#92610f'],
    danger: ['#ff7d8e', '#b62f48'],
    governance: ['#c7a6ff', '#7250a8'],
  } as const;
  const siteNames = { accent: 'cyan', success: 'green', warning: 'amber', governance: 'violet' };
  for (const [name, [dark, light]] of Object.entries(sharedPalette)) {
    const siteName = siteNames[name as keyof typeof siteNames] ?? name;
    assert.equal(siteDark[siteName], dark, `site dark --${siteName}`);
    assert.equal(siteLight[siteName], light, `site light --${siteName}`);
    assert.equal(consoleDark[name], dark, `Console dark --${name}`);
    assert.equal(consoleLight[name], light, `Console light --${name}`);
    assert.ok(frontendSpec.toLowerCase().includes(dark), `Spec misses dark ${name} token ${dark}`);
    assert.ok(frontendSpec.toLowerCase().includes(light), `Spec misses light ${name} token ${light}`);
  }
  assert.equal(siteDark.cyan, '#71d4ff', 'site keeps its reviewed cyan accent');
  assert.equal(siteLight.cyan, '#07769f', 'site keeps its reviewed cyan accent');
  assert.equal(consoleDark.accent, '#55e6b5', 'Console uses the F1 green accent');
  assert.equal(consoleLight.accent, '#0b9d72', 'Console uses the F1 green accent');
  assert.equal(consoleDark['accent-text'], '#55e6b5');
  assert.equal(consoleLight['accent-text'], '#087c58');
  for (const token of ['#71d4ff', '#07769f', '#55e6b5', '#0b9d72']) {
    assert.ok(frontendSpec.toLowerCase().includes(token), `Spec misses reviewed accent ${token}`);
  }
  assertReadablePalette(siteDark, ['text', 'muted', 'faint', 'cyan', 'green', 'amber', 'violet', 'danger'], 'site dark');
  assertReadablePalette(siteLight, ['text', 'muted', 'faint', 'cyan', 'green', 'amber', 'violet', 'danger'], 'site light');
  assertReadablePalette(consoleDark, ['text', 'muted', 'faint', 'accent-text', 'success', 'warning', 'governance', 'danger'], 'Console dark');
  assertReadablePalette(consoleLight, ['text', 'muted', 'faint', 'accent-text', 'success', 'warning', 'governance', 'danger'], 'Console light');
});

test('production Console implements the F2 seven-page navigation and truthful data boundary', () => {
  const consoleHtml = readFileSync('web/index.html', 'utf8');
  const consoleCss = readFileSync('web/styles.css', 'utf8');
  const consoleScript = readFileSync('web/app.js', 'utf8');

  for (const label of ['Action Center', 'Flywheel Runs', 'Knowledge', 'Graph', 'Evaluations', 'Sources', 'Agent Settings']) {
    assert.ok(consoleHtml.includes(`>${label}<`) || consoleHtml.includes(`${label} <`), `Console navigation misses ${label}`);
  }
  assert.match(consoleScript, /request\('\/api\/v1\/sources\/scan'\)/);
  assert.match(consoleScript, /\/api\/v1\/knowledge\?q=/);
  assert.match(consoleScript, /\/workflow-nodes/);
  assert.match(consoleScript, /\/workflow-status/);
  assert.match(consoleScript, /\/events\?after=0/);
  assert.match(consoleScript, /Promise\.allSettled/);
  assert.match(consoleScript, /const ATTENTION = new Set\(\['LOW_CONFIDENCE', 'FAILED'\]\)/);
  assert.match(consoleScript, /latestDecision\?\.outcome === 'STOPPED'/);
  assert.doesNotMatch(consoleScript, /\/api\/v1\/(?:transition|evaluate|publish)/);
  assert.doesNotMatch(`${consoleHtml}\n${consoleScript}`, /Workspace owner|87\s*\/\s*100/);
  assert.doesNotMatch(consoleHtml, /fonts\.googleapis|fonts\.gstatic|unpkg|jsdelivr/i);
  for (const visualHook of ['project-card', 'nav-section', 'overview-summary-grid', 'attention-queue', 'overview-rail']) {
    assert.match(`${consoleHtml}\n${consoleScript}`, new RegExp(`class="[^"]*${visualHook}`), `Console misses reference-layout hook ${visualHook}`);
    assert.match(consoleCss, new RegExp(`\\.${visualHook}`), `Console misses reference-layout styling ${visualHook}`);
  }
  assert.match(consoleScript, /不提供模拟 ETA/);
  assert.match(consoleHtml, /role="dialog" aria-modal="true" aria-labelledby="drawer-title"/);
  assert.match(consoleScript, /drawerReturnFocus/);
  assert.match(consoleScript, /event\.key === 'Tab'.*drawer\.classList\.contains\('open'\)/s);
  assert.match(consoleCss, /@media \(max-width: 767px\)/);
  assert.match(consoleCss, /\.sidebar\.open \{ transform: translateX\(0\); \}/);
});

test('write-token setup is discoverable while local secrets remain ignored', () => {
  const consoleScript = readFileSync('web/app.js', 'utf8');
  const envExample = readFileSync('.env.example', 'utf8');
  const gitignore = readFileSync('.gitignore', 'utf8');
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
  assert.match(consoleScript, /复制仓库根目录的 <code>\.env\.example<\/code> 为 <code>\.env\.local<\/code>/);
  assert.match(consoleScript, /WP_KNOWLEDGE_WRITE_TOKEN=请替换为随机长令牌/);
  assert.match(envExample, /^WP_KNOWLEDGE_WRITE_TOKEN=/m);
  assert.match(gitignore, /^\.env\.local$/m);
  assert.match(packageJson.scripts['knowledge:serve'], /--env-file-if-exists=\.env\.local/);
});

test('legacy Pages root is a thin adapter over the site directory', () => {
  const rootEntry = readFileSync('index.html', 'utf8');
  assert.match(rootEntry, /include_relative site\/index\.html/);
  assert.match(rootEntry, /href="\.\/site\//);
  assert.match(rootEntry, /src="\.\/site\//);
  assert.ok(rootEntry.length < 1_000, 'root entry must not become a second copy of the site');
});

test('Pages workflow deploys the static directory only for an Actions source', () => {
  const workflow = readFileSync('.github/workflows/pages.yml', 'utf8');
  const config = YAML.parse(workflow);
  const steps = config.jobs.deploy.steps as Array<{
    name?: string;
    id?: string;
    if?: string;
    uses?: string;
    run?: string;
    with?: { path?: string };
  }>;
  assert.deepEqual(config.on.push.branches, ['main']);
  assert.deepEqual(config.permissions, {
    contents: 'read', pages: 'write', 'id-token': 'write',
  });
  const sourceStep = steps.find((step) => step.id === 'pages-source');
  assert.match(sourceStep?.run ?? '', /\/repos\/\$\{GITHUB_REPOSITORY\}\/pages/);
  assert.match(sourceStep?.run ?? '', /--fail-with-body/);
  assert.match(sourceStep?.run ?? '', /jq -er '\.build_type'/);
  assert.match(sourceStep?.run ?? '', /jq -er '\.source\.branch'/);
  assert.match(sourceStep?.run ?? '', /current_source_branch.*!=.*main/);
  assert.doesNotMatch(sourceStep?.run ?? '', /\|\| echo legacy/);
  assert.doesNotMatch(sourceStep?.run ?? '', /--request PUT/);
  assert.match(sourceStep?.run ?? '', /deploy=false/);
  const configureStep = steps.find((step) => step.uses === 'actions/configure-pages@v6');
  assert.equal(configureStep?.if, "steps.pages-source.outputs.deploy == 'true'");
  const uploadStep = steps.find((step) => step.uses === 'actions/upload-pages-artifact@v5');
  assert.equal(uploadStep?.if, "steps.pages-source.outputs.deploy == 'true'");
  assert.equal(
    uploadStep?.with?.path,
    'site',
  );
  const deployStep = steps.find((step) => step.uses === 'actions/deploy-pages@v5');
  assert.equal(deployStep?.if, "steps.pages-source.outputs.deploy == 'true'");
  assert.equal(existsSync('LICENSE'), true);
  assert.match(readFileSync('LICENSE', 'utf8'), /MIT License/);
});

test('Console sets a restrictive content security policy', () => {
  const consoleHtml = readFileSync('web/index.html', 'utf8');
  assert.match(consoleHtml, /Content-Security-Policy/);
  assert.match(consoleHtml, /default-src 'self'/);
  assert.match(consoleHtml, /connect-src 'self'/);
  assert.match(consoleHtml, /object-src 'none'/);
  assert.match(consoleHtml, /frame-ancestors 'none'/);
});
