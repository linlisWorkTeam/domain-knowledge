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
const sidebar = document.querySelector('#sidebar')
const navToggle = document.querySelector('#nav-toggle')
const navBackdrop = document.querySelector('#nav-backdrop')
const globalSearchButton = document.querySelector('#global-search-button')
let drawerReturnFocus = null
let drawerReturnKey = null

function applyTheme(theme, persist = false) {
  const normalized = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = normalized
  themeButton.textContent = normalized === 'dark' ? '☼' : '◐'
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
  overview: ['Action Center', '集中查看需要处理的运行、系统事实和最近活动。'],
  runs: ['Flywheel Runs', '沿着节点、评测和事件记录，查看每次运行的完整过程。'],
  knowledge: ['Knowledge', '检索候选知识和已验证知识，核对来源、版本与发布依据。'],
  graph: ['Graph', '查看选定 Run 的只读 Agent 工作流、节点状态与执行事件。'],
  evaluations: ['Evaluations', '核对跨 Run 的评测、门禁判定、工具链和不可变证据。'],
  sources: ['Sources', '查看服务端实际扫描到的来源候选；来源注册管理尚未接入。'],
  'agent-settings': ['Agent Settings', '查看固定 Agent 契约、追加提示词和系统能力边界。'],
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
  discovery: null,
  resourceErrors: {},
  loadedAt: null,
  graphRunId: null,
  graphSnapshot: null,
  graphPoll: null,
}

function collection(payload, legacyKey) {
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.[legacyKey])) return payload[legacyKey]
  if (Array.isArray(payload?.hits)) return payload.hits
  return []
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
  if (options.method === 'POST' && !headers['Idempotency-Key']) headers['Idempotency-Key'] = crypto.randomUUID()
  if (state.token) headers.authorization = `Bearer ${state.token}`
  const response = await fetch(path, { ...options, headers })
  let payload = null
  try { payload = await response.json() } catch { payload = null }
  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.message || (typeof payload?.error === 'string' ? payload.error : '') || `${response.status} ${path}`)
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

function errorState(titleText, error, action = '') {
  return `<div class="empty-state error-state" role="alert"><span aria-hidden="true">!</span><h3>${escapeHtml(titleText)}</h3><p>${escapeHtml(error?.message || '请求失败，请稍后重试。')}</p>${action}</div>`
}

function partialNotice(message) {
  return `<div class="partial-notice" role="status"><b>部分数据暂不可用</b><span>${escapeHtml(message)}</span></div>`
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
  const verified = state.status ? status.verified : (state.resourceErrors.knowledge ? '不可用' : state.knowledge.filter((item) => item.status === 'VERIFIED').length)
  const candidates = state.status ? status.candidates : (state.resourceErrors.knowledge ? '不可用' : state.knowledge.filter((item) => item.status === 'CANDIDATE').length)
  const recent = state.runs.slice(0, 6)
  const notices = ['status', 'runs', 'capabilities'].filter((key) => state.resourceErrors[key])
  const latestRun = state.runs[0]
  const runIssueRows = attention.length ? attention.slice(0, 5).map((run, index) => `
    <button class="attention-row ${index === 0 ? 'selected' : ''}" data-run-id="${escapeHtml(run.runId)}" type="button">
      <i class="attention-dot ${run.state === 'FAILED' ? 'danger' : 'warning'}" aria-hidden="true"></i>
      <span><b>${escapeHtml(run.moduleId)}</b><small>${escapeHtml(shortId(run.runId, 26))} · ${escapeHtml(displayLabel(run.state))}</small></span>
      ${badge(run.latestDecision?.outcome ?? run.state)}
      <time>${escapeHtml(formatDate(run.updatedAt))}</time>
    </button>`).join('') : ''
  const queueRemainder = `<div class="queue-partial-state"><span aria-hidden="true">◇</span><div><b>${attention.length ? '暂无更多真实待办' : '目前没有待处理事项'}</b><small>Action Item API 接入后显示独立任务生命周期</small></div><em>${attention.length ? 'PARTIAL' : 'EMPTY'}</em></div>`
  const pulseRows = recent.slice(0, 3).map((run) => `
    <button class="pulse-row" data-run-id="${escapeHtml(run.runId)}" type="button"><i class="${needsAttention(run) ? 'warning' : 'success'}"></i><span><b>${escapeHtml(run.moduleId)}</b><small>${escapeHtml(displayLabel(run.state))} · ${escapeHtml(formatDate(run.updatedAt))}</small></span></button>`).join('')
  content.innerHTML = `
    ${notices.length ? partialNotice(`${notices.join('、')} 获取失败；其余区域仍展示已读取的服务端事实。`) : ''}
    <section class="overview-summary-grid" aria-label="关键摘要">
      <article class="attention-summary">
        <span class="attention-orb"><i></i></span>
        <div><p class="eyebrow danger-text">NEEDS YOUR ATTENTION · PARTIAL</p><h2>${state.resourceErrors.runs ? '运行状态不可用' : `${attention.length} 项需要确认`}</h2><p>${state.resourceErrors.runs ? '无法读取运行列表' : `来自 ${state.runs.length} 个真实 Run 的只读投影`}</p></div>
        <footer><i></i><i></i><i></i></footer>
      </article>
      <article class="knowledge-summary">
        <header><p class="eyebrow">KNOWLEDGE HEALTH</p><span>PARTIAL</span></header>
        <div><strong>—</strong><small>/ 100</small><b>口径未接入</b></div>
        <footer><span>Coverage <b>—</b></span><span>Freshness <b>—</b></span><span>Accuracy <b>—</b></span></footer>
      </article>
    </section>
    <div class="overview-workspace">
      <section class="attention-queue">
        <header><div><h2>需要处理</h2><small>由失败、低置信与 STOPPED Run 派生</small></div><button class="text-button" data-page-link="runs">查看全部 →</button></header>
        <div class="queue-filters"><button class="active">全部　${attention.length}</button><button>运行失败　${attention.filter((run) => run.state === 'FAILED').length}</button><button>低置信　${attention.filter((run) => run.state === 'LOW_CONFIDENCE').length}</button><span>PARTIAL</span></div>
        <div class="queue-labels"><span>运行</span><span>状态</span><span>更新</span></div>
        <div class="queue-body">${runIssueRows}${queueRemainder}</div>
      </section>
      <aside class="overview-rail">
        <article class="current-run-card">
          <header><small><i></i> FLYWHEEL ${active.length ? 'RUNNING' : 'STATUS'}</small><button class="text-button" data-page-link="runs">打开运行 ↗</button></header>
          ${latestRun ? `<h3>${escapeHtml(shortId(latestRun.runId, 18))}</h3><p>${escapeHtml(latestRun.moduleId)} · ${escapeHtml(displayLabel(latestRun.state))}</p><div class="run-state-line"><i></i></div><div class="run-state-meta"><b>${escapeHtml(displayLabel(latestRun.state))}</b><span>不提供模拟 ETA · PROGRESS PARTIAL</span></div>` : emptyState('暂无运行', 'Registry 中没有 Run 记录。')}
          <ol class="flywheel-stages"><li class="observed"><i>1</i><span>Discover<small>Run 已登记</small></span></li><li class="observed"><i>2</i><span>Generate<small>${latestRun ? escapeHtml(displayLabel(latestRun.state)) : '等待运行'}</small></span></li><li><i>3</i><span>Evaluate<small>进度 API 未接入</small></span></li><li><i>4</i><span>Evolve<small>发布状态待确认</small></span></li></ol>
        </article>
        <article class="recent-pulse"><header><h3>Recent Pulse</h3><span>ACTIVITY PARTIAL</span></header>${pulseRows || '<div class="pulse-empty"><b>暂无真实活动</b><small>Workspace Activity API 尚未接入</small></div>'}</article>
      </aside>
    </div>`
}

function renderRuns() {
  if (state.resourceErrors.runs) {
    content.innerHTML = errorState('无法读取运行列表', state.resourceErrors.runs, '<button class="primary-button" data-reload type="button">重新连接</button>')
    return
  }
  if (state.selectedRun) {
    renderRunWorkspace(state.selectedRun)
    return
  }
  const active = state.runs.filter((run) => !TERMINAL.has(run.state))
  const verified = state.runs.filter((run) => run.state === 'VERIFIED')
  const latest = state.runs[0]
  const rows = state.runs.map((run, index) => referenceRunRow(run, index === 0)).join('')
  content.innerHTML = `
    <section class="reference-page-intro"><div><small>EXECUTION</small><h2>Flywheel Runs</h2><p>查看每次运行从发现、生成到评测与发布的真实过程。</p></div><button class="new" data-open-operator type="button">＋ New run</button></section>
    <section class="reference-metrics"><article><small>RUNNING</small><b class="mint">${active.length}</b><p>来自 Registry 当前状态</p></article><article><small>VERIFIED</small><b>${verified.length}</b><p>${state.runs.length} 次运行</p></article><article><small>NEEDS ATTENTION</small><b>${state.runs.filter(needsAttention).length}</b><p>失败、低置信或 STOPPED</p></article><article><small>KNOWLEDGE VERSIONS</small><b>${state.runs.reduce((sum, run) => sum + (run.knowledgeVersionIds?.length ?? 0), 0)}</b><p>由 Run 事实汇总</p></article></section>
    <div class="reference-runs-grid"><section class="reference-run-history"><header><h3>Run history</h3><button class="on" data-run-filter="">全部</button><button data-run-filter="active">运行中</button><button data-run-filter="attention">需处理</button></header><div id="runs-list">${rows || emptyState('没有运行记录', '当前 Registry 中还没有运行记录。')}</div></section>
    <aside class="reference-run-detail">${latest ? `<header><small>LATEST RUN</small><b>${escapeHtml(shortId(latest.runId, 18))}</b></header><div class="orbit-mini"><span>${escapeHtml(displayLabel(latest.state))}<small>RUN STATE</small></span></div><p class="done">✓ <b>运行事实</b><small>${escapeHtml(latest.moduleId)}</small></p><p class="doing">⌁ <b>Agent Graph</b><small>查看真实节点投影</small></p><p>3 <b>Evaluations</b><small>${escapeHtml(latest.latestDecision?.outcome ? displayLabel(latest.latestDecision.outcome) : '等待门禁')}</small></p><button class="wide" data-run-id="${escapeHtml(latest.runId)}">Open run details →</button>` : emptyState('暂无运行', '创建 Run 后在这里查看。')}</aside></div>
    <form id="workflow-start-form" class="reference-start-form"><label>受信项目路径<input name="repositoryRoot" placeholder="请输入项目仓库的绝对路径" required></label><label>Worker<input name="workerCount" type="number" min="0" max="5" value="1"></label><button class="new" type="submit" ${state.operatorMode ? '' : 'disabled'}>启动固定验收流程</button></form>`
}

function referenceRunRow(run, selected = false) {
  return `<button class="reference-run-item ${selected ? 'selected' : ''}" data-run-id="${escapeHtml(run.runId)}" type="button"><i class="${TERMINAL.has(run.state) ? (run.state === 'VERIFIED' ? 'run-ok' : 'run-bad') : 'run-live'}">${run.state === 'VERIFIED' ? '✓' : run.state === 'FAILED' ? '!' : ''}</i><span><b>${escapeHtml(shortId(run.runId, 18))}</b><small>${escapeHtml(run.moduleId)} · 第 ${escapeHtml(run.iteration + 1)} 轮</small></span><em>${escapeHtml(displayLabel(run.state))}</em><span>${escapeHtml(run.latestDecision?.outcome ? displayLabel(run.latestDecision.outcome) : '等待门禁')}</span><strong>${escapeHtml(run.knowledgeVersionIds?.length ?? 0)} 版本</strong><time>${escapeHtml(relativeTime(run.updatedAt))}</time></button>`
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
        <div class="run-title-actions">${badge(run.state)}<a class="secondary-button" href="/api/v1/runs/${encodeURIComponent(run.runId)}/report" download>导出报告</a><button class="secondary-button" data-refresh-run="${escapeHtml(run.runId)}">刷新</button></div>
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
  if (state.resourceErrors.knowledge) {
    content.innerHTML = errorState('无法读取知识目录', state.resourceErrors.knowledge, '<button class="primary-button" data-reload type="button">重新连接</button>')
    return
  }
  const modules = [...new Set(items.map((item) => item.moduleId))].slice(0, 6)
  content.innerHTML = `
    <section class="reference-page-intro"><div><small>KNOWLEDGE BASE</small><h2>Knowledge</h2><p>浏览带有来源、质量状态和发布依据的知识版本。</p></div><button disabled>＋ Add curated knowledge</button></section>
    <section class="reference-knowledge-tools"><label>⌕　<input id="knowledge-search" type="search" placeholder="搜索概念、模块或正文…"></label><kbd>⌘ K</kbd><select id="knowledge-status" aria-label="知识状态"><option value="VERIFIED">已验证</option><option value="CANDIDATE">候选</option><option value="LOW_CONFIDENCE">低置信</option><option value="SUPERSEDED">已替代</option><option value="">全部状态</option></select></section>
    <div class="reference-knowledge-grid"><aside class="reference-domains"><header><h3>Domains</h3><span id="knowledge-count">${items.length}</span></header><button class="active">全部知识 <b>${items.length}</b></button>${modules.map((moduleId) => `<button>${escapeHtml(moduleId)} <b>${items.filter((item) => item.moduleId === moduleId).length}</b></button>`).join('')}</aside><section class="reference-docs"><header><span>KNOWLEDGE</span><span>SOURCE</span><span>STATUS</span><span>UPDATED</span></header><div id="knowledge-list">${knowledgeCards(items)}</div></section></div>`
}

function knowledgeCards(items) {
  return items.length ? items.map((item) => `<button class="reference-doc" data-version-id="${escapeHtml(item.versionId)}"><span><em class="${item.status === 'VERIFIED' ? 'verified' : ''}">${escapeHtml(displayLabel(item.status))}</em><b>${escapeHtml(item.title || item.moduleId)}</b><small>${escapeHtml(item.description || item.moduleId)}</small></span><span>${escapeHtml(item.provenance?.length ?? 0)} 来源</span><strong class="${item.status === 'LOW_CONFIDENCE' ? 'risk' : ''}">${escapeHtml(item.qualityScore)}</strong><time>${escapeHtml(relativeTime(item.createdAt))}</time></button>`).join('') : emptyState('没有知识版本', '当前筛选条件下没有可以展示的知识。')
}

async function openKnowledge(versionId, returnFocus) {
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
  openDrawer(returnFocus)
}

function renderGovernance() {
  if (state.resourceErrors.runs) {
    content.innerHTML = errorState('无法生成治理队列', state.resourceErrors.runs, '<button class="primary-button" data-reload type="button">重新连接</button>')
    return
  }
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

const GRAPH_EDGES = [['orchestrator', 'doc-gen'], ['orchestrator', 'test-gen'], ['orchestrator', 'code'], ['doc-gen', 'doc-worker'], ['doc-worker', 'check'], ['test-gen', 'check'], ['code', 'check'], ['check', 'review']]

function graphNodeState(agentId, nodes) {
  const aliases = new Set([agentId, agentId.replaceAll('-', '_')])
  return nodes.filter((node) => aliases.has(node.agentId) || aliases.has(node.nodeId)).at(-1) ?? null
}

function renderGraph() {
  const selected = state.graphRunId || state.runs[0]?.runId || ''
  content.innerHTML = `<section class="reference-page-intro"><div><small>AGENT WORKFLOW</small><h2>Graph</h2><p>查看选定 Run 的 Agent 执行拓扑、节点状态和事件。</p></div><span class="status-pill">只读拓扑</span></section><section class="reference-graph-tools"><label>选择 Run　<select id="graph-run-select"><option value="">请选择 Run</option>${state.runs.map((run) => `<option value="${escapeHtml(run.runId)}" ${run.runId === selected ? 'selected' : ''}>${escapeHtml(run.moduleId)} · ${escapeHtml(shortId(run.runId))}</option>`).join('')}</select></label><span>每 10 秒轮询 · B2 event-stream PARTIAL</span></section><section id="graph-stage" class="reference-graph-shell">${selected ? '<div class="loading-state"><span class="spinner"></span>正在读取 Agent 节点事实…</div>' : emptyState('选择一个 Run', 'Graph 只展示服务端已记录的 Agent 工作状态。')}</section>`
  if (selected) loadGraph(selected).catch((error) => { const stage = document.querySelector('#graph-stage'); if (stage) stage.innerHTML = errorState('无法读取工作流图', error) })
}

async function loadGraph(runId) {
  state.graphRunId = runId
  const encoded = encodeURIComponent(runId)
  const [snapshot, nodePayload, workflowStatus, eventPayload] = await Promise.all([
    request(`/api/v1/runs/${encoded}`), request(`/api/v1/runs/${encoded}/workflow-nodes`),
    request(`/api/v1/runs/${encoded}/workflow-status`).catch(() => ({ status: 'PENDING', partial: true })),
    request(`/api/v1/runs/${encoded}/events?after=0`),
  ])
  const nodes = collection(nodePayload, 'nodes').length ? collection(nodePayload, 'nodes') : (snapshot.workflowNodes ?? [])
  const events = collection(eventPayload, 'events').length ? collection(eventPayload, 'events') : (snapshot.events ?? [])
  state.graphSnapshot = { snapshot, nodes, events, workflowStatus }
  const stage = document.querySelector('#graph-stage')
  if (!stage || state.page !== 'graph' || state.graphRunId !== runId) return
  const definitions = state.agents.length ? state.agents : Object.keys(AGENT_LABELS).map((agentId) => ({ agentId }))
  stage.innerHTML = `<div class="reference-graph-canvas"><div class="workflow-graph" aria-label="只读 Agent 工作流图">${definitions.map((agent) => { const node = graphNodeState(agent.agentId, nodes); const status = node?.status ?? 'PENDING'; return `<button class="graph-node ${escapeHtml(status.toLowerCase())}" data-graph-agent="${escapeHtml(agent.agentId)}"><span class="graph-node-icon" aria-hidden="true">${['COMMITTED', 'COMPLETED'].includes(status) ? '✓' : status === 'FAILED' ? '!' : status === 'RUNNING' ? '●' : '○'}</span><b>${escapeHtml(AGENT_LABELS[agent.agentId] ?? agent.name ?? agent.agentId)}</b>${badge(status)}<small>${node ? `第 ${(node.iteration ?? 0) + 1} 轮 · attempt ${node.attempt ?? (node.retryCount ?? 0) + 1}` : '尚无执行记录'}</small></button>` }).join('')}</div></div><aside class="reference-node-detail"><header><em>RUN AGENTS</em><b>${nodes.length}</b></header><h3>${escapeHtml(snapshot.run?.moduleId ?? runId)}</h3><p>业务状态 ${escapeHtml(displayLabel(snapshot.run?.state))} · 工作流 ${escapeHtml(displayLabel(workflowStatus.status ?? workflowStatus.workflowStatus ?? 'PENDING'))}</p><small>FIXED EDGES</small>${GRAPH_EDGES.slice(0, 5).map(([from, to]) => `<div><span>${escapeHtml(from)}</span><b>→ ${escapeHtml(to)}</b></div>`).join('')}<button class="wide" data-page-link="evaluations">查看评测证据 →</button></aside>`
}

function openGraphNode(agentId, returnFocus) {
  const { nodes = [], events = [] } = state.graphSnapshot ?? {}
  const node = graphNodeState(agentId, nodes)
  drawerTitle.textContent = AGENT_LABELS[agentId] ?? agentId
  drawerContent.innerHTML = `${node ? `<div class="drawer-badges">${badge(node.status)}</div><dl class="fact-grid"><div><dt>节点</dt><dd>${escapeHtml(node.nodeId)}</dd></div><div><dt>Agent</dt><dd>${escapeHtml(node.agentId ?? agentId)}</dd></div><div><dt>轮次</dt><dd>${escapeHtml((node.iteration ?? 0) + 1)}</dd></div><div><dt>Attempt</dt><dd>${escapeHtml(node.attempt ?? (node.retryCount ?? 0) + 1)}</dd></div></dl><section class="drawer-section"><h3>受控执行事实</h3><pre class="json-view">${json(node)}</pre></section>` : partialNotice('这个 Agent 在当前 Run 中尚无服务端节点记录。')}<section class="drawer-section"><h3>相关事件</h3><pre class="json-view">${json(events.filter((record) => JSON.stringify(record).includes(agentId)).slice(-10))}</pre></section>`
  openDrawer(returnFocus)
}

async function renderEvidence() {
  if (state.resourceErrors.runs) {
    content.innerHTML = errorState('无法读取证据索引', state.resourceErrors.runs, '<button class="primary-button" data-reload type="button">重新连接</button>')
    return
  }
  content.innerHTML = '<div class="loading-state"><span class="spinner"></span>正在汇总评测证据…</div>'
  const snapshots = await Promise.all(state.runs.slice(0, 20).map((run) => request(`/api/v1/runs/${encodeURIComponent(run.runId)}`).catch(() => null)))
  const failed = snapshots.filter((snapshot) => !snapshot).length
  const records = snapshots.flatMap((snapshot) => (snapshot?.evaluations ?? []).map((record) => ({ ...record, run: snapshot.run }))).reverse()
  content.innerHTML = `
    ${failed ? partialNotice(`${failed} 个 Run 快照读取失败，以下为其余 Run 的持久化证据。`) : ''}
    <section class="reference-page-intro"><div><small>QUALITY</small><h2>Evaluations</h2><p>核对评测报告、门禁判定和不可变执行证据。</p></div><button disabled>Evaluation rules · Disabled</button></section>
    <section class="reference-metrics"><article><small>EVALUATIONS</small><b class="mint">${records.length}</b><p>来自 Run snapshot</p></article><article><small>RUNS READ</small><b>${snapshots.length - failed}</b><p>${failed} 个读取失败</p></article><article><small>RULE MANAGEMENT</small><b>—</b><p>等待 B3 API</p></article><article><small>DATA MODE</small><b>PARTIAL</b><p>跨 Run 聚合预览</p></article></section>
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

async function renderDiscovery(force = false) {
  content.innerHTML = '<div class="loading-state"><span class="spinner" aria-hidden="true"></span>正在扫描已配置来源…</div>'
  try {
    if (!state.discovery || force) state.discovery = await request('/api/v1/sources/scan')
    const { candidates = [], total = candidates.length, truncated = false } = state.discovery
    content.innerHTML = `
      <section class="reference-page-intro"><div><small>INPUTS</small><h2>Sources</h2><p>查看服务端已配置边界内扫描到的真实来源候选。</p></div><button class="new" data-refresh-discovery type="button">↻ Scan sources</button></section>
      <section class="reference-metrics"><article><small>CANDIDATES</small><b class="mint">${candidates.length}</b><p>本次只读扫描</p></article><article><small>DISCOVERED</small><b>${total}</b><p>服务端返回总数</p></article><article><small>TRUNCATED</small><b>${truncated ? 'YES' : 'NO'}</b><p>受查询上限约束</p></article><article><small>REGISTRY</small><b>DISABLED</b><p>等待 B3 API</p></article></section>
      <section class="panel discovery-panel">
        <div class="section-heading"><div><p class="eyebrow">只读来源扫描</p><h2>当前来源候选</h2><p>候选来自服务端已配置目录；这里不是持久化来源注册表。</p></div><button class="secondary-button" data-refresh-discovery type="button">重新扫描</button></div>
        ${truncated ? partialNotice(`结果已达到服务端上限，当前展示 ${candidates.length} 条，共发现 ${total} 条。`) : ''}
        <div class="candidate-list">${candidates.length ? candidates.map((candidate) => `<article class="candidate-card">
          <div><b>${escapeHtml(candidate.path)}</b><small>${escapeHtml(formatDate(candidate.modifiedAt))}</small></div>
          <dl><div><dt>大小</dt><dd>${escapeHtml(candidate.size)} 字节</dd></div><div><dt>内容摘要</dt><dd><code>${escapeHtml(candidate.sha256)}</code></dd></div></dl>
        </article>`).join('') : emptyState('没有来源候选', '服务端当前没有扫描到尚未登记的知识来源。')}</div>
      </section>`
  } catch (error) {
    content.innerHTML = errorState('无法读取来源候选', error, '<button class="primary-button" data-refresh-discovery type="button">重新扫描</button>')
  }
}

function renderSettings() {
  const capabilities = state.capabilities ?? {}
  const status = state.status ?? {}
  content.innerHTML = `
    <div class="settings-grid">
      <section class="panel"><p class="eyebrow">本地运行</p><h2>运行状态</h2><dl class="settings-list">
        <div><dt>知识登记簿</dt><dd>${badge(state.resourceErrors.status ? 'FAILED' : 'VERIFIED', state.resourceErrors.status ? '读取失败' : '已连接')}</dd></div>
        <div><dt>知识版本</dt><dd>${escapeHtml(status.knowledgeTotal ?? '不可用')}</dd></div>
        <div><dt>运行次数</dt><dd>${escapeHtml(status.runs ?? '不可用')}</dd></div>
        <div><dt>发布记录</dt><dd>${escapeHtml(status.publications ?? '不可用')}</dd></div>
      </dl></section>
      <section class="panel"><p class="eyebrow">安全边界</p><h2>能力范围</h2><dl class="settings-list">
        <div><dt>接口写入</dt><dd>${state.capabilities ? badge(capabilities.writeEnabled ? 'VERIFIED' : 'CANDIDATE', capabilities.writeEnabled ? '已启用令牌' : '已关闭') : badge('FAILED', '读取失败')}</dd></div>
        <div><dt>项目评测</dt><dd>${badge('CANDIDATE', '仅限受信源码')}</dd></div>
        <div><dt>敌对代码隔离</dt><dd>${state.capabilities ? badge(capabilities.hostileCodeIsolation ? 'VERIFIED' : 'FAILED', capabilities.hostileCodeIsolation ? '已启用' : '暂不可用') : badge('FAILED', '读取失败')}</dd></div>
        <div><dt>自动工作流</dt><dd>${state.capabilities ? badge(capabilities.automatedWorkflow ? 'VERIFIED' : 'LOW_CONFIDENCE', capabilities.automatedWorkflow ? '可用' : '规划中') : badge('FAILED', '读取失败')}</dd></div>
        <div><dt>智能体通信</dt><dd>${state.capabilities ? badge(capabilities.agentPromptTransport === 'sdk-stdio-json-rpc' ? 'VERIFIED' : 'CANDIDATE', capabilities.agentPromptTransport === 'sdk-stdio-json-rpc' ? '已连接' : '未确认') : badge('FAILED', '读取失败')}</dd></div>
        <div><dt>智能体源码隔离</dt><dd>${state.capabilities ? badge(capabilities.agentSourceIsolation === 'bubblewrap' ? 'VERIFIED' : 'LOW_CONFIDENCE', capabilities.agentSourceIsolation === 'bubblewrap' ? '已启用' : '未证明') : badge('FAILED', '读取失败')}</dd></div>
      </dl></section>
      <section class="panel full-span"><p class="eyebrow">治理写入</p><h2>配置服务端令牌</h2>${!state.capabilities
        ? '<div class="notice"><b>能力状态暂不可用。</b><p>重新连接并成功读取能力接口之前，控制台不会开放任何写操作。</p></div>'
        : capabilities.writeEnabled
        ? '<div class="notice"><b>服务端写入已经启用。</b><p>点击右上角“治理模式”，输入与本地配置文件相同的令牌，即可执行受保护的写操作。</p></div>'
        : '<div class="notice"><b>当前没有配置写入令牌，因此服务端保持只读。</b><p>复制仓库根目录的 <code>.env.example</code> 为 <code>.env.local</code>，把占位值换成随机长令牌，然后重启服务。</p><pre>WP_KNOWLEDGE_WRITE_TOKEN=请替换为随机长令牌\nWP_FLYWHEEL_HOME=.workpanel</pre><p>配置文件不会提交到版本库。启动命令会自动读取它。</p></div>'}</section>
      <section class="panel full-span"><p class="eyebrow">当前能力</p><h2>尚未开放通用启动接口</h2><div class="notice"><b>运行工作台目前以观察和固定场景验收为主。</b><p>固定源码验收已经支持两轮自动编排；通用工作流命令接口尚未完成，所以页面不会用直接改状态的方式伪装自动化。</p></div></section>
    </div>`
}

function renderAgents() {
  if (state.resourceErrors.agents) {
    content.innerHTML = errorState('无法读取智能体目录', state.resourceErrors.agents, '<button class="primary-button" data-reload type="button">重新连接</button>')
    return
  }
  const canEdit = Boolean(state.operatorMode && state.capabilities?.writeEnabled)
  content.innerHTML = `
    <section class="reference-page-intro"><div><small>AGENT CONFIGURATION</small><h2>Agent Settings</h2><p>查看固定 Agent 契约并在授权后编辑追加提示词。</p></div>${badge(canEdit ? 'VERIFIED' : 'CANDIDATE', canEdit ? '可编辑提示词' : '只读查看')}</section>
    <section class="reference-metrics"><article><small>AGENTS</small><b class="mint">${state.agents.length}</b><p>固定角色定义</p></article><article><small>EDIT MODE</small><b>${canEdit ? 'ON' : 'OFF'}</b><p>需要治理令牌</p></article><article><small>TOPOLOGY</small><b>FIXED</b><p>不可从前台修改</p></article><article><small>PROVIDER STATUS</small><b>—</b><p>等待 B4 API</p></article></section>
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
  clearInterval(state.graphPoll)
  state.graphPoll = null
  if (page === 'graph') {
    renderGraph()
    state.graphPoll = setInterval(() => state.page === 'graph' && state.graphRunId && loadGraph(state.graphRunId).catch(() => {}), 10_000)
  }
  if (page === 'evaluations') await renderEvidence()
  if (page === 'sources') await renderDiscovery()
  if (page === 'agent-settings') {
    renderAgents()
    content.insertAdjacentHTML('afterbegin', '<section class="panel settings-summary"><p class="eyebrow">PROVIDER STATUS · PLANNED</p><h2>Agent 运行边界</h2><p>Agent 固定契约来自服务端；Provider 健康接口尚未接入，不展示推测状态。</p></section>')
  }
  closeNavigation()
  content.focus({ preventScroll: true })
}

async function openRun(runId) {
  setPageMeta('runs')
  state.page = 'runs'
  content.innerHTML = '<div class="loading-state"><span class="spinner"></span>正在读取运行快照…</div>'
  state.selectedRun = await request(`/api/v1/runs/${encodeURIComponent(runId)}`)
  renderRunWorkspace(state.selectedRun)
}

function openEvidence(encoded, returnFocus) {
  const record = JSON.parse(encoded)
  drawerTitle.textContent = '评测证据'
  drawerContent.innerHTML = `<div class="drawer-badges">${badge(record.decision.outcome)}</div>
    <section class="drawer-section"><h3>评测报告</h3><pre class="json-view">${json(record.report)}</pre></section>
    <section class="drawer-section"><h3>门禁判定</h3><pre class="json-view">${json(record.decision)}</pre></section>`
  openDrawer(returnFocus)
}

function openDrawer(returnFocus = document.activeElement) {
  drawerReturnFocus = returnFocus
  drawerReturnKey = returnFocus?.dataset?.versionId
    ? `[data-version-id="${CSS.escape(returnFocus.dataset.versionId)}"]`
    : null
  drawer.hidden = false
  drawer.setAttribute('aria-hidden', 'false')
  drawerBackdrop.hidden = false
  requestAnimationFrame(() => drawer.classList.add('open'))
  drawerClose.focus()
}

function closeDrawer() {
  if (drawer.hidden && !drawer.classList.contains('open')) return
  drawer.classList.remove('open')
  drawer.setAttribute('aria-hidden', 'true')
  drawerBackdrop.hidden = true
  drawer.hidden = true
  const returnTarget = document.contains(drawerReturnFocus) ? drawerReturnFocus : (drawerReturnKey ? document.querySelector(drawerReturnKey) : null)
  if (returnTarget instanceof HTMLElement) returnTarget.focus()
  setTimeout(() => {
    drawerReturnFocus = null
    drawerReturnKey = null
  }, 180)
}

function openNavigation() {
  sidebar.classList.add('open')
  sidebar.setAttribute('aria-hidden', 'false')
  navBackdrop.hidden = false
  navToggle.setAttribute('aria-expanded', 'true')
  navToggle.setAttribute('aria-label', '关闭主导航')
  nav.querySelector('[data-page].active')?.focus()
}

function closeNavigation() {
  sidebar.classList.remove('open')
  navBackdrop.hidden = true
  navToggle.setAttribute('aria-expanded', 'false')
  navToggle.setAttribute('aria-label', '打开主导航')
  if (matchMedia('(max-width: 767px)').matches) sidebar.setAttribute('aria-hidden', 'true')
  else sidebar.setAttribute('aria-hidden', 'false')
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
  await request(`/api/v1/knowledge/${encodeURIComponent(form.dataset.version)}/feedback`, {
    method: 'POST',
    body: JSON.stringify({
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
  state.agents = collection(await request('/api/v1/agents'), 'agents')
  renderAgents()
  showToast(`${agentId} 的追加提示词已保存，只影响后续执行。`, 'success')
}

async function startWorkflow(form) {
  if (!state.operatorMode || !state.token) {
    showToast('请先进入治理模式，再启动自动运行。', 'warning')
    return
  }
  const data = new FormData(form)
  const handle = await request('/api/v1/runs', {
    method: 'POST',
    body: JSON.stringify({
      profile: 'ohmyworkpanel',
      repositoryRoot: String(data.get('repositoryRoot') || ''),
      workerCount: Number(data.get('workerCount') || 1),
    }),
  })
  state.runs = collection(await request('/api/v1/runs'), 'runs')
  const runId = handle.runId ?? handle.resourceId
  showToast(`自动运行 ${shortId(runId, 16)} 已启动。`, 'success')
  await openRun(runId)
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
  if (knowledgeButton) openKnowledge(knowledgeButton.dataset.versionId, knowledgeButton).catch(showFatal)
  const evidenceButton = event.target.closest('[data-evidence]')
  if (evidenceButton) openEvidence(evidenceButton.dataset.evidence, evidenceButton)
  const graphNode = event.target.closest('[data-graph-agent]')
  if (graphNode) openGraphNode(graphNode.dataset.graphAgent, graphNode)
  const unavailable = event.target.closest('[data-unavailable]')
  if (unavailable) showUnavailable()
  if (event.target.closest('[data-reload]')) location.reload()
  if (event.target.closest('[data-refresh-discovery]')) renderDiscovery(true)
  const copy = event.target.closest('[data-copy]')
  if (copy) {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(copy.dataset.copy).then(() => showToast('已复制摘要。')).catch(() => showToast('复制失败。', 'warning'))
    else showToast('当前浏览器不支持剪贴板写入。', 'warning')
  }
})

content.addEventListener('input', (event) => {
  if (event.target.id !== 'knowledge-search') return
  clearTimeout(state.searchTimer)
  state.searchTimer = setTimeout(async () => {
    const query = event.target.value.trim()
    try {
      const status = document.querySelector('#knowledge-status')?.value ?? ''
      const result = query
        ? await request(`/api/v1/knowledge?q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}`)
        : await request(`/api/v1/knowledge?status=${encodeURIComponent(status)}`)
      const items = collection(result, 'knowledge')
      document.querySelector('#knowledge-list').innerHTML = knowledgeCards(items)
      document.querySelector('#knowledge-count').textContent = items.length
    } catch (error) {
      document.querySelector('#knowledge-list').innerHTML = errorState('检索失败', error)
      document.querySelector('#knowledge-count').textContent = '—'
    }
  }, 250)
})

content.addEventListener('change', async (event) => {
  if (event.target.id === 'graph-run-select') {
    const runId = event.target.value
    state.graphRunId = runId
    const stage = document.querySelector('#graph-stage')
    if (!runId) {
      if (stage) stage.innerHTML = emptyState('选择一个 Run', 'Graph 只展示服务端已记录的 Agent 工作状态。')
      return
    }
    if (stage) stage.innerHTML = '<div class="loading-state"><span class="spinner"></span>正在读取 Agent 节点事实…</div>'
    await loadGraph(runId)
  }
  if (event.target.id === 'knowledge-status') {
    const selected = event.target.value
    const result = await request(`/api/v1/knowledge?status=${encodeURIComponent(selected)}`)
    const items = collection(result, 'knowledge')
    document.querySelector('#knowledge-list').innerHTML = knowledgeCards(items)
    document.querySelector('#knowledge-count').textContent = items.length
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
  if (target) target.innerHTML = runs.length ? runs.map((run, index) => target.closest('.reference-run-history') ? referenceRunRow(run, index === 0) : runRow(run)).join('') : emptyState('没有匹配的运行', '请选择其他状态筛选。')
}

operatorButton.addEventListener('click', () => {
  if (!state.capabilities) {
    showToast('能力状态读取失败，请重新连接后再试。', 'warning')
    return
  }
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
navToggle.addEventListener('click', () => sidebar.classList.contains('open') ? closeNavigation() : openNavigation())
navBackdrop.addEventListener('click', () => { closeNavigation(); navToggle.focus() })
globalSearchButton.addEventListener('click', async () => {
  await navigate('knowledge')
  document.querySelector('#knowledge-search')?.focus()
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
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    globalSearchButton.click()
  }
  if (event.key === 'Escape' && drawer.classList.contains('open')) closeDrawer()
  else if (event.key === 'Escape' && sidebar.classList.contains('open')) { closeNavigation(); navToggle.focus() }
  if (event.key === 'Tab' && drawer.classList.contains('open')) {
    const focusable = [...drawer.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((item) => !item.disabled && !item.hidden)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
})

function updateMode() {
  if (state.operatorMode) {
    modePill.textContent = '治理模式'
    modePill.className = 'status-pill operator'
    operatorButton.textContent = '退出治理'
  } else {
    modePill.textContent = !state.capabilities ? '能力未知' : (state.capabilities.writeEnabled ? '只读模式' : '写入关闭')
    modePill.className = `status-pill ${state.capabilities?.writeEnabled ? '' : 'disabled'}`
    operatorButton.textContent = '＋ New run'
  }
  if (state.page === 'agent-settings') renderAgents()
  if (state.page === 'runs') renderRuns()
}

function showFatal(error) {
  registryIndicator.className = 'health-dot failed'
  registryLabel.textContent = '连接失败'
  content.innerHTML = emptyState('无法读取知识飞轮', error.message, '<button class="primary-button" data-reload>重新连接</button>')
}

async function boot() {
  const keys = ['status', 'capabilities', 'runs', 'knowledge', 'agents']
  const results = await Promise.allSettled([
    request('/api/v1/system/status'), request('/api/v1/system/capabilities'), request('/api/v1/runs'), request('/api/v1/knowledge'), request('/api/v1/agents'),
  ])
  results.forEach((result, index) => {
    if (result.status === 'rejected') state.resourceErrors[keys[index]] = result.reason
  })
  if (results.every((result) => result.status === 'rejected')) throw results[0].reason
  state.status = results[0].status === 'fulfilled' ? results[0].value : null
  state.capabilities = results[1].status === 'fulfilled' ? results[1].value : null
  state.runs = results[2].status === 'fulfilled' ? collection(results[2].value, 'runs') : []
  state.knowledge = results[3].status === 'fulfilled' ? collection(results[3].value, 'knowledge') : []
  state.agents = results[4].status === 'fulfilled' ? collection(results[4].value, 'agents') : []
  state.loadedAt = new Date().toISOString()
  const partial = Object.keys(state.resourceErrors).length > 0
  registryIndicator.className = `health-dot ${partial ? 'pending' : 'healthy'}`
  registryLabel.textContent = partial ? '部分数据可用' : '服务已连接'
  governanceCount.textContent = state.runs.filter(needsAttention).length || ''
  runtimeFooter.innerHTML = `<span><i class="health-dot healthy"></i>控制台 API 已连接</span><span>读取于 ${escapeHtml(formatDate(state.loadedAt))}</span><span>${escapeHtml(state.runs.length)} 次运行 · ${escapeHtml(state.knowledge.length)} 个知识版本</span>`
  updateMode()
  setPageMeta('overview')
  renderOverview()
  closeNavigation()
}

boot().catch(showFatal)
