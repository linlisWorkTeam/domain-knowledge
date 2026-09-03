const content = document.querySelector('#page-content')
const nav = document.querySelector('#primary-nav')
const title = document.querySelector('#page-title')
const description = document.querySelector('#page-description')
const registryIndicator = document.querySelector('#registry-indicator')
const registryLabel = document.querySelector('#registry-label')
const governanceCount = document.querySelector('#governance-count')
const modePill = document.querySelector('#mode-pill')
const themeButton = document.querySelector('#theme-button')
const operatorButton = document.querySelector('#operator-button')
const operatorDialog = document.querySelector('#operator-dialog')
const operatorForm = document.querySelector('#operator-form')
const operatorToken = document.querySelector('#operator-token')
const operatorCancel = document.querySelector('#operator-cancel')
const runtimeFooter = document.querySelector('#runtime-footer')
const drawer = document.querySelector('#detail-drawer')
const drawerTitle = document.querySelector('#drawer-title')
const drawerContent = document.querySelector('#drawer-content')
const drawerClose = document.querySelector('#drawer-close')
const drawerBackdrop = document.querySelector('#drawer-backdrop')
const toast = document.querySelector('#toast')

function applyTheme(theme, persist = false) {
  const normalized = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = normalized
  themeButton.textContent = normalized === 'dark' ? '☼ 浅色' : '◐ 深色'
  themeButton.setAttribute('aria-label', normalized === 'dark' ? '切换到浅色主题' : '切换到深色主题')
  if (persist) {
    try { localStorage.setItem('wp-knowledge-theme', normalized) } catch {}
  }
}

let initialTheme = 'dark'
try {
  const savedTheme = localStorage.getItem('wp-knowledge-theme')
  initialTheme = savedTheme === 'light' || savedTheme === 'dark'
    ? savedTheme
    : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
} catch {}
applyTheme(initialTheme)

const PAGE_META = {
  overview: ['运行概览', '查看运行状态、知识发布进度，以及需要人工处理的问题。'],
  runs: ['运行', '沿着节点、评测和事件记录，查看每次运行的完整过程。'],
  knowledge: ['知识', '检索候选知识和已验证知识，核对来源、版本与发布依据。'],
  governance: ['治理', '集中处理已停止、低置信或基础设施失败的运行。正常迭代会自动继续。'],
  evidence: ['证据', '核对评测报告、门禁判定、工具链和不可变证据。'],
  agents: ['智能体', '查看每个智能体的固定职责，并为后续运行补充提示词。'],
  settings: ['设置', '查看本地运行能力、安全边界和治理写入配置。'],
}

const UI_LABELS = {
  CREATED: '已创建', PLANNED: '已计划', GENERATING: '生成中', EVALUATING: '评测中',
  REVIEWING: '复核中', ITERATING: '迭代中', ROLLING_BACK: '回滚中', PUBLISHING: '发布中',
  VERIFIED: '已验证', LOW_CONFIDENCE: '低置信', FAILED: '失败', CANCELLED: '已取消',
  CANDIDATE: '候选', SUPERSEDED: '已替代', ACCEPTED: '质量合格', REJECTED: '质量未通过',
  PASS: '通过', ITERATE: '继续迭代', ROLLBACK: '回滚', STOPPED: '已停止',
  PENDING: '等待中', RUNNING: '运行中', COMPLETED: '已完成', COMMITTED: '已提交',
}

const EVENT_LABELS = {
  RunCreated: '创建运行', RunStateChanged: '运行状态变化', NodeCompleted: '节点完成',
  GateDecided: '门禁完成判定', KnowledgePublished: '知识已发布',
}

const NODE_LABELS = {
  orchestrator: '编排', doc_gen: '文档生成', doc_worker: '文档分块', test_gen: '测试生成',
  code: '代码生成', check: '检查', review: '复核', evaluate: '评测', publish: '发布',
}

const AGENT_LABELS = {
  orchestrator: '编排智能体', 'doc-gen': '文档生成智能体', 'doc-worker': '文档分块智能体',
  'test-gen': '测试生成智能体', code: '代码生成智能体', check: '检查智能体', review: '复核智能体',
}

function displayLabel(value) {
  return UI_LABELS[value] ?? value
}

const TERMINAL = new Set(['VERIFIED', 'LOW_CONFIDENCE', 'FAILED', 'CANCELLED'])
const ATTENTION = new Set(['LOW_CONFIDENCE', 'FAILED'])
const state = {
  page: 'overview',
  status: null,
  capabilities: null,
  runs: [],
  knowledge: [],
  agents: [],
  token: '',
  operatorMode: false,
  selectedRun: null,
}

function needsAttention(run) {
  return ATTENTION.has(run.state) || run.latestDecision?.outcome === 'STOPPED'
}

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;')

const json = (value) => escapeHtml(JSON.stringify(value, null, 2))

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) }
  if (options.body) headers['content-type'] = 'application/json'
  if (state.token) headers.authorization = `Bearer ${state.token}`
  const response = await fetch(path, { ...options, headers })
  let payload = null
  try { payload = await response.json() } catch { payload = null }
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `${response.status} ${path}`)
    error.status = response.status
    throw error
  }
  return payload
}

function badge(value, label = displayLabel(value)) {
  const className = String(value || 'unknown').toLowerCase().replaceAll('_', '-')
  return `<span class="badge ${escapeHtml(className)}"><i aria-hidden="true"></i>${escapeHtml(label)}</span>`
}

function shortId(value, size = 12) {
  const text = String(value ?? '')
  return text.length > size ? `${text.slice(0, size)}…` : text
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date)
}

function relativeTime(value) {
  const milliseconds = Date.now() - new Date(value).valueOf()
  if (!Number.isFinite(milliseconds)) return '—'
  const minutes = Math.round(milliseconds / 60_000)
  if (Math.abs(minutes) < 1) return '刚刚'
  if (Math.abs(minutes) < 60) return `${Math.abs(minutes)} 分钟前`
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return `${Math.abs(hours)} 小时前`
  return `${Math.abs(Math.round(hours / 24))} 天前`
}

function emptyState(titleText, body, action = '') {
  return `<div class="empty-state"><span aria-hidden="true">◇</span><h3>${escapeHtml(titleText)}</h3><p>${escapeHtml(body)}</p>${action}</div>`
}

function metric(label, value, hint, tone = '') {
  return `<article class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`
}

function runRow(run, compact = false) {
  return `<button class="run-row" data-run-id="${escapeHtml(run.runId)}">
    <span class="run-identity"><b>${escapeHtml(run.moduleId)}</b><small>${escapeHtml(shortId(run.runId, 18))}</small></span>
    ${badge(run.state)}
    <span class="iteration">第 ${escapeHtml(run.iteration + 1)} 轮</span>
    <span class="updated">${escapeHtml(relativeTime(run.updatedAt))}</span>
    ${compact ? '' : '<span class="row-arrow" aria-hidden="true">→</span>'}
  </button>`
}

function setPageMeta(page) {
  const [nextTitle, nextDescription] = PAGE_META[page] ?? PAGE_META.overview
  title.textContent = nextTitle
  description.textContent = nextDescription
  for (const item of nav.querySelectorAll('[data-page]')) item.classList.toggle('active', item.dataset.page === page)
}

function renderOverview() {
  const active = state.runs.filter((run) => !TERMINAL.has(run.state))
  const attention = state.runs.filter(needsAttention)
  const status = state.status ?? {}
  const recent = state.runs.slice(0, 6)
  content.innerHTML = `
    <section class="metrics-grid" aria-label="关键指标">
      ${metric('全部运行', status.runs ?? state.runs.length, `${active.length} 个正在运行`)}
      ${metric('已验证知识', status.verified ?? 0, `${status.publications ?? 0} 条发布记录`, 'success')}
      ${metric('候选知识', status.candidates ?? 0, `${status.qualityRejected ?? 0} 条未通过质量检查`, 'candidate')}
      ${metric('需要治理', attention.length, attention.length ? '需要人工查看' : '当前没有阻塞', attention.length ? 'danger' : '')}
    </section>
    <div class="dashboard-grid">
      <section class="panel attention-panel">
        <div class="section-heading"><div><p class="eyebrow">需要处理</p><h2>待人工确认</h2></div><button class="text-button" data-page-link="governance">查看全部</button></div>
        <div class="stack-list">${attention.length ? attention.slice(0, 4).map((run) => runRow(run, true)).join('') : emptyState('目前没有待处理事项', '正常运行会由工作流服务自动推进。')}</div>
      </section>
      <section class="panel trust-panel">
        <div class="section-heading"><div><p class="eyebrow">信任边界</p><h2>能力边界</h2></div></div>
        <ul class="capability-list">
          <li><span>知识登记簿与工件库</span>${badge('VERIFIED', '可用')}</li>
          <li><span>自动工作流</span>${badge('LOW_CONFIDENCE', state.capabilities?.automatedWorkflow ? '已启用' : '尚未接入')}</li>
          <li><span>受信项目评测</span>${badge('VERIFIED', '可用')}</li>
          <li><span>智能体源码隔离</span>${badge(state.capabilities?.agentSourceIsolation === 'bubblewrap' ? 'VERIFIED' : 'LOW_CONFIDENCE', state.capabilities?.agentSourceIsolation === 'bubblewrap' ? '已启用' : '未证明')}</li>
          <li><span>敌对代码执行隔离</span>${badge('FAILED', '未实现')}</li>
        </ul>
      </section>
    </div>
    <section class="panel recent-panel">
        <div class="section-heading"><div><p class="eyebrow">最近活动</p><h2>最近运行</h2></div><button class="text-button" data-page-link="runs">查看全部</button></div>
      <div class="run-list">${recent.length ? recent.map((run) => runRow(run)).join('') : emptyState('还没有运行记录', '可以通过命令行或受信项目验收创建运行；通用启动接口完成后，这里也会开放启动入口。')}</div>
    </section>`
}

function renderRuns() {
  if (state.selectedRun) {
    renderRunWorkspace(state.selectedRun)
    return
  }
  content.innerHTML = `
    <section class="page-actions">
      <div class="segmented" role="group" aria-label="运行状态筛选">
        <button class="active" data-run-filter="">全部</button>
        <button data-run-filter="active">运行中</button>
        <button data-run-filter="VERIFIED">已验证</button>
        <button data-run-filter="attention">需要治理</button>
      </div>
      <span>${badge(state.capabilities?.automatedWorkflow ? 'VERIFIED' : 'LOW_CONFIDENCE', state.capabilities?.automatedWorkflow ? '工作流可用' : '工作流未连接')}</span>
    </section>
    <section class="panel workflow-start-panel">
      <div><p class="eyebrow">固定验收场景</p><h2>启动示例项目自动运行</h2><p>系统将按固定场景完成编排、评测和发布门禁。这里只适合运行受信项目，不能用来隔离来路不明的代码。</p></div>
      <form id="workflow-start-form" class="workflow-start-form">
        <label>示例项目仓库路径<input name="repositoryRoot" placeholder="请输入项目仓库的绝对路径" required></label>
        <label>文档智能体数量<input name="workerCount" type="number" min="0" max="5" value="1"></label>
        <button class="primary-button" type="submit" ${state.operatorMode ? '' : 'disabled'}>启动自动运行</button>
      </form>
    </section>
    <section class="panel">
      <div class="table-head run-grid"><span>模块与运行编号</span><span>状态</span><span>迭代</span><span>更新时间</span><span></span></div>
      <div id="runs-list" class="run-list">${state.runs.length ? state.runs.map((run) => runRow(run)).join('') : emptyState('没有运行记录', '当前注册表中还没有运行记录。')}</div>
    </section>`
}

function renderRunWorkspace(snapshot) {
  const { run, events = [], checkpoints = [], workflowNodes = [], evaluations = [], versions = [], latestDecision } = snapshot
  const automationNodes = workflowNodes.length ? workflowNodes : checkpoints
  const primaryStates = ['CREATED', 'PLANNED', 'GENERATING', 'EVALUATING', 'REVIEWING', 'PUBLISHING', 'VERIFIED']
  const currentIndex = primaryStates.indexOf(run.state)
  const steps = primaryStates.map((item, index) => {
    const completed = currentIndex >= 0 && index < currentIndex
    const active = item === run.state
    return `<li class="${completed ? 'complete' : ''} ${active ? 'active' : ''}"><i>${completed ? '✓' : index + 1}</i><span>${displayLabel(item)}</span></li>`
  }).join('')
  const latestEvaluation = evaluations.at(-1)
  content.innerHTML = `
    <section class="run-hero">
      <button class="back-button" data-run-back>← 返回运行列表</button>
      <div class="run-title-row">
        <div><p class="eyebrow">${escapeHtml(shortId(run.runId, 28))}</p><h2>${escapeHtml(run.moduleId)}</h2><p class="subtitle">策略 ${escapeHtml(run.policyId)} · 更新于 ${escapeHtml(formatDate(run.updatedAt))}</p></div>
        <div class="run-title-actions">${badge(run.state)}<a class="secondary-button" href="/api/v1/runs/${encodeURIComponent(run.runId)}/demo-report" download>导出演示报告</a><button class="secondary-button" data-refresh-run="${escapeHtml(run.runId)}">刷新</button></div>
      </div>
      <ol class="run-stepper">${steps}</ol>
      ${['ITERATING', 'ROLLING_BACK', 'LOW_CONFIDENCE', 'FAILED', 'CANCELLED'].includes(run.state) ? `<div class="state-callout ${run.state.toLowerCase().replaceAll('_', '-')}"><b>当前状态：${escapeHtml(displayLabel(run.state))}</b><span>第 ${escapeHtml(run.iteration + 1)} 轮 · 详情以事件与门禁证据为准</span></div>` : ''}
    </section>
    <div class="run-workspace-grid">
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">工作流执行记录</p><h2>自动化节点</h2><p>这里展示节点执行进度；运行聚合仍是业务状态的唯一依据。</p></div><span class="counter">${automationNodes.length}</span></div>
        <div class="node-list">${automationNodes.length ? automationNodes.map((node) => `
          <article class="node-card">
            <div><span class="node-icon">${['COMMITTED', 'COMPLETED'].includes(node.status) ? '✓' : node.status === 'FAILED' ? '!' : '●'}</span><div><b>${escapeHtml(NODE_LABELS[node.nodeId] ?? node.nodeId)}</b><small>${escapeHtml(node.agentId ? `${AGENT_LABELS[node.agentId] ?? node.agentId} · ${node.detail || '等待详情'}` : node.generationKey || node.detail || '确定性节点')}</small></div></div>
            <div>${badge(node.status)}<small>第 ${escapeHtml((node.iteration ?? run.iteration) + 1)} 轮 · 第 ${escapeHtml(node.attempt ?? ((node.retryCount ?? 0) + 1))} 次尝试</small></div>
          </article>`).join('') : emptyState('暂无节点记录', '这次运行可能由命令行创建，或者尚未执行智能体节点。')}</div>
      </section>
      <aside class="panel gate-summary">
        <p class="eyebrow">最近一次门禁判定</p>
        <h2>${latestDecision ? escapeHtml(displayLabel(latestDecision.outcome)) : '等待评测'}</h2>
        ${latestDecision ? badge(latestDecision.outcome) : badge('CANDIDATE', '尚未判定')}
        <dl class="fact-list">
          <div><dt>当前轮次</dt><dd>${escapeHtml(run.iteration + 1)}</dd></div>
          <div><dt>知识版本</dt><dd>${escapeHtml(versions.length)}</dd></div>
          <div><dt>评测次数</dt><dd>${escapeHtml(evaluations.length)}</dd></div>
          <div><dt>最佳版本</dt><dd title="${escapeHtml(run.bestVersionId)}">${escapeHtml(shortId(run.bestVersionId || '—'))}</dd></div>
        </dl>
        ${latestDecision ? `<h3>判定原因</h3><div class="reason-list">${latestDecision.reasonCodes.map((reason) => `<code>${escapeHtml(reason)}</code>`).join('')}</div>` : ''}
      </aside>
    </div>
    <div class="run-workspace-grid lower">
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">事件顺序</p><h2>审计时间线</h2></div><span class="counter">${events.length}</span></div>
        <ol class="timeline">${events.length ? [...events].reverse().map(({ eventSeq, event }) => `
          <li><span class="timeline-seq">${escapeHtml(eventSeq)}</span><div><b>${escapeHtml(EVENT_LABELS[event.eventType] ?? event.eventType)}</b><small>${escapeHtml(formatDate(event.occurredAt))}</small><code>${escapeHtml(shortId(event.eventId, 24))}</code></div></li>`).join('') : '<li class="muted">暂无事件</li>'}</ol>
      </section>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">质量评测</p><h2>最近评测</h2></div></div>
        ${latestEvaluation ? evaluationCard(latestEvaluation) : emptyState('等待评测报告', '执行证据尚未提交，暂时不能进入发布门禁。')}
      </section>
    </div>`
}

function evaluationCard(record) {
  const report = record.report
  const decision = record.decision
  const passRate = report.testsTotal ? Math.round(report.testsPassed / report.testsTotal * 100) : 0
  return `<article class="evaluation-card">
    <div class="evaluation-score"><strong>${escapeHtml(report.testsPassed)}/${escapeHtml(report.testsTotal)}</strong><span>测试通过 · ${passRate}%</span></div>
    <progress class="progress" value="${Math.max(0, report.testsPassed)}" max="${Math.max(1, report.testsTotal)}" aria-label="测试通过率 ${passRate}%"></progress>
    <dl class="fact-list">
      <div><dt>门禁判定</dt><dd>${badge(decision.outcome)}</dd></div>
      <div><dt>稳定性</dt><dd>${escapeHtml(report.stability)}</dd></div>
      <div><dt>严重失败</dt><dd>${escapeHtml(report.criticalFailures)}</dd></div>
      <div><dt>工具链</dt><dd>${escapeHtml(report.toolchainFingerprint)}</dd></div>
    </dl>
    <button class="text-button" data-evidence='${escapeHtml(JSON.stringify(record))}'>查看完整证据摘要 →</button>
  </article>`
}

function renderKnowledge(items = state.knowledge) {
  content.innerHTML = `
    <section class="knowledge-toolbar panel-flat">
      <label class="search-field"><span aria-hidden="true">⌕</span><input id="knowledge-search" type="search" placeholder="检索知识、模块、标签或正文"></label>
      <select id="knowledge-status" aria-label="知识状态">
        <option value="VERIFIED">已验证</option><option value="CANDIDATE">候选</option>
        <option value="LOW_CONFIDENCE">低置信</option><option value="SUPERSEDED">已替代</option><option value="">全部状态</option>
      </select>
    </section>
    <div class="knowledge-layout">
      <section class="panel catalog-panel">
        <div class="section-heading"><div><p class="eyebrow">知识登记簿</p><h2>知识版本</h2></div><span id="knowledge-count" class="counter">${items.length}</span></div>
        <div id="knowledge-list" class="knowledge-list">${knowledgeCards(items)}</div>
      </section>
      <section class="panel knowledge-guide">
        <p class="eyebrow">可信规则</p><h2>文档合格不等于行为正确</h2>
        <div class="trust-path"><span>候选</span><i>→</i><span>质量合格</span><i>→</i><span>行为门禁通过</span><i>→</i><span>已验证</span></div>
        <p>质量门禁只判断文档是否适合进入行为评测。知识版本必须绑定不可变的执行证据，并通过确定性门禁，才能正式发布。</p>
        <div class="legend"><span>${badge('VERIFIED')}</span><small>可复用知识</small><span>${badge('CANDIDATE')}</span><small>尚未获得发布权限</small></div>
      </section>
    </div>`
}

function knowledgeCards(items) {
  return items.length ? items.map((item) => `<button class="knowledge-card" data-version-id="${escapeHtml(item.versionId)}">
    <span class="card-heading"><span><b>${escapeHtml(item.title || item.moduleId)}</b><small>${escapeHtml(item.moduleId)}</small></span>${badge(item.status)}</span>
    <span class="card-description">${escapeHtml(item.description || '暂无描述')}</span>
    <span class="card-meta"><small>质量 ${escapeHtml(item.qualityScore)}</small><small>${escapeHtml(relativeTime(item.createdAt))}</small></span>
  </button>`).join('') : emptyState('没有知识版本', '当前筛选条件下没有可以展示的知识。')
}

async function openKnowledge(versionId) {
  const item = await request(`/api/v1/knowledge/${encodeURIComponent(versionId)}`)
  drawerTitle.textContent = item.title || item.moduleId
  drawerContent.innerHTML = `
    <div class="drawer-badges">${badge(item.status)} ${badge(item.qualityOutcome)}</div>
    <p class="lead">${escapeHtml(item.description || '暂无描述')}</p>
    <dl class="fact-grid">
      <div><dt>模块</dt><dd>${escapeHtml(item.moduleId)}</dd></div>
      <div><dt>版本</dt><dd>${escapeHtml(item.versionId)}</dd></div>
      <div><dt>质量门禁</dt><dd>${escapeHtml(item.qualityScore)} / 100</dd></div>
      <div><dt>行为门禁</dt><dd>${item.gateDecisionId ? escapeHtml(shortId(item.gateDecisionId, 22)) : '尚未通过，不可发布'}</dd></div>
    </dl>
    <section class="drawer-section"><h3>来源记录</h3><ul class="provenance-list">${item.provenance.map((source) => `<li><code>${escapeHtml(source.path)}</code>${source.commit ? `<small>@ ${escapeHtml(source.commit)}</small>` : ''}</li>`).join('')}</ul></section>
    <section class="drawer-section"><h3>内容摘要</h3><button class="copy-value" data-copy="${escapeHtml(item.bodyRef.sha256)}"><code>${escapeHtml(item.bodyRef.sha256)}</code><span>复制</span></button></section>
    <section class="drawer-section"><h3>正文</h3><pre class="knowledge-body">${escapeHtml(item.body)}</pre></section>
    <section class="drawer-section feedback-section"><h3>使用反馈</h3><p>反馈会进入后续治理流程，但不会直接修改知识或门禁判定。</p>
      <form id="feedback-form" data-version="${escapeHtml(item.versionId)}">
        <div class="feedback-actions"><label><input type="radio" name="action" value="hit" checked>有帮助</label><label><input type="radio" name="action" value="rate">评分</label><label><input type="radio" name="action" value="correct">需要纠正</label></div>
        <div class="feedback-inputs"><input name="rating" type="number" min="0" max="5" placeholder="0–5"><input name="note" placeholder="补充说明"><button class="primary-button">提交</button></div>
      </form>
    </section>`
  openDrawer()
}

function renderGovernance() {
  const items = state.runs.filter(needsAttention)
  content.innerHTML = `
    <section class="governance-intro panel"><div><p class="eyebrow">人工治理</p><h2>只处理真正需要判断的异常</h2><p>继续迭代、回滚和通过等正常分支由工作流服务自动推进。治理队列不提供“强制验证”或篡改门禁判定的入口。</p></div><strong>${items.length}</strong></section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">待处理队列</p><h2>待治理运行</h2></div></div>
      <div class="governance-list">${items.length ? items.map((run) => `<article class="governance-card">
        <div><span class="risk-icon">!</span><div><b>${escapeHtml(run.moduleId)}</b><small>${escapeHtml(shortId(run.runId, 24))}</small></div></div>
        <div>${badge(run.state)}${run.latestDecision?.outcome === 'STOPPED' ? badge('STOPPED') : ''}<span>第 ${escapeHtml(run.iteration + 1)} 轮</span><button class="secondary-button" data-run-id="${escapeHtml(run.runId)}">查看证据</button></div>
      </article>`).join('') : emptyState('治理队列为空', '当前没有低置信或失败的运行。')}</div>
    </section>`
}

async function renderEvidence() {
  content.innerHTML = '<div class="loading-state"><span class="spinner"></span>正在汇总评测证据…</div>'
  const snapshots = await Promise.all(state.runs.slice(0, 20).map((run) => request(`/api/v1/runs/${encodeURIComponent(run.runId)}`).catch(() => null)))
  const records = snapshots.flatMap((snapshot) => (snapshot?.evaluations ?? []).map((record) => ({ ...record, run: snapshot.run }))).reverse()
  content.innerHTML = `
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">不可变证据</p><h2>评测与门禁</h2><p>这里只展示服务端持久化的执行事实，不采用智能体自评分。</p></div><span class="counter">${records.length}</span></div>
      <div class="evidence-grid">${records.length ? records.map((record) => `<article class="evidence-card">
        <div class="card-heading"><div><b>${escapeHtml(record.run.moduleId)}</b><small>${escapeHtml(shortId(record.run.runId, 20))}</small></div>${badge(record.decision.outcome)}</div>
        <strong>${escapeHtml(record.report.testsPassed)} / ${escapeHtml(record.report.testsTotal)}</strong><span>测试通过</span>
        <dl><div><dt>稳定性</dt><dd>${escapeHtml(record.report.stability)}</dd></div><div><dt>证据数量</dt><dd>${escapeHtml(record.report.evidenceRefs.length)}</dd></div></dl>
        <button class="text-button" data-evidence='${escapeHtml(JSON.stringify({ report: record.report, decision: record.decision }))}'>检查证据 →</button>
      </article>`).join('') : emptyState('没有评测报告', '运行进入行为评测后，证据会显示在这里。')}</div>
    </section>`
}

function renderSettings() {
  const capabilities = state.capabilities ?? {}
  const status = state.status ?? {}
  content.innerHTML = `
    <div class="settings-grid">
      <section class="panel"><p class="eyebrow">本地运行</p><h2>运行状态</h2><dl class="settings-list">
        <div><dt>知识登记簿</dt><dd>${badge('VERIFIED', '运行正常')}</dd></div>
        <div><dt>知识版本</dt><dd>${escapeHtml(status.knowledgeTotal ?? 0)}</dd></div>
        <div><dt>运行次数</dt><dd>${escapeHtml(status.runs ?? 0)}</dd></div>
        <div><dt>发布记录</dt><dd>${escapeHtml(status.publications ?? 0)}</dd></div>
      </dl></section>
      <section class="panel"><p class="eyebrow">安全边界</p><h2>能力范围</h2><dl class="settings-list">
        <div><dt>接口写入</dt><dd>${badge(capabilities.writeEnabled ? 'VERIFIED' : 'CANDIDATE', capabilities.writeEnabled ? '已启用令牌' : '已关闭')}</dd></div>
        <div><dt>项目评测</dt><dd>${badge('CANDIDATE', '仅限受信源码')}</dd></div>
        <div><dt>敌对代码隔离</dt><dd>${badge('FAILED', '暂不可用')}</dd></div>
        <div><dt>自动工作流</dt><dd>${badge('LOW_CONFIDENCE', capabilities.automatedWorkflow ? '可用' : '规划中')}</dd></div>
        <div><dt>智能体通信</dt><dd>${badge(capabilities.agentPromptTransport === 'sdk-stdio-json-rpc' ? 'VERIFIED' : 'CANDIDATE', capabilities.agentPromptTransport === 'sdk-stdio-json-rpc' ? '已连接' : '未确认')}</dd></div>
        <div><dt>智能体源码隔离</dt><dd>${badge(capabilities.agentSourceIsolation === 'bubblewrap' ? 'VERIFIED' : 'LOW_CONFIDENCE', capabilities.agentSourceIsolation === 'bubblewrap' ? '已启用' : '未证明')}</dd></div>
      </dl></section>
      <section class="panel full-span"><p class="eyebrow">治理写入</p><h2>配置服务端令牌</h2>${capabilities.writeEnabled
        ? '<div class="notice"><b>服务端写入已经启用。</b><p>点击右上角“治理模式”，输入与本地配置文件相同的令牌，即可执行受保护的写操作。</p></div>'
        : '<div class="notice"><b>当前没有配置写入令牌，因此服务端保持只读。</b><p>复制仓库根目录的 <code>.env.example</code> 为 <code>.env.local</code>，把占位值换成随机长令牌，然后重启服务。</p><pre>WP_KNOWLEDGE_WRITE_TOKEN=请替换为随机长令牌\nWP_FLYWHEEL_HOME=.workpanel</pre><p>配置文件不会提交到版本库。启动命令会自动读取它。</p></div>'}</section>
      <section class="panel full-span"><p class="eyebrow">当前能力</p><h2>尚未开放通用启动接口</h2><div class="notice"><b>运行工作台目前以观察和固定场景验收为主。</b><p>固定源码验收已经支持两轮自动编排；通用工作流命令接口尚未完成，所以页面不会用直接改状态的方式伪装自动化。</p></div></section>
    </div>`
}

function renderAgents() {
  const canEdit = Boolean(state.operatorMode && state.capabilities?.writeEnabled)
  content.innerHTML = `
    <section class="agent-boundary panel">
      <div><p class="eyebrow">固定契约，可控扩展</p><h2>智能体可以调整表达，不能改变职责</h2><p>拓扑、职责、输入输出、工具权限和基础提示词由代码固定。这里保存的内容只会作为追加提示词，用于后续节点执行。</p></div>
      ${badge(canEdit ? 'VERIFIED' : 'CANDIDATE', canEdit ? '可编辑提示词' : '只读查看')}
    </section>
    <section class="agent-grid">${state.agents.map((agent) => `<article class="agent-card panel">
      <div class="card-heading"><div><p class="eyebrow">固定工作流节点</p><h2>${escapeHtml(agent.displayName)}</h2></div>${badge('CANDIDATE', '职责固定')}</div>
      <p class="agent-responsibility">${escapeHtml(agent.responsibility)}</p>
      <dl class="agent-contract">
        <div><dt>输入</dt><dd>${agent.inputContract.map((item) => `<code>${escapeHtml(item)}</code>`).join('')}</dd></div>
        <div><dt>输出</dt><dd>${agent.outputContract.map((item) => `<code>${escapeHtml(item)}</code>`).join('')}</dd></div>
        <div><dt>工具</dt><dd>${agent.tools.length ? agent.tools.map((item) => `<code>${escapeHtml(item)}</code>`).join('') : '<span>无工具</span>'}</dd></div>
      </dl>
      <details><summary>查看固定基础提示词</summary><pre>${escapeHtml(agent.basePrompt)}</pre></details>
      <form class="agent-prompt-form" data-agent-id="${escapeHtml(agent.agentId)}">
        <label>追加提示词 <small>${escapeHtml(agent.configuration.promptAddon.length)} / 4000 · 修订 ${escapeHtml(agent.configuration.revision)}</small>
          <textarea name="promptAddon" maxlength="4000" rows="5" ${canEdit ? '' : 'disabled'}>${escapeHtml(agent.configuration.promptAddon)}</textarea>
        </label>
        <div><span>仅影响后续执行</span><button class="secondary-button" type="submit" ${canEdit ? '' : 'disabled'}>保存提示词</button></div>
      </form>
    </article>`).join('')}</section>`
}

async function navigate(page) {
  if (!PAGE_META[page]) return
  state.page = page
  state.selectedRun = null
  setPageMeta(page)
  closeDrawer()
  if (page === 'overview') renderOverview()
  if (page === 'runs') renderRuns()
  if (page === 'knowledge') renderKnowledge()
  if (page === 'governance') renderGovernance()
  if (page === 'evidence') await renderEvidence()
  if (page === 'agents') renderAgents()
  if (page === 'settings') renderSettings()
  content.focus({ preventScroll: true })
}

async function openRun(runId) {
  setPageMeta('runs')
  state.page = 'runs'
  content.innerHTML = '<div class="loading-state"><span class="spinner"></span>正在读取运行快照…</div>'
  state.selectedRun = await request(`/api/v1/runs/${encodeURIComponent(runId)}`)
  renderRunWorkspace(state.selectedRun)
}

function openEvidence(encoded) {
  const record = JSON.parse(encoded)
  drawerTitle.textContent = '评测证据'
  drawerContent.innerHTML = `<div class="drawer-badges">${badge(record.decision.outcome)}</div>
    <section class="drawer-section"><h3>评测报告</h3><pre class="json-view">${json(record.report)}</pre></section>
    <section class="drawer-section"><h3>门禁判定</h3><pre class="json-view">${json(record.decision)}</pre></section>`
  openDrawer()
}

function openDrawer() {
  drawer.hidden = false
  drawer.setAttribute('aria-hidden', 'false')
  drawerBackdrop.hidden = false
  requestAnimationFrame(() => drawer.classList.add('open'))
  drawerClose.focus()
}

function closeDrawer() {
  drawer.classList.remove('open')
  drawer.setAttribute('aria-hidden', 'true')
  drawerBackdrop.hidden = true
  setTimeout(() => { if (!drawer.classList.contains('open')) drawer.hidden = true }, 180)
}

function showToast(message, tone = '') {
  toast.textContent = message
  toast.className = `toast ${tone}`
  toast.hidden = false
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => { toast.hidden = true }, 3200)
}

function showUnavailable() {
  showToast('通用自动工作流尚未接入；系统不会用直接改状态的方式模拟自动化。', 'warning')
}

async function submitFeedback(form) {
  if (!state.capabilities?.writeEnabled) {
    showToast('服务端尚未配置写入令牌。请到“设置”查看配置方法。', 'warning')
    return
  }
  if (!state.token) {
    operatorDialog.showModal()
    return
  }
  const data = new FormData(form)
  const action = String(data.get('action') || 'hit')
  const ratingValue = String(data.get('rating') || '').trim()
  await request('/api/v1/feedback', {
    method: 'POST',
    body: JSON.stringify({
      versionId: form.dataset.version,
      action,
      rating: action === 'rate' && ratingValue ? Number(ratingValue) : null,
      note: String(data.get('note') || ''),
    }),
  })
  showToast('反馈已记录；知识状态和门禁判定没有改变。', 'success')
  form.reset()
}

async function saveAgentPrompt(form) {
  if (!state.operatorMode || !state.token) {
    showToast('请先进入治理模式。', 'warning')
    return
  }
  const data = new FormData(form)
  const agentId = form.dataset.agentId
  await request(`/api/v1/agents/${encodeURIComponent(agentId)}/prompt`, {
    method: 'PUT',
    body: JSON.stringify({ promptAddon: String(data.get('promptAddon') || '') }),
  })
  state.agents = (await request('/api/v1/agents')).agents
  renderAgents()
  showToast(`${agentId} 的追加提示词已保存，只影响后续执行。`, 'success')
}

async function startWorkflow(form) {
  if (!state.operatorMode || !state.token) {
    showToast('请先进入治理模式，再启动自动运行。', 'warning')
    return
  }
  const data = new FormData(form)
  const handle = await request('/api/v1/run-commands/start', {
    method: 'POST',
    body: JSON.stringify({
      profile: 'ohmyworkpanel',
      repositoryRoot: String(data.get('repositoryRoot') || ''),
      workerCount: Number(data.get('workerCount') || 1),
    }),
  })
  state.runs = (await request('/api/v1/runs')).runs
  showToast(`自动运行 ${shortId(handle.runId, 16)} 已启动。`, 'success')
  await openRun(handle.runId)
}

nav.addEventListener('click', (event) => {
  const button = event.target.closest('[data-page]')
  if (button) navigate(button.dataset.page).catch(showFatal)
})

content.addEventListener('click', (event) => {
  const pageLink = event.target.closest('[data-page-link]')
  if (pageLink) navigate(pageLink.dataset.pageLink).catch(showFatal)
  const runButton = event.target.closest('[data-run-id]')
  if (runButton) openRun(runButton.dataset.runId).catch(showFatal)
  if (event.target.closest('[data-run-back]')) { state.selectedRun = null; renderRuns() }
  const refresh = event.target.closest('[data-refresh-run]')
  if (refresh) openRun(refresh.dataset.refreshRun).catch(showFatal)
  const knowledgeButton = event.target.closest('[data-version-id]')
  if (knowledgeButton) openKnowledge(knowledgeButton.dataset.versionId).catch(showFatal)
  const evidenceButton = event.target.closest('[data-evidence]')
  if (evidenceButton) openEvidence(evidenceButton.dataset.evidence)
  const unavailable = event.target.closest('[data-unavailable]')
  if (unavailable) showUnavailable()
  if (event.target.closest('[data-reload]')) location.reload()
  const copy = event.target.closest('[data-copy]')
  if (copy) {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(copy.dataset.copy).then(() => showToast('已复制摘要。')).catch(() => showToast('复制失败。', 'warning'))
    else showToast('当前浏览器不支持剪贴板写入。', 'warning')
  }
})

content.addEventListener('input', (event) => {
  if (event.target.id !== 'knowledge-search') return
  const query = event.target.value.trim().toLowerCase()
  const filtered = state.knowledge.filter((item) => [item.title, item.moduleId, item.description, ...(item.tags ?? [])].join(' ').toLowerCase().includes(query))
  document.querySelector('#knowledge-list').innerHTML = knowledgeCards(filtered)
  document.querySelector('#knowledge-count').textContent = filtered.length
})

content.addEventListener('change', async (event) => {
  if (event.target.id === 'knowledge-status') {
    const selected = event.target.value
    const result = await request(`/api/v1/knowledge?status=${encodeURIComponent(selected)}`)
    document.querySelector('#knowledge-list').innerHTML = knowledgeCards(result.knowledge)
    document.querySelector('#knowledge-count').textContent = result.knowledge.length
  }
  const filter = event.target.closest('[data-run-filter]')
  if (filter) filterRuns(filter.dataset.runFilter)
})

content.addEventListener('submit', (event) => {
  if (event.target.id === 'feedback-form') {
    event.preventDefault()
    submitFeedback(event.target).catch((error) => showToast(error.message, 'danger'))
  }
  if (event.target.classList.contains('agent-prompt-form')) {
    event.preventDefault()
    saveAgentPrompt(event.target).catch((error) => showToast(error.message, 'danger'))
  }
  if (event.target.id === 'workflow-start-form') {
    event.preventDefault()
    startWorkflow(event.target).catch((error) => showToast(error.message, 'danger'))
  }
})

drawerContent.addEventListener('submit', (event) => {
  if (event.target.id === 'feedback-form') {
    event.preventDefault()
    submitFeedback(event.target).catch((error) => showToast(error.message, 'danger'))
  }
})

drawerContent.addEventListener('click', (event) => {
  const copy = event.target.closest('[data-copy]')
  if (!copy) return
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(copy.dataset.copy).then(() => showToast('已复制摘要。')).catch(() => showToast('复制失败。', 'warning'))
  else showToast('当前浏览器不支持剪贴板写入。', 'warning')
})

content.addEventListener('click', (event) => {
  const filter = event.target.closest('[data-run-filter]')
  if (!filter) return
  for (const item of content.querySelectorAll('[data-run-filter]')) item.classList.toggle('active', item === filter)
  filterRuns(filter.dataset.runFilter)
})

function filterRuns(filter) {
  const runs = state.runs.filter((run) => {
    if (!filter) return true
    if (filter === 'active') return !TERMINAL.has(run.state)
    if (filter === 'attention') return needsAttention(run)
    return run.state === filter
  })
  const target = document.querySelector('#runs-list')
  if (target) target.innerHTML = runs.length ? runs.map((run) => runRow(run)).join('') : emptyState('没有匹配的运行', '请选择其他状态筛选。')
}

operatorButton.addEventListener('click', () => {
  if (!state.capabilities?.writeEnabled) {
    showToast('服务端尚未配置写入令牌。请到“设置”查看配置方法。', 'warning')
    return
  }
  if (state.operatorMode) {
    state.token = ''
    state.operatorMode = false
    updateMode()
    showToast('已退出治理模式。')
    return
  }
  operatorDialog.showModal()
})

themeButton.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true)
})

operatorForm.addEventListener('submit', (event) => {
  event.preventDefault()
  if (!operatorToken.value.trim()) return
  state.token = operatorToken.value.trim()
  state.operatorMode = true
  operatorToken.value = ''
  operatorDialog.close()
  updateMode()
  showToast('令牌已载入当前页面内存。', 'success')
})
operatorCancel.addEventListener('click', () => operatorDialog.close())

drawerClose.addEventListener('click', closeDrawer)
drawerBackdrop.addEventListener('click', closeDrawer)
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && drawer.classList.contains('open')) closeDrawer() })

function updateMode() {
  if (state.operatorMode) {
    modePill.textContent = '治理模式'
    modePill.className = 'status-pill operator'
    operatorButton.textContent = '退出治理'
  } else {
    modePill.textContent = state.capabilities?.writeEnabled ? '只读模式' : '写入关闭'
    modePill.className = `status-pill ${state.capabilities?.writeEnabled ? '' : 'disabled'}`
    operatorButton.textContent = '治理模式'
  }
  if (state.page === 'agents') renderAgents()
  if (state.page === 'runs') renderRuns()
}

function showFatal(error) {
  registryIndicator.className = 'health-dot failed'
  registryLabel.textContent = '连接失败'
  content.innerHTML = emptyState('无法读取知识飞轮', error.message, '<button class="primary-button" data-reload>重新连接</button>')
}

async function boot() {
  const [statusPayload, capabilityPayload, runPayload, knowledgePayload, agentPayload] = await Promise.all([
    request('/api/v1/status'), request('/api/v1/capabilities'), request('/api/v1/runs'), request('/api/v1/knowledge'), request('/api/v1/agents'),
  ])
  state.status = statusPayload
  state.capabilities = capabilityPayload
  state.runs = runPayload.runs
  state.knowledge = knowledgePayload.knowledge
  state.agents = agentPayload.agents
  registryIndicator.className = 'health-dot healthy'
  registryLabel.textContent = '运行正常'
  governanceCount.textContent = state.runs.filter(needsAttention).length || ''
  runtimeFooter.innerHTML = `<span><i class="health-dot healthy"></i>知识登记簿</span><span><i class="health-dot healthy"></i>内容寻址存储</span><span><i class="health-dot healthy"></i>工作流基础设施</span><span>${escapeHtml(state.runs.length)} 次运行 · ${escapeHtml(state.knowledge.length)} 个知识版本</span>`
  updateMode()
  renderOverview()
}

boot().catch(showFatal)
