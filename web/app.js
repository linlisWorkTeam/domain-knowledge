const content = document.querySelector('#page-content')
const nav = document.querySelector('#primary-nav')
const title = document.querySelector('#page-title')
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
  overview: '操作中心',
  runs: '飞轮批次',
  knowledge: '知识',
  graph: '工作流图',
  evaluations: '评测',
  sources: '来源',
  'agent-settings': 'Agent 设置',
}

const UI_LABELS = {
  CREATED: '已创建', PLANNED: '已计划', GENERATING: '生成中', EVALUATING: '评测中',
  REVIEWING: '复核中', ITERATING: '迭代中', ROLLING_BACK: '回滚中', PUBLISHING: '发布中',
  VERIFIED: '已验证', LOW_CONFIDENCE: '低置信', FAILED: '失败', CANCELLED: '已取消',
  CANDIDATE: '候选', SUPERSEDED: '已替代', ACCEPTED: '质量合格', REJECTED: '质量未通过',
  PASS: '通过', ITERATE: '继续迭代', ROLLBACK: '回滚', STOPPED: '已停止',
  PENDING: '等待中', RUNNING: '运行中', COMPLETED: '已完成', COMMITTED: '已提交',
  AVAILABLE: '可用', DEGRADED: '降级', UNAVAILABLE: '不可用', UNKNOWN: '未知',
  AUTHENTICATED: '已认证', NOT_CONFIGURED: '未配置', UNVERIFIED: '未验证',
  ACTIVE: '正常', STALE: '已过期', DISABLED: '已停用',
  OPEN: '待处理', ACKNOWLEDGED: '已接手', RESOLVED: '已解决',
  PASSED: '已通过', ERROR: '评测错误',
  EVIDENCE: '评测证据', FILE: '文件',
  REAL: '真实批次', FIXTURE: '验收批次', MIXED: '混合样本', EMPTY: '无样本',
  RUN_FAILED: '批次执行失败', GATE_STOPPED: '门禁停止',
  COMPONENT_UNAVAILABLE: '组件不可用', SOURCE_DRIFT: '来源漂移',
  SOURCE_UNAVAILABLE: '来源不可用', SOURCE_REVISION_DRIFT: '来源修订漂移',
}

const EVENT_LABELS = {
  RunCreated: '创建批次', RunStateChanged: '批次状态变化', NodeCompleted: '节点完成',
  NodeFailed: '节点失败', GateDecided: '门禁完成判定', KnowledgePublished: '知识已发布',
  ArtifactCommitted: '工件已提交', AgentPromptConfigured: 'Agent 提示词已更新',
  WorkflowNodeStateChanged: '工作流节点状态变化', RunConfigurationCaptured: '批次配置已冻结',
  ComponentStatusChanged: '组件状态变化',
}

const RESOURCE_LABELS = {
  status: '系统状态', capabilities: '系统能力', runs: '批次', knowledge: '知识', agents: 'Agent',
  actionItems: '治理事项', activities: '最近动态', components: '组件状态', knowledgeHealth: '知识健康度',
  providerStatus: '服务提供方状态', providerSettings: '服务提供方配置', runMetrics: '运行指标', governanceMetrics: '治理指标',
}

const ERROR_LABELS = {
  UNAUTHORIZED: '没有权限执行这项操作。',
  WRITE_API_DISABLED: '服务端尚未启用写入能力。',
  IDEMPOTENCY_KEY_REQUIRED: '请求缺少幂等键，请刷新后重试。',
  PAYLOAD_INVALID: '提交的内容不符合接口要求。',
  ARGUMENT_INVALID: '提交的参数无效。',
  REVISION_INVALID: '修订号无效，请刷新后重试。',
  REVISION_CONFLICT: '记录已被其他操作更新，请刷新后重试。',
  IDEMPOTENCY_CONFLICT: '请求标识已用于不同操作，请刷新后重试。',
  PROVIDER_URL_DENIED: '该 API 地址不在允许的网络范围内。',
  PROVIDER_URL_INVALID: '请输入有效的 HTTPS API 地址。',
  PROVIDER_URL_UNREACHABLE: '无法连接该 API 地址。',
  PROVIDER_ENDPOINT_UNSUPPORTED: '该 API 地址不支持所需的验证接口。',
  PROVIDER_AUTH_DENIED: 'API Key 验证失败。',
  PROVIDER_AUTH_INVALID: 'API Key 验证失败。',
  PROVIDER_MODEL_UNAVAILABLE: '配置的模型当前不可用。',
  PROVIDER_RATE_LIMITED: '模型服务暂时限流，请稍后重试。',
  PROVIDER_TIMEOUT: '连接验证超时。',
  PROVIDER_UNREACHABLE: '无法连接模型服务。',
  PROVIDER_UNAVAILABLE: '模型服务当前不可用。',
  PROVIDER_RESPONSE_INVALID: '模型服务返回了无法识别的响应。',
  PROVIDER_REDIRECT_DENIED: '模型服务返回了不允许的重定向。',
  PROVIDER_SETTINGS_INVALID: '服务提供方配置无效。',
  PROVIDER_SETTINGS_REQUIRED: '请先完整保存服务提供方配置。',
  PROVIDER_KEY_INVALID: 'API Key 无效。',
  PROVIDER_MODEL_INVALID: '请输入有效的模型标识。',
  PROVIDER_UNSUPPORTED: '当前不支持这种服务提供方。',
  SETTINGS_INVALID: '服务提供方配置无效。',
  SETTINGS_REQUIRED: '请先完整保存服务提供方配置。',
  KEY_INVALID: 'API Key 无效。',
  MODEL_INVALID: '请输入有效的模型标识。',
  UNSUPPORTED: '当前服务不支持这项操作。',
  METRICS_WINDOW_INVALID: '统计窗口无效，请重新选择。',
  VERIFICATION_REQUIRED: '当前配置尚未通过验证。',
  EVALUATION_RULE_NOT_FOUND: '未找到这条评测规则。',
  EVALUATION_NOT_FOUND: '未找到这条评测记录。',
  EVALUATION_ARTIFACT_NOT_FOUND: '未找到这份评测证据。',
  SOURCE_NOT_FOUND: '未找到这个来源。',
  SOURCE_ALREADY_EXISTS: '该来源已经登记。',
  SOURCE_ACCESS_DENIED: '来源不在允许的访问范围内。',
  SOURCE_ACCESS_FAILED: '无法读取该来源。',
  SOURCE_CREDENTIAL_UNAVAILABLE: '来源凭据当前不可用。',
  SOURCE_DISABLED: '该来源已停用。',
  SOURCE_KIND_UNSUPPORTED: '当前不支持这种来源类型。',
  SOURCE_REVISION_INVALID: '确认修订与最新观测内容不一致，请先刷新来源。',
  SOURCE_URL_INVALID: '请输入有效的 HTTPS 来源地址。',
}

const NODE_LABELS = {
  orchestrator: '编排', doc_gen: '文档生成', doc_worker: '文档分块', test_gen: '测试生成',
  code: '代码生成', check: '检查', review: '复核', evaluate: '评测', publish: '发布',
}

const AGENT_LABELS = {
  orchestrator: '编排 Agent', 'doc-gen': '文档生成 Agent', 'doc-worker': '文档分块 Agent',
  'test-gen': '测试生成 Agent', code: '代码生成 Agent', check: '检查 Agent', review: '复核 Agent',
}

const PROVIDER_LABELS = {
  fixture: '本地验收模拟器',
  'pi-agent': 'Pi Agent',
  'deepseek-harness': 'DeepSeek Harness',
  'deepseek-harness-headless': 'DeepSeek Harness 无界面模式',
}

const METRIC_DEFINITION_LABELS = {
  runDurationMs: '终态批次的最后更新时间减去创建时间',
  nodeDurationMs: '节点单次执行的完成时间减去开始时间',
  queueDurationMs: '节点开始时间减去最近可执行时间',
  providerRetries: '模型输出无效后发起的额外调用，不包含工作流节点恢复',
  workflowNodeRetries: '持久化尝试次数大于一的工作流节点额外尝试',
  estimatedCostUsd: '服务提供方用量按已配置模型价格估算，无价格时为空',
  firstRevisionPassRate: '至少两次门禁判定的批次中，第二次判定通过的比例',
  threeIterationConvergenceRate: '最多三次门禁判定内出现通过的比例',
  humanInterventionRate: '统计窗口内记录过人工治理动作的批次比例',
  meanResolutionTimeMs: '已解决治理事项从创建到解决的平均时间',
  shortTermRecurrenceRate: '解决后七天内出现关联复发事项的比例',
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
  actionItems: [],
  activities: [],
  components: null,
  knowledgeHealth: null,
  evaluations: [],
  evaluationEnvelope: null,
  evaluationFilters: { runId: '', moduleId: '', gate: '', status: '', from: '', to: '' },
  evaluationRules: [],
  sources: [],
  sourceEnvelope: null,
  sourceStatus: '',
  sourceKind: '',
  sourceProject: '',
  providerStatus: null,
  providerSettings: null,
  runMetrics: null,
  governanceMetrics: null,
  metricsWindow: '7d',
  knowledgeModule: '',
  knowledgeQuery: '',
  knowledgeStatus: '',
  token: '',
  operatorMode: false,
  selectedRun: null,
  discovery: null,
  resourceErrors: {},
  loadedAt: null,
  graphRunId: null,
  graphSnapshot: null,
  graphPoll: null,
  graphStream: null,
  activityStream: null,
  activityPoll: null,
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
  if (['POST', 'PUT', 'PATCH'].includes(options.method) && !headers['Idempotency-Key']) headers['Idempotency-Key'] = crypto.randomUUID()
  if (state.token) headers.authorization = `Bearer ${state.token}`
  const response = await fetch(path, { ...options, headers })
  let payload = null
  try { payload = await response.json() } catch { payload = null }
  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.message || (typeof payload?.error === 'string' ? payload.error : '') || `${response.status} ${path}`)
    error.status = response.status
    error.code = payload?.error?.code ?? null
    error.details = payload?.error?.details ?? {}
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
  return `<div class="empty-state error-state" role="alert"><span aria-hidden="true">!</span><h3>${escapeHtml(titleText)}</h3><p>${escapeHtml(userFacingError(error))}</p>${action}</div>`
}

function userFacingError(error, fallback = '请求失败，请稍后重试。') {
  return ERROR_LABELS[error?.code] ?? fallback
}

function partialNotice(message) {
  return `<div class="partial-notice" role="status"><b>部分数据暂不可用</b><span>${escapeHtml(message)}</span></div>`
}

function metric(label, value, hint, tone = '') {
  return `<article class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(Number(value))
}

function formatDuration(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  const milliseconds = Number(value)
  if (milliseconds < 1_000) return `${formatNumber(milliseconds)} 毫秒`
  if (milliseconds < 60_000) return `${formatNumber(milliseconds / 1_000, 1)} 秒`
  if (milliseconds < 3_600_000) return `${formatNumber(milliseconds / 60_000, 1)} 分钟`
  return `${formatNumber(milliseconds / 3_600_000, 1)} 小时`
}

function formatRate(metricValue) {
  if (metricValue?.value === null || metricValue?.value === undefined) return '—'
  return `${formatNumber(Number(metricValue.value) * 100, 1)}%`
}

function sampleHint(value, fallback = '无可用样本') {
  const size = Number(value?.sampleSize ?? value ?? 0)
  return size > 0 ? `${formatNumber(size)} 个样本` : fallback
}

function sampledNumber(metricValue, field = 'total', digits = 0) {
  return Number(metricValue?.sampleSize ?? 0) > 0 ? formatNumber(metricValue?.[field], digits) : '—'
}

function lineageRelationList(lineage) {
  const relations = lineage?.relations ?? {}
  const runs = Array.isArray(relations.runs) ? relations.runs : []
  const evaluations = Array.isArray(relations.evaluations) ? relations.evaluations : []
  const corrections = Array.isArray(relations.corrections) ? relations.corrections : []
  const publications = Array.isArray(relations.publications) ? relations.publications : []
  const provenance = Array.isArray(relations.provenance) ? relations.provenance : []
  return `<div class="lineage-relations">
    <div><h4>产生批次</h4>${runs.length ? `<ul>${runs.map((run) => `<li><button class="text-button" data-lineage-run="${escapeHtml(run.runId)}" type="button">查看批次 ${escapeHtml(shortId(run.runId, 22))} →</button><small>${escapeHtml(displayLabel(run.state))} · ${escapeHtml(formatDate(run.updatedAt))}</small></li>`).join('')}</ul>` : '<p>暂无关联批次</p>'}</div>
    <div><h4>评测证据</h4>${evaluations.length ? `<ul>${evaluations.map((evaluation) => `<li><button class="text-button" data-evaluation-id="${escapeHtml(evaluation.evaluationId)}" type="button">查看评测 ${escapeHtml(shortId(evaluation.evaluationId, 22))} →</button><small>${escapeHtml(displayLabel(evaluation.gate ?? 'UNKNOWN'))} · 规则修订 ${escapeHtml(evaluation.ruleRef?.revision ?? '—')}</small></li>`).join('')}</ul>` : '<p>暂无关联评测</p>'}</div>
    <div><h4>修订记录</h4>${corrections.length ? `<ul>${corrections.map((correction) => `<li><button class="text-button" data-version-id="${escapeHtml(correction.toVersionId)}" type="button">查看修订版本 ${escapeHtml(shortId(correction.toVersionId, 22))} →</button><small>${escapeHtml(correction.correctionId)} · ${escapeHtml(correction.evidenceRefs?.length ?? 0)} 个证据引用</small></li>`).join('')}</ul>` : '<p>暂无关联修订</p>'}</div>
    <div><h4>发布凭据</h4>${publications.length ? `<ul>${publications.map((publication) => `<li><button class="copy-value compact" data-copy="${escapeHtml(publication.publicationKey)}" type="button"><code>${escapeHtml(publication.publicationKey)}</code><span>复制凭据</span></button><small>门禁 ${escapeHtml(shortId(publication.decisionId, 22))} · ${escapeHtml(formatDate(publication.publishedAt))}</small></li>`).join('')}</ul>` : '<p>当前版本尚无发布凭据</p>'}</div>
    <div><h4>输入来源</h4>${provenance.length ? `<ul>${provenance.map((source) => `<li><code>${escapeHtml(source.path ?? source.locator ?? '未知来源')}</code><small>${escapeHtml(source.commit ?? source.revision ?? '未记录修订')}</small></li>`).join('')}</ul>` : '<p>暂无来源记录</p>'}</div>
  </div>`
}

function metricDefinitions(...groups) {
  const keys = [...new Set(groups.flatMap((group) => Object.keys(group?.definitions ?? {})))]
  if (!keys.length) return ''
  return `<details class="metric-definitions"><summary>查看指标口径</summary><dl>${keys.map((key) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(METRIC_DEFINITION_LABELS[key] ?? '口径由服务端定义')}</dd></div>`).join('')}</dl></details>`
}

function healthMetric(name) {
  return state.knowledgeHealth?.metrics?.[name] ?? null
}

function healthValue(name) {
  const current = healthMetric(name)
  const value = current?.value
  return value === null || value === undefined ? '—' : `${formatNumber(Number(value) * 100, 0)}%`
}

function healthEvidence(name) {
  const current = healthMetric(name)
  if (current?.numerator === null || current?.numerator === undefined || current?.denominator === null || current?.denominator === undefined) return '无样本'
  return `${formatNumber(current.numerator)}/${formatNumber(current.denominator)}`
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
  title.textContent = PAGE_META[page] ?? PAGE_META.overview
  for (const item of nav.querySelectorAll('[data-page]')) item.classList.toggle('active', item.dataset.page === page)
}

function renderOverview() {
  const active = state.runs.filter((run) => !TERMINAL.has(run.state))
  const attention = state.actionItems.filter((item) => item.status !== 'RESOLVED')
  const status = state.status ?? {}
  const verified = state.status ? status.verified : (state.resourceErrors.knowledge ? '不可用' : state.knowledge.filter((item) => item.status === 'VERIFIED').length)
  const candidates = state.status ? status.candidates : (state.resourceErrors.knowledge ? '不可用' : state.knowledge.filter((item) => item.status === 'CANDIDATE').length)
  const recent = state.activities.slice(0, 6)
  const notices = ['status', 'runs', 'capabilities', 'actionItems', 'activities', 'components', 'knowledgeHealth'].filter((key) => state.resourceErrors[key])
  const latestRun = state.runs[0]
  const health = state.knowledgeHealth
  const healthOverall = typeof health?.overall === 'number'
    ? health.overall
    : health?.overall?.value
  const healthScore = healthOverall === null || healthOverall === undefined ? '—' : formatNumber(healthOverall)
  const healthAvailable = healthScore !== '—'
  const runIssueRows = attention.length ? attention.slice(0, 5).map((item, index) => {
    const isSource = item.subject?.kind === 'SOURCE' && item.subject?.id
    const subjectId = item.runId || item.subject?.id || ''
    const subjectLink = item.runId
      ? `data-run-id="${escapeHtml(item.runId)}"`
      : isSource ? `data-action-source-id="${escapeHtml(item.subject.id)}"` : 'disabled'
    const subjectLabel = isSource ? '来源' : '批次'
    return `
    <div class="attention-row ${index === 0 ? 'selected' : ''}">
      <i class="attention-dot ${item.severity === 'HIGH' ? 'danger' : 'warning'}" aria-hidden="true"></i>
      <button class="attention-subject" ${subjectLink} type="button"><b>${escapeHtml(item.summary)}</b><small>${subjectLabel} ${escapeHtml(shortId(subjectId, 26))} · ${escapeHtml(displayLabel(item.reasonCode))}</small></button>
      ${badge(item.status)}
      <div class="action-buttons">${(item.allowedActions ?? []).map((action) => `<button type="button" data-action-item="${escapeHtml(item.actionItemId)}" data-action="${escapeHtml(action)}" data-revision="${escapeHtml(item.revision)}" ${state.operatorMode ? '' : 'disabled'}>${escapeHtml({ ACKNOWLEDGE: '接手', RESOLVE: '解决', RETRY: '重试', REGENERATE: '重新生成' }[action] ?? action)}</button>`).join('')}</div>
      <time>${escapeHtml(formatDate(item.updatedAt))}</time>
    </div>`
  }).join('') : ''
  const queueRemainder = `<div class="queue-partial-state"><span aria-hidden="true">◇</span><div><b>${attention.length ? '暂无更多待办' : '目前没有待处理事项'}</b><small>${state.resourceErrors.actionItems ? '待处理事项读取失败' : '所有服务端治理事项均已处理'}</small></div><em>${state.resourceErrors.actionItems ? '读取失败' : '暂无数据'}</em></div>`
  const pulseRows = recent.slice(0, 3).map((activity) => `
    <button class="pulse-row" ${activity.runId ? `data-run-id="${escapeHtml(activity.runId)}"` : 'disabled'} type="button"><i class="${activity.severity === 'HIGH' ? 'warning' : 'success'}"></i><span><b>${escapeHtml(EVENT_LABELS[activity.type] ?? activity.summary)}</b><small>${escapeHtml(EVENT_LABELS[activity.type] ?? '系统活动')} · ${escapeHtml(formatDate(activity.occurredAt))}</small></span></button>`).join('')
  content.innerHTML = `
    ${notices.length ? partialNotice(`${notices.map((key) => RESOURCE_LABELS[key] ?? key).join('、')}获取失败；其余区域仍展示已读取的服务端事实。`) : ''}
    <section class="overview-summary-grid" aria-label="关键摘要">
      <article class="attention-summary">
        <span class="attention-orb"><i></i></span>
        <div><p class="eyebrow danger-text">需要处理</p><h2>${state.resourceErrors.actionItems ? '治理事项不可用' : `${attention.length} 项需要确认`}</h2><p>${state.resourceErrors.actionItems ? '无法读取治理事项' : '来自服务端持久化治理队列'}</p></div>
        <footer><i></i><i></i><i></i></footer>
      </article>
      <article class="knowledge-summary">
        <header><p class="eyebrow">知识健康度</p><span>${healthAvailable ? `${escapeHtml(health.window?.key ?? health.window ?? '当前窗口')} · 规则 ${escapeHtml(health.ruleVersion ?? '—')}` : '暂无完整样本'}</span></header>
        <div><strong>${escapeHtml(healthScore)}</strong><small>/ 100</small><b>${healthAvailable ? `采样于 ${escapeHtml(formatDate(health.sampledAt))}` : '无分母时不计算分数'}</b></div>
        <footer><span>覆盖率 <b>${escapeHtml(healthValue('coverage'))}</b><small>${escapeHtml(healthEvidence('coverage'))}</small></span><span>新鲜度 <b>${escapeHtml(healthValue('freshness'))}</b><small>${escapeHtml(healthEvidence('freshness'))}</small></span><span>质量 <b>${escapeHtml(healthValue('quality'))}</b><small>${escapeHtml(healthEvidence('quality'))}</small></span></footer>
      </article>
    </section>
    <div class="overview-workspace">
      <section class="attention-queue">
        <header><div><h2>需要处理</h2><small>由批次、门禁、组件与来源事实产生</small></div><button class="text-button" data-page-link="runs">查看批次 →</button></header>
        <div class="queue-filters"><button class="active">全部　${attention.length}</button><button>批次失败　${attention.filter((item) => item.type === 'RUN_FAILED').length}</button><button>低置信　${attention.filter((item) => item.type === 'LOW_CONFIDENCE').length}</button><button>来源异常　${attention.filter((item) => item.subject?.kind === 'SOURCE').length}</button><span>${state.operatorMode ? '可执行治理操作' : '进入治理模式后可操作'}</span></div>
        <div class="queue-labels"><span>事项</span><span>状态与操作</span><span>更新</span></div>
        <div class="queue-body">${runIssueRows}${queueRemainder}</div>
      </section>
      <aside class="overview-rail">
        <article class="current-run-card">
          <header><small><i></i> 飞轮${active.length ? '运行中' : '状态'}</small><button class="text-button" data-page-link="runs">打开批次 ↗</button></header>
          ${latestRun ? `<h3>${escapeHtml(shortId(latestRun.runId, 18))}</h3><p>${escapeHtml(latestRun.moduleId)} · ${escapeHtml(displayLabel(latestRun.state))}</p><div class="run-state-line"><i></i></div><div class="run-state-meta"><b>${escapeHtml(displayLabel(latestRun.state))}</b><span>暂不提供预计完成时间</span></div>` : emptyState('暂无批次', '注册中没有批次记录。')}
          <ol class="flywheel-stages"><li class="observed"><i>1</i><span>发现<small>批次已登记</small></span></li><li class="observed"><i>2</i><span>生成<small>${latestRun ? escapeHtml(displayLabel(latestRun.state)) : '等待运行'}</small></span></li><li><i>3</i><span>评测<small>${state.latestProgress?.mode === 'DETERMINATE' ? `${state.latestProgress.completedUnits}/${state.latestProgress.totalUnits}` : '等待可证明进度'}</small></span></li><li><i>4</i><span>演进<small>发布状态待确认</small></span></li></ol>
        </article>
        <article class="recent-pulse"><header><h3>最近动态</h3><span>${state.activityStream ? '实时连接' : '轮询更新'}</span></header>${pulseRows || '<div class="pulse-empty"><b>暂无真实活动</b><small>服务端尚未记录活动</small></div>'}</article>
      </aside>
    </div>`
}

function renderRuns() {
  if (state.resourceErrors.runs) {
    content.innerHTML = errorState('无法读取批次列表', state.resourceErrors.runs, '<button class="primary-button" data-reload type="button">重新连接</button>')
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
    <section class="reference-metrics"><article><small>运行中</small><b class="mint">${active.length}</b><p>来自注册当前状态</p></article><article><small>已验证</small><b>${verified.length}</b><p>${state.runs.length} 个批次</p></article><article><small>需要处理</small><b>${state.runs.filter(needsAttention).length}</b><p>失败、低置信或已停止</p></article><article><small>知识版本</small><b>${state.runs.reduce((sum, run) => sum + (run.knowledgeVersionIds?.length ?? 0), 0)}</b><p>由批次事实汇总</p></article></section>
    <div class="reference-runs-grid"><section class="reference-run-history"><header><h3>批次记录</h3><button class="on" data-run-filter="">全部</button><button data-run-filter="active">运行中</button><button data-run-filter="attention">需处理</button></header><div id="runs-list">${rows || emptyState('没有批次记录', '当前注册中还没有批次记录。')}</div></section>
    <aside class="reference-run-detail">${latest ? `<header><small>最新批次</small><b>${escapeHtml(shortId(latest.runId, 18))}</b></header><div class="orbit-mini"><span>${escapeHtml(displayLabel(latest.state))}<small>批次状态</small></span></div><p class="done">✓ <b>批次事实</b><small>${escapeHtml(latest.moduleId)}</small></p><p class="doing">⌁ <b>Agent 工作流图</b><small>查看真实节点投影</small></p><p>3 <b>评测</b><small>${escapeHtml(latest.latestDecision?.outcome ? displayLabel(latest.latestDecision.outcome) : '等待门禁')}</small></p><button class="wide" data-run-id="${escapeHtml(latest.runId)}">打开批次详情 →</button>` : emptyState('暂无批次', '创建批次后在这里查看。')}</aside></div>
    <form id="workflow-start-form" class="reference-start-form"><label>受信项目路径<input name="repositoryRoot" placeholder="请输入项目仓库的绝对路径" required></label><label>并行任务数<input name="workerCount" type="number" min="0" max="5" value="1"></label><button class="new" type="submit" ${state.operatorMode ? '' : 'disabled'}>启动固定验收流程</button></form>`
}

function referenceRunRow(run, selected = false) {
  return `<button class="reference-run-item ${selected ? 'selected' : ''}" data-run-id="${escapeHtml(run.runId)}" type="button"><i class="${TERMINAL.has(run.state) ? (run.state === 'VERIFIED' ? 'run-ok' : 'run-bad') : 'run-live'}">${run.state === 'VERIFIED' ? '✓' : run.state === 'FAILED' ? '!' : ''}</i><span><b>${escapeHtml(shortId(run.runId, 18))}</b><small>${escapeHtml(run.moduleId)} · 第 ${escapeHtml(run.iteration + 1)} 轮</small></span><em>${escapeHtml(displayLabel(run.state))}</em><span>${escapeHtml(run.latestDecision?.outcome ? displayLabel(run.latestDecision.outcome) : '等待门禁')}</span><strong>${escapeHtml(run.knowledgeVersionIds?.length ?? 0)} 版本</strong><time>${escapeHtml(relativeTime(run.updatedAt))}</time></button>`
}

function renderRunWorkspace(snapshot) {
  const { run, events = [], checkpoints = [], workflowNodes = [], evaluations = [], versions = [], latestDecision, progress } = snapshot
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
      <button class="back-button" data-run-back>← 返回批次列表</button>
      <div class="run-title-row">
        <div><p class="eyebrow">${escapeHtml(shortId(run.runId, 28))}</p><h2>${escapeHtml(run.moduleId)}</h2><p class="subtitle">策略 ${escapeHtml(run.policyId)} · 更新于 ${escapeHtml(formatDate(run.updatedAt))}</p></div>
        <div class="run-title-actions">${badge(run.state)}<a class="secondary-button" href="/api/v1/runs/${encodeURIComponent(run.runId)}/report" download>导出报告</a><button class="secondary-button" data-refresh-run="${escapeHtml(run.runId)}">刷新</button></div>
      </div>
      <ol class="run-stepper">${steps}</ol>
      ${progress?.mode === 'DETERMINATE' ? `<div class="state-callout"><b>可证明进度：${escapeHtml(progress.completedUnits)} / ${escapeHtml(progress.totalUnits)}</b><span>当前阶段 ${escapeHtml(displayLabel(progress.currentStage))} · 不提供推测性的预计完成时间</span><progress class="progress" value="${escapeHtml(progress.completedUnits)}" max="${escapeHtml(progress.totalUnits)}"></progress></div>` : '<div class="state-callout"><b>进度暂不可确定</b><span>服务端没有完整冻结工作单元，不显示百分比或预计完成时间。</span></div>'}
      ${['ITERATING', 'ROLLING_BACK', 'LOW_CONFIDENCE', 'FAILED', 'CANCELLED'].includes(run.state) ? `<div class="state-callout ${run.state.toLowerCase().replaceAll('_', '-')}"><b>当前状态：${escapeHtml(displayLabel(run.state))}</b><span>第 ${escapeHtml(run.iteration + 1)} 轮 · 详情以事件与门禁证据为准</span></div>` : ''}
    </section>
    <div class="run-workspace-grid">
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">工作流执行记录</p><h2>自动化节点</h2><p>这里展示节点执行进度；运行聚合仍是业务状态的唯一依据。</p></div><span class="counter">${automationNodes.length}</span></div>
        <div class="node-list">${automationNodes.length ? automationNodes.map((node) => `
          <article class="node-card">
            <div><span class="node-icon">${['COMMITTED', 'COMPLETED'].includes(node.status) ? '✓' : node.status === 'FAILED' ? '!' : '●'}</span><div><b>${escapeHtml(NODE_LABELS[node.nodeId] ?? node.nodeId)}</b><small>${escapeHtml(node.agentId ? `${AGENT_LABELS[node.agentId] ?? node.agentId} · ${node.detail || '等待详情'}` : node.generationKey || node.detail || '确定性节点')}</small></div></div>
            <div>${badge(node.status)}<small>第 ${escapeHtml((node.iteration ?? run.iteration) + 1)} 轮 · 第 ${escapeHtml(node.attempt ?? ((node.retryCount ?? 0) + 1))} 次尝试</small></div>
          </article>`).join('') : emptyState('暂无节点记录', '这个批次可能由命令行创建，或者尚未执行 Agent 节点。')}</div>
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
  const modules = [...new Set(state.knowledge.map((item) => item.moduleId))].slice(0, 12)
  const visible = state.knowledgeModule ? items.filter((item) => item.moduleId === state.knowledgeModule) : items
  content.innerHTML = `
    <section class="reference-knowledge-tools"><label>⌕　<input id="knowledge-search" type="search" value="${escapeHtml(state.knowledgeQuery)}" placeholder="搜索概念、模块或正文…"></label><kbd>⌘ K</kbd><select id="knowledge-status" aria-label="知识状态"><option value="">全部状态</option>${['VERIFIED', 'CANDIDATE', 'LOW_CONFIDENCE', 'SUPERSEDED'].map((value) => `<option value="${value}" ${state.knowledgeStatus === value ? 'selected' : ''}>${displayLabel(value)}</option>`).join('')}</select></section>
    <div class="reference-knowledge-grid"><aside class="reference-domains"><header><h3>领域</h3><span id="knowledge-count">${visible.length}</span></header><button class="${state.knowledgeModule ? '' : 'active'}" data-knowledge-module="">全部知识 <b>${items.length}</b></button>${modules.map((moduleId) => `<button class="${state.knowledgeModule === moduleId ? 'active' : ''}" data-knowledge-module="${escapeHtml(moduleId)}">${escapeHtml(moduleId)} <b>${items.filter((item) => item.moduleId === moduleId).length}</b></button>`).join('')}</aside><section class="reference-docs"><header><span>知识</span><span>来源</span><span>质量</span><span>更新时间</span></header><div id="knowledge-list">${knowledgeCards(visible)}</div></section></div>`
}

function knowledgeCards(items) {
  return items.length ? items.map((item) => `<button class="reference-doc" data-version-id="${escapeHtml(item.versionId)}" data-module="${escapeHtml(item.moduleId)}"><span><em class="${item.status === 'VERIFIED' ? 'verified' : ''}">${escapeHtml(displayLabel(item.status))}</em><b>${escapeHtml(item.title || item.moduleId)}</b><small>${escapeHtml(item.description || item.moduleId)}</small></span><span>${escapeHtml(item.provenance?.length ?? 0)} 来源</span><strong class="${item.status === 'LOW_CONFIDENCE' ? 'risk' : ''}">${escapeHtml(item.qualityScore)}</strong><time>${escapeHtml(relativeTime(item.createdAt))}</time></button>`).join('') : emptyState('没有知识版本', '当前筛选条件下没有可以展示的知识。')
}

function applyKnowledgeModule(moduleId) {
  state.knowledgeModule = moduleId
  let visible = 0
  for (const card of content.querySelectorAll('.reference-doc[data-module]')) {
    card.hidden = Boolean(moduleId && card.dataset.module !== moduleId)
    if (!card.hidden) visible += 1
  }
  for (const button of content.querySelectorAll('[data-knowledge-module]')) {
    button.classList.toggle('active', button.dataset.knowledgeModule === moduleId)
  }
  const count = document.querySelector('#knowledge-count')
  if (count) count.textContent = visible
}

async function refreshKnowledgeList() {
  const params = new URLSearchParams()
  if (state.knowledgeQuery) params.set('q', state.knowledgeQuery)
  if (state.knowledgeStatus) params.set('status', state.knowledgeStatus)
  const result = await request(`/api/v1/knowledge${params.size ? `?${params}` : ''}`)
  const items = collection(result, 'knowledge')
  const list = document.querySelector('#knowledge-list')
  const focusedVersionId = document.activeElement?.dataset?.versionId
  if (list) {
    list.innerHTML = knowledgeCards(items)
    if (focusedVersionId) {
      list.querySelector(`[data-version-id="${CSS.escape(focusedVersionId)}"]`)
        ?.focus({ preventScroll: true })
    }
  }
  applyKnowledgeModule(state.knowledgeModule)
}

async function openKnowledge(versionId, returnFocus) {
  const encoded = encodeURIComponent(versionId)
  const [item, lineageResult] = await Promise.all([
    request(`/api/v1/knowledge/${encoded}`),
    request(`/api/v1/knowledge/${encoded}/lineage`).catch((error) => ({ error })),
  ])
  const lineage = lineageResult?.error ? null : lineageResult
  const lineageNodes = Array.isArray(lineage?.nodes) ? lineage.nodes.map((node) => node?.version ?? node) : []
  const comparisonVersions = lineageNodes
    .filter((node) => node?.versionId && node.versionId !== item.versionId)
    .filter((node, index, all) => all.findIndex((entry) => entry.versionId === node.versionId) === index)
  const defaultAgainst = item.parentVersionId && comparisonVersions.some((node) => node.versionId === item.parentVersionId)
    ? item.parentVersionId
    : comparisonVersions[0]?.versionId
  const relationCounts = lineage?.relations
    ? Object.entries(lineage.relations).map(([name, values]) => `${({ runs: '批次', evaluations: '评测', corrections: '修订', publications: '发布', provenance: '来源' })[name] ?? name} ${Array.isArray(values) ? values.length : 0}`).join(' · ')
    : ''
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
    <section class="drawer-section"><h3>版本血缘</h3>${lineage
      ? `<p class="lead">${escapeHtml(relationCounts || `${lineageNodes.length} 个关联版本`)}</p>${lineageRelationList(lineage)}${comparisonVersions.length ? `<form id="knowledge-diff-form" data-version="${escapeHtml(item.versionId)}"><label>对比版本<select name="against">${comparisonVersions.map((node) => `<option value="${escapeHtml(node.versionId)}" ${node.versionId === defaultAgainst ? 'selected' : ''}>${escapeHtml(shortId(node.versionId, 28))}${node.status ? ` · ${escapeHtml(displayLabel(node.status))}` : ''}</option>`).join('')}</select></label><button class="secondary-button" type="submit">比较版本</button></form><div id="knowledge-diff-result"></div>` : emptyState('暂无可比较版本', '当前血缘中只有这个知识版本。')}`
      : partialNotice(userFacingError(lineageResult.error, '版本血缘暂不可用。'))}</section>
    <section class="drawer-section feedback-section"><h3>使用反馈</h3><p>反馈会进入后续治理流程，但不会直接修改知识或门禁判定。</p>
      <form id="feedback-form" data-version="${escapeHtml(item.versionId)}">
        <div class="feedback-actions"><label><input type="radio" name="action" value="hit" checked>有帮助</label><label><input type="radio" name="action" value="rate">评分</label><label><input type="radio" name="action" value="correct">需要纠正</label></div>
        <div class="feedback-inputs"><input name="rating" type="number" min="0" max="5" placeholder="0–5"><input name="note" placeholder="补充说明"><button class="primary-button">提交</button></div>
      </form>
    </section>`
  openDrawer(returnFocus)
}

async function compareKnowledgeVersions(form) {
  const data = new FormData(form)
  const versionId = form.dataset.version
  const against = String(data.get('against') ?? '')
  const target = form.querySelector('button[type="submit"]')
  const result = document.querySelector('#knowledge-diff-result')
  if (!versionId || !against || !result) return
  target.disabled = true
  result.innerHTML = '<div class="loading-state compact"><span class="spinner"></span>正在比较版本…</div>'
  try {
    const diff = await request(`/api/v1/knowledge/${encodeURIComponent(versionId)}/diff?against=${encodeURIComponent(against)}`)
    const validation = diff.rangeValidation ?? {}
    const valid = validation.valid ?? validation.validated ?? validation.withinCorrectionScope ?? ['VALID', 'PASS'].includes(validation.status)
    const sections = Array.isArray(diff.changedSections) ? diff.changedSections : []
    const hunks = Array.isArray(diff.hunks) ? diff.hunks : []
    result.innerHTML = `<div class="diff-summary"><b>${valid ? '变更范围符合修订约束' : '变更范围需要复核'}</b><span>${sections.length} 个章节 · ${hunks.length} 个差异片段</span></div>${sections.length ? `<ul class="provenance-list">${sections.map((section) => `<li><code>${escapeHtml(typeof section === 'string' ? section : section.path ?? section.heading ?? JSON.stringify(section))}</code></li>`).join('')}</ul>` : ''}<pre class="json-view">${json({ changedSections: sections, rangeValidation: validation, hunks })}</pre>`
  } catch (error) {
    result.innerHTML = errorState('无法比较知识版本', error)
  } finally {
    target.disabled = false
  }
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

const GRAPH_EDGES = [['orchestrator', 'doc-worker'], ['orchestrator', 'test-gen'], ['doc-worker', 'doc-gen'], ['doc-gen', 'code'], ['test-gen', 'check'], ['code', 'check'], ['check', 'review']]
const GRAPH_POINTS = {
  orchestrator: [450, 45], 'doc-worker': [135, 185], 'test-gen': [765, 185],
  'doc-gen': [135, 350], code: [360, 350], check: [585, 350], review: [585, 495],
}

function graphNodeState(agentId, nodes) {
  const aliases = new Set([agentId, agentId.replaceAll('-', '_')])
  return nodes.filter((node) => aliases.has(node.agentId) || aliases.has(node.nodeId)).at(-1) ?? null
}

function graphStatus(status) {
  if (['COMMITTED', 'COMPLETED'].includes(status)) return 'complete'
  if (status === 'RUNNING') return 'running'
  if (status === 'FAILED') return 'failed'
  return 'idle'
}

function graphEdge(from, to, nodeStates) {
  const [x1, y1] = GRAPH_POINTS[from]
  const [x2, y2] = GRAPH_POINTS[to]
  const fromState = graphStatus(nodeStates.get(from)?.status)
  const toState = graphStatus(nodeStates.get(to)?.status)
  const edgeState = toState === 'running' ? 'running' : (fromState === 'complete' && toState === 'complete' ? 'complete' : 'idle')
  return `<line class="graph-edge ${edgeState}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#graph-arrow-${edgeState})"></line>`
}

function renderGraph() {
  const selected = state.graphRunId || state.runs[0]?.runId || ''
  content.innerHTML = `<section class="reference-graph-tools"><label>选择批次　<select id="graph-run-select"><option value="">请选择批次</option>${state.runs.map((run) => `<option value="${escapeHtml(run.runId)}" ${run.runId === selected ? 'selected' : ''}>${escapeHtml(run.moduleId)} · ${escapeHtml(shortId(run.runId))}</option>`).join('')}</select></label><span>只读 · 实时事件；断线后每 10 秒轮询</span></section><section id="graph-stage" class="reference-graph-shell">${selected ? '<div class="loading-state"><span class="spinner"></span>正在读取 Agent 节点事实…</div>' : emptyState('选择一个批次', '这里只展示服务端记录的 Agent 工作状态。')}</section>`
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
  ensureGraphStream(runId, Math.max(0, ...events.map((record) => Number(record.eventSeq) || 0)))
  const stage = document.querySelector('#graph-stage')
  if (!stage || state.page !== 'graph' || state.graphRunId !== runId) return
  const definitions = state.agents.length ? state.agents : Object.keys(AGENT_LABELS).map((agentId) => ({ agentId }))
  const nodeStates = new Map(definitions.map((agent) => [agent.agentId, graphNodeState(agent.agentId, nodes)]))
  const statusCounts = { complete: 0, running: 0, failed: 0, idle: 0 }
  for (const node of nodeStates.values()) statusCounts[graphStatus(node?.status)] += 1
  stage.innerHTML = `<div class="reference-graph-canvas"><div class="workflow-graph" aria-label="只读 Agent 工作流图"><svg class="graph-connections" viewBox="0 0 900 540" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="graph-arrow-idle" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z"></path></marker><marker id="graph-arrow-running" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z"></path></marker><marker id="graph-arrow-complete" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z"></path></marker></defs>${GRAPH_EDGES.map(([from, to]) => graphEdge(from, to, nodeStates)).join('')}</svg>${definitions.map((agent) => { const node = nodeStates.get(agent.agentId); const status = node?.status ?? 'PENDING'; return `<button class="graph-node node-${escapeHtml(agent.agentId)} ${graphStatus(status)}" data-graph-agent="${escapeHtml(agent.agentId)}"><span class="graph-node-icon" aria-hidden="true">${['COMMITTED', 'COMPLETED'].includes(status) ? '✓' : status === 'FAILED' ? '!' : status === 'RUNNING' ? '●' : '○'}</span><b>${escapeHtml(AGENT_LABELS[agent.agentId] ?? agent.name ?? agent.agentId)}</b><small>${escapeHtml(displayLabel(status))}${node ? ` · 第 ${(node.iteration ?? 0) + 1} 轮 · 第 ${node.attempt ?? (node.retryCount ?? 0) + 1} 次尝试` : ''}</small></button>` }).join('')}</div><div class="graph-status-legend"><span><i class="running"></i>运行中 ${statusCounts.running}</span><span><i class="complete"></i>已完成 ${statusCounts.complete}</span><span><i class="failed"></i>失败 ${statusCounts.failed}</span><span><i></i>未开始 ${statusCounts.idle}</span></div></div><aside class="reference-node-detail"><header><em>批次状态</em><b>${nodes.length}</b></header><h3>${escapeHtml(snapshot.run?.moduleId ?? runId)}</h3><p>业务状态 ${escapeHtml(displayLabel(snapshot.run?.state))}<br>工作流 ${escapeHtml(displayLabel(workflowStatus.status ?? workflowStatus.workflowStatus ?? 'PENDING'))}</p><small>执行情况</small><div><span>运行中</span><b>${statusCounts.running}</b></div><div><span>已完成</span><b>${statusCounts.complete}</b></div><div><span>失败</span><b>${statusCounts.failed}</b></div><div><span>未开始</span><b>${statusCounts.idle}</b></div><button class="wide" data-page-link="evaluations">查看评测证据 →</button></aside>`
}

function ensureGraphStream(runId, after) {
  if (!('EventSource' in window) || state.graphStream?._runId === runId) return
  state.graphStream?.close()
  const stream = new EventSource(`/api/v1/runs/${encodeURIComponent(runId)}/event-stream?after=${after}`)
  stream._runId = runId
  stream._cursor = after
  stream.addEventListener('ready', () => {
    clearInterval(state.graphPoll)
    state.graphPoll = null
  })
  stream.addEventListener('run-event', (event) => {
    stream._cursor = Number(event.lastEventId) || stream._cursor
    if (state.page === 'graph' && state.graphRunId === runId) loadGraph(runId).catch(() => {})
  })
  stream.addEventListener('reconnect', (event) => {
    try { stream._cursor = Number(JSON.parse(event.data).after) || stream._cursor } catch {}
  })
  stream.onerror = () => {
    stream.close()
    if (state.graphStream === stream) state.graphStream = null
    clearInterval(state.graphPoll)
    state.graphPoll = setInterval(() => {
      if (state.page === 'graph' && state.graphRunId === runId) loadGraph(runId).catch(() => {})
    }, 10_000)
    setTimeout(() => {
      if (state.page === 'graph' && state.graphRunId === runId && !state.graphStream) {
        ensureGraphStream(runId, stream._cursor)
      }
    }, 2_000)
  }
  state.graphStream = stream
}

function openGraphNode(agentId, returnFocus) {
  const { nodes = [], events = [] } = state.graphSnapshot ?? {}
  const node = graphNodeState(agentId, nodes)
  drawerTitle.textContent = AGENT_LABELS[agentId] ?? agentId
  drawerContent.innerHTML = `${node ? `<div class="drawer-badges">${badge(node.status)}</div><dl class="fact-grid"><div><dt>节点</dt><dd>${escapeHtml(node.nodeId)}</dd></div><div><dt>Agent</dt><dd>${escapeHtml(node.agentId ?? agentId)}</dd></div><div><dt>轮次</dt><dd>${escapeHtml((node.iteration ?? 0) + 1)}</dd></div><div><dt>尝试次数</dt><dd>${escapeHtml(node.attempt ?? (node.retryCount ?? 0) + 1)}</dd></div></dl><section class="drawer-section"><h3>受控执行事实</h3><pre class="json-view">${json(node)}</pre></section>` : partialNotice('这个 Agent 在当前批次中尚无服务端节点记录。')}<section class="drawer-section"><h3>相关事件</h3><pre class="json-view">${json(events.filter((record) => JSON.stringify(record).includes(agentId)).slice(-10))}</pre></section>`
  openDrawer(returnFocus)
}

async function renderEvidence(append = false) {
  content.innerHTML = '<div class="loading-state"><span class="spinner"></span>正在读取评测记录…</div>'
  const evaluationQuery = new URLSearchParams({ limit: '50' })
  for (const [key, value] of Object.entries(state.evaluationFilters)) {
    if (!value) continue
    if (key === 'from') evaluationQuery.set(key, `${value}T00:00:00.000Z`)
    else if (key === 'to') evaluationQuery.set(key, `${value}T23:59:59.999Z`)
    else evaluationQuery.set(key, value)
  }
  if (append && state.evaluationEnvelope?.nextCursor) evaluationQuery.set('cursor', state.evaluationEnvelope.nextCursor)
  const results = await Promise.allSettled([
    request(`/api/v1/evaluations?${evaluationQuery}`),
    request('/api/v1/evaluation-rules?limit=200'),
  ])
  if (results[0].status === 'fulfilled') {
    const items = collection(results[0].value, 'evaluations')
    state.evaluations = append ? [...state.evaluations, ...items] : items
    state.evaluationEnvelope = results[0].value
  } else if (!append) state.evaluations = []
  state.evaluationRules = results[1].status === 'fulfilled' ? collection(results[1].value, 'rules') : []
  const errors = results.filter((result) => result.status === 'rejected')
  if (errors.length === results.length) {
    content.innerHTML = errorState('无法读取评测数据', errors[0].reason, '<button class="primary-button" data-reload type="button">重新连接</button>')
    return
  }
  const passed = state.evaluations.filter((record) => record.gate === 'PASS' || record.status === 'PASS').length
  const tests = state.evaluations.reduce((sum, record) => sum + Number(record.tests?.total ?? 0), 0)
  const canEdit = Boolean(state.operatorMode && state.capabilities?.writeEnabled)
  content.innerHTML = `
    ${errors.length ? partialNotice('部分评测资源读取失败；已读取的不可变事实仍可查看。') : ''}
    <form id="evaluation-filter-form" class="resource-filter"><label>批次<input name="runId" value="${escapeHtml(state.evaluationFilters.runId)}" placeholder="批次标识"></label><label>知识模块<input name="moduleId" value="${escapeHtml(state.evaluationFilters.moduleId)}" placeholder="模块标识"></label><label>门禁<select name="gate"><option value="">全部</option>${['PASS', 'ITERATE', 'STOPPED'].map((value) => `<option value="${value}" ${state.evaluationFilters.gate === value ? 'selected' : ''}>${displayLabel(value)}</option>`).join('')}</select></label><label>状态<select name="status"><option value="">全部</option>${['PASSED', 'FAILED', 'ERROR'].map((value) => `<option value="${value}" ${state.evaluationFilters.status === value ? 'selected' : ''}>${displayLabel(value)}</option>`).join('')}</select></label><label>开始日期<input name="from" type="date" value="${escapeHtml(state.evaluationFilters.from)}"></label><label>结束日期<input name="to" type="date" value="${escapeHtml(state.evaluationFilters.to)}"></label><button class="secondary-button" type="submit">筛选</button></form>
    <section class="reference-metrics"><article><small>评测记录</small><b class="mint">${state.evaluations.length}</b><p>跨批次持久化记录</p></article><article><small>门禁通过</small><b>${passed}</b><p>${state.evaluations.length ? `${formatNumber(passed / state.evaluations.length * 100, 1)}%` : '无样本'}</p></article><article><small>测试样本</small><b>${formatNumber(tests)}</b><p>由不可变报告汇总</p></article><article><small>评测规则</small><b>${state.evaluationRules.length}</b><p>${canEdit ? '可创建新修订' : '当前只读'}</p></article></section>
    <div class="quality-layout">
      <section class="panel"><div class="section-heading"><h2>评测记录</h2><span class="counter">${state.evaluations.length}</span></div>
        <div class="evidence-grid">${state.evaluations.length ? state.evaluations.map((record) => `<article class="evidence-card">
          <div class="card-heading"><div><b>${escapeHtml(record.moduleId || record.versionId)}</b><small>${escapeHtml(shortId(record.runId, 20))}</small></div>${badge(record.gate ?? record.status)}</div>
          <strong>${escapeHtml(record.tests?.passed ?? '—')} / ${escapeHtml(record.tests?.total ?? '—')}</strong><span>测试通过</span>
          <dl><div><dt>稳定性</dt><dd>${escapeHtml(record.stability ?? '—')}</dd></div><div><dt>评测时间</dt><dd>${escapeHtml(formatDate(record.createdAt))}</dd></div></dl>
          <button class="text-button" data-evaluation-id="${escapeHtml(record.evaluationId)}">检查证据 →</button>
        </article>`).join('') : emptyState('没有评测记录', '批次进入行为评测后，记录会显示在这里。')}</div>${state.evaluationEnvelope?.nextCursor ? '<button class="secondary-button load-more" data-load-evaluations type="button">加载更多评测</button>' : ''}
      </section>
      <section class="panel"><div class="section-heading"><h2>评测规则</h2><span class="counter">${state.evaluationRules.length}</span></div>
        <div class="rule-list">${state.evaluationRules.length ? state.evaluationRules.map((rule) => `<form class="rule-card" data-rule-id="${escapeHtml(rule.ruleId)}" data-revision="${escapeHtml(rule.revision)}">
        <div class="card-heading"><div><b>${escapeHtml(rule.name ?? rule.ruleId)}</b><small>修订 ${escapeHtml(rule.revision)} · ${escapeHtml(typeof rule.scope === 'string' ? rule.scope : JSON.stringify(rule.scope ?? {}))}</small></div>${badge(rule.enabled ? 'ACTIVE' : 'DISABLED')}</div>
          <label>适用范围<input name="scope" value="${escapeHtml(typeof rule.scope === 'string' ? rule.scope : JSON.stringify(rule.scope ?? {}))}" ${canEdit ? '' : 'disabled'}></label>
          <label>规则配置<textarea name="config" rows="4" ${canEdit ? '' : 'disabled'}>${escapeHtml(JSON.stringify(rule.config ?? {}, null, 2))}</textarea></label>
          <label class="inline-check"><input name="enabled" type="checkbox" ${rule.enabled ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> 启用这条规则</label>
          <div><span>旧修订和既有报告保持不变</span><button class="secondary-button" type="submit" ${canEdit ? '' : 'disabled'}>保存新修订</button></div>
        </form>`).join('') : emptyState('没有评测规则', '服务端尚未建立规则记录。')}</div>
      </section>
    </div>`
}

async function openEvaluation(evaluationId, returnFocus) {
  const encoded = encodeURIComponent(evaluationId)
  const detail = await request(`/api/v1/evaluations/${encoded}`)
  const report = detail.report ?? detail
  const decision = detail.decision ?? { outcome: detail.gate, reasonCodes: detail.reasonCodes ?? [] }
  const artifacts = await request(`/api/v1/evaluations/${encoded}/artifacts`).catch((error) => ({ error, items: [] }))
  drawerTitle.textContent = `评测 ${shortId(evaluationId, 24)}`
  drawerContent.innerHTML = `<div class="drawer-badges">${badge(decision.outcome ?? detail.status)}</div>
    <dl class="fact-grid"><div><dt>批次</dt><dd>${escapeHtml(detail.runId ?? report.runId)}</dd></div><div><dt>知识版本</dt><dd>${escapeHtml(detail.versionId ?? report.versionId)}</dd></div><div><dt>规则修订</dt><dd>${escapeHtml(detail.ruleRef?.ruleId ?? '—')} · ${escapeHtml(detail.ruleRef?.revision ?? '—')}</dd></div><div><dt>记录时间</dt><dd>${escapeHtml(formatDate(detail.createdAt ?? report.createdAt))}</dd></div></dl>
    <section class="drawer-section"><h3>不可变报告</h3><pre class="json-view">${json(report)}</pre></section>
    <section class="drawer-section"><h3>门禁判定</h3><pre class="json-view">${json(decision)}</pre></section>
    <section class="drawer-section"><h3>证据工件</h3>${artifacts.error ? partialNotice('证据元数据暂不可用。') : artifacts.items?.length ? `<ul class="artifact-list">${artifacts.items.map((item) => `<li><span><b>${escapeHtml(displayLabel(item.relation))}</b><code>${escapeHtml(item.ref?.artifactId ?? item.artifactId ?? '—')}</code><small>${item.contentAddressed ? '内容地址完整' : '完整性未确认'}</small></span>${item.downloadUrl ? `<button class="secondary-button" data-download-artifact="${escapeHtml(item.downloadUrl)}" type="button">下载</button>` : `<em>${state.token ? '无下载权限' : '进入治理模式后可下载'}</em>`}</li>`).join('')}</ul>` : emptyState('没有证据工件', '这条评测没有可见的证据引用。')}</section>`
  openDrawer(returnFocus)
}

async function downloadArtifact(path) {
  if (!state.token || !String(path).startsWith('/api/v1/evaluations/')) {
    showToast('请先进入治理模式。', 'warning')
    return
  }
  const response = await fetch(path, { headers: { authorization: `Bearer ${state.token}` } })
  if (!response.ok) {
    let payload = null
    try { payload = await response.json() } catch {}
    const error = new Error('artifact download failed')
    error.code = payload?.error?.code ?? null
    throw error
  }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = 'evaluation-evidence'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function saveEvaluationRule(form) {
  if (!state.operatorMode || !state.token) {
    showToast('请先进入治理模式。', 'warning')
    return
  }
  const data = new FormData(form)
  let scope
  let config
  try {
    scope = JSON.parse(String(data.get('scope') || '{}'))
    if (!scope || Array.isArray(scope) || typeof scope !== 'object') throw new Error('invalid scope')
  } catch {
    showToast('适用范围必须是有效的 JSON 对象。', 'warning')
    return
  }
  try {
    config = JSON.parse(String(data.get('config') || '{}'))
  } catch {
    showToast('规则配置必须是有效的 JSON。', 'warning')
    return
  }
  const reason = window.prompt('说明本次规则修订原因。')?.trim()
  if (!reason) return
  if (!window.confirm('新修订只影响后续评测，确认保存吗？')) return
  await request(`/api/v1/evaluation-rules/${encodeURIComponent(form.dataset.ruleId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      expectedRevision: Number(form.dataset.revision), reason,
      scope, config, enabled: data.get('enabled') === 'on',
    }),
  })
  showToast('评测规则的新修订已保存。', 'success')
  await renderEvidence()
}

async function renderDiscovery(force = false, append = false) {
  content.innerHTML = '<div class="loading-state"><span class="spinner" aria-hidden="true"></span>正在读取来源注册…</div>'
  try {
    const sourceQuery = new URLSearchParams({ limit: '50' })
    if (state.sourceStatus) sourceQuery.set('status', state.sourceStatus)
    if (state.sourceKind) sourceQuery.set('kind', state.sourceKind)
    if (state.sourceProject) sourceQuery.set('project', state.sourceProject)
    if (append && state.sourceEnvelope?.nextCursor) sourceQuery.set('cursor', state.sourceEnvelope.nextCursor)
    const [sourcesState, discoveryState] = await Promise.allSettled([
      request(`/api/v1/sources?${sourceQuery}`),
      force ? request('/api/v1/sources/scan') : Promise.resolve(state.discovery),
    ])
    if (sourcesState.status === 'rejected') throw sourcesState.reason
    const sourcesResult = sourcesState.value
    const sourceItems = collection(sourcesResult, 'sources')
    state.sources = append ? [...state.sources, ...sourceItems] : sourceItems
    state.sourceEnvelope = sourcesResult
    if (force && discoveryState.status === 'fulfilled') {
      state.discovery = discoveryState.value
      state.resourceErrors.sourceScan = null
    } else if (force) {
      state.resourceErrors.sourceScan = discoveryState.reason
    }
    const { candidates = [], total = candidates.length, truncated = false } = state.discovery ?? {}
    const canEdit = Boolean(state.operatorMode && state.capabilities?.writeEnabled)
    const active = state.sources.filter((source) => source.status === 'ACTIVE').length
    const drifted = state.sources.filter((source) => source.drift || source.status === 'STALE').length
    content.innerHTML = `
      ${state.resourceErrors.sourceScan ? partialNotice('来源候选扫描失败；已登记的来源事实仍可查看和管理。') : ''}
      <form id="source-filter-form" class="resource-filter"><label>来源状态<select name="status"><option value="">全部状态</option>${['ACTIVE', 'DEGRADED', 'STALE', 'DISABLED'].map((value) => `<option value="${value}" ${state.sourceStatus === value ? 'selected' : ''}>${displayLabel(value)}</option>`).join('')}</select></label><label>来源类型<select name="kind"><option value="">全部类型</option><option value="FILE" ${state.sourceKind === 'FILE' ? 'selected' : ''}>文件</option><option value="HTTPS" ${state.sourceKind === 'HTTPS' ? 'selected' : ''}>HTTPS</option></select></label><label>项目<input name="project" value="${escapeHtml(state.sourceProject)}" placeholder="全部项目"></label><button class="secondary-button" type="submit">筛选</button></form>
      <section class="reference-metrics"><article><small>已注册来源</small><b class="mint">${state.sources.length}</b><p>持久化来源事实</p></article><article><small>正常来源</small><b>${active}</b><p>最近访问成功</p></article><article><small>发现漂移</small><b>${drifted}</b><p>需要刷新或复核</p></article><article><small>扫描候选</small><b>${state.discovery ? candidates.length : '—'}</b><p>${state.discovery ? (truncated ? `共 ${total} 条，结果已截断` : '本次显式扫描') : '尚未执行扫描'}</p></article></section>
      <div class="sources-layout">
        <section class="panel"><div class="section-heading"><h2>来源注册</h2><span class="counter">${state.sources.length}</span></div>
          <div class="source-list">${state.sources.length ? state.sources.map((source) => `<article class="source-card">
            <button class="source-main" data-source-id="${escapeHtml(source.sourceId)}" type="button"><span><b>${escapeHtml(source.displayName ?? source.locator)}</b><small>${escapeHtml(source.locator)}</small></span>${badge(source.status)}<em>${source.drift ? '检测到漂移' : `修订 ${escapeHtml(source.recordRevision ?? source.revision ?? '—')}`}</em></button>
            <button class="secondary-button" data-refresh-source="${escapeHtml(source.sourceId)}" type="button" ${canEdit ? '' : 'disabled'}>刷新</button>
          </article>`).join('') : emptyState('没有注册来源', '可从扫描候选登记，或在治理模式中手动添加。')}</div>${state.sourceEnvelope?.nextCursor ? '<button class="secondary-button load-more" data-load-sources type="button">加载更多来源</button>' : ''}
        </section>
        <aside class="panel source-actions"><div class="section-heading"><h2>添加来源</h2></div>
          <form id="source-create-form"><label>来源类型<select name="kind" ${canEdit ? '' : 'disabled'}><option value="FILE">文件</option><option value="HTTPS">HTTPS</option></select></label><label>路径或地址<input name="locator" placeholder="仓库相对路径或 HTTPS 地址" required ${canEdit ? '' : 'disabled'}></label><label>项目<input name="project" value="default" required ${canEdit ? '' : 'disabled'}></label><label>显示名称<input name="displayName" placeholder="可选" ${canEdit ? '' : 'disabled'}></label><label>凭据引用<input name="credentialRef" placeholder="secret://env/环境变量名（可选）" ${canEdit ? '' : 'disabled'}></label><button class="primary-button" type="submit" ${canEdit ? '' : 'disabled'}>登记来源</button></form>
          <button class="secondary-button scan-button" data-refresh-discovery type="button">扫描候选</button>
          <p>只有通过仓库访问边界校验的文件才能登记；扫描本身不会创建来源。</p>
        </aside>
      </div>
      ${state.discovery ? `<section class="panel discovery-panel"><div class="section-heading"><h2>扫描候选</h2><button class="secondary-button" data-refresh-discovery type="button">重新扫描</button></div>
        ${truncated ? partialNotice(`结果已达到服务端上限，当前展示 ${candidates.length} 条，共发现 ${total} 条。`) : ''}
        <div class="candidate-list">${candidates.length ? candidates.map((candidate) => `<article class="candidate-card"><div><b>${escapeHtml(candidate.path)}</b><small>${escapeHtml(formatDate(candidate.modifiedAt))}</small></div><dl><div><dt>大小</dt><dd>${escapeHtml(candidate.size)} 字节</dd></div><div><dt>内容摘要</dt><dd><code>${escapeHtml(candidate.sha256)}</code></dd></div></dl><button class="secondary-button" data-register-source="${escapeHtml(candidate.path)}" type="button" ${canEdit ? '' : 'disabled'}>登记此来源</button></article>`).join('') : emptyState('没有来源候选', '服务端当前没有扫描到可登记的知识来源。')}</div></section>` : ''}`
  } catch (error) {
    content.innerHTML = errorState('无法读取来源注册', error, '<button class="primary-button" data-page-link="sources" type="button">重新读取</button>')
  }
}

async function createSource(input) {
  if (!state.operatorMode || !state.token) {
    showToast('请先进入治理模式。', 'warning')
    return
  }
  await request('/api/v1/sources', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  showToast('来源已登记，固定修订由服务端记录。', 'success')
  await renderDiscovery(false)
}

async function refreshSource(sourceId) {
  if (!state.operatorMode || !state.token) {
    showToast('请先进入治理模式。', 'warning')
    return
  }
  const result = await request(`/api/v1/sources/${encodeURIComponent(sourceId)}/refresh`, {
    method: 'POST', body: '{}',
  })
  showToast(result.replayed ? '已返回同一次刷新结果。' : '来源刷新已完成并记录。', 'success')
  await renderDiscovery(false)
}

async function openSource(sourceId, returnFocus) {
  const source = await request(`/api/v1/sources/${encodeURIComponent(sourceId)}`)
  const canEdit = Boolean(state.operatorMode && state.capabilities?.writeEnabled)
  drawerTitle.textContent = source.displayName ?? source.locator
  drawerContent.innerHTML = `<div class="drawer-badges">${badge(source.status)} ${source.drift ? badge('STALE', '检测到漂移') : ''}</div>
    <dl class="fact-grid"><div><dt>来源</dt><dd>${escapeHtml(source.sourceId)}</dd></div><div><dt>类型</dt><dd>${escapeHtml(displayLabel(source.kind))}</dd></div><div><dt>固定修订</dt><dd>${escapeHtml(source.revision ?? '—')}</dd></div><div><dt>观测修订</dt><dd>${escapeHtml(source.observedRevision ?? '—')}</dd></div><div><dt>最近同步</dt><dd>${escapeHtml(formatDate(source.lastSyncAt))}</dd></div></dl>
    <section class="drawer-section"><h3>关联知识</h3><pre class="json-view">${json(source.knowledge ?? {})}</pre></section>
    <section class="drawer-section"><h3>来源配置</h3><form id="source-update-form" data-source-id="${escapeHtml(source.sourceId)}" data-revision="${escapeHtml(source.recordRevision)}"><label>显示名称<input name="displayName" value="${escapeHtml(source.displayName ?? '')}" ${canEdit ? '' : 'disabled'}></label><label>路径或地址<input name="locator" value="${escapeHtml(source.locator)}" ${canEdit ? '' : 'disabled'}></label><label>确认修订<input name="revision" value="${escapeHtml(source.observedRevision ?? source.revision ?? '')}" ${canEdit ? '' : 'disabled'}></label><label class="inline-check"><input name="enabled" type="checkbox" ${source.status !== 'DISABLED' ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> 启用来源</label><button class="secondary-button" type="submit" ${canEdit ? '' : 'disabled'}>保存新修订</button></form></section>
    <section class="drawer-section"><h3>审计记录</h3><pre class="json-view">${json(source.audit ?? [])}</pre></section>`
  openDrawer(returnFocus)
}

async function updateSource(form) {
  if (!state.operatorMode || !state.token) {
    showToast('请先进入治理模式。', 'warning')
    return
  }
  const data = new FormData(form)
  const reason = window.prompt('说明本次来源配置变更原因。')?.trim()
  if (!reason) return
  await request(`/api/v1/sources/${encodeURIComponent(form.dataset.sourceId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      expectedRevision: Number(form.dataset.revision), reason,
      displayName: String(data.get('displayName') ?? ''),
      locator: String(data.get('locator') ?? ''), revision: String(data.get('revision') ?? ''),
      enabled: data.get('enabled') === 'on',
    }),
  })
  closeDrawer()
  showToast('来源配置的新修订已保存。', 'success')
  await renderDiscovery(false)
}

function renderAgents() {
  if (state.resourceErrors.agents) {
    content.innerHTML = errorState('无法读取 Agent 目录', state.resourceErrors.agents, '<button class="primary-button" data-reload type="button">重新连接</button>')
    return
  }
  const canEdit = Boolean(state.operatorMode && state.capabilities?.writeEnabled)
  const provider = state.providerStatus
  const settings = state.providerSettings
  const runs = state.runMetrics
  const governance = state.governanceMetrics
  const runSamples = Number(runs?.cohort?.runCount ?? 0)
  const providerLabel = provider?.availability ? displayLabel(provider.availability) : '读取中'
  const executionProvider = (provider?.enabled ? provider.provider : state.capabilities?.agentProvider)
    ?? provider?.provider
  const executionProviderLabel = PROVIDER_LABELS[executionProvider] ?? executionProvider ?? '未读取'
  const operationErrorKeys = ['providerStatus', 'providerSettings', 'runMetrics', 'governanceMetrics'].filter((key) => state.resourceErrors[key])
  const operationErrorLabels = operationErrorKeys.map((key) => RESOURCE_LABELS[key]).join('、')
  content.innerHTML = `
    ${operationErrorKeys.length ? partialNotice(`${operationErrorLabels}暂不可用；其他已读取数据仍可查看。`) : ''}
    <section class="reference-metrics"><article><small>Agent 数量</small><b class="mint">${state.agents.length}</b><p>固定角色定义</p></article><article><small>服务提供方</small><b>${escapeHtml(providerLabel)}</b><p>${escapeHtml(provider?.model ?? '未选择模型')}</p></article><article><small>配置状态</small><b>${escapeHtml(settings?.verification?.status ? displayLabel(settings.verification.status) : '未读取')}</b><p>${settings?.enabled ? '已作为新批次默认方式' : '尚未启用'}</p></article><article><small>观测样本</small><b>${formatNumber(runSamples)}</b><p>${escapeHtml(displayLabel(runs?.cohort?.kind ?? 'EMPTY'))}</p></article></section>
    <div class="provider-layout">
      <section class="panel provider-card"><div class="section-heading"><h2>模型服务配置</h2>${provider?.availability ? badge(provider.availability) : badge('UNKNOWN')}</div>
        ${state.capabilities?.writeEnabled ? '' : '<div class="notice"><b>服务端写入尚未启用。</b><p>复制仓库根目录的 <code>.env.example</code> 为 <code>.env.local</code>，设置 <code>WP_KNOWLEDGE_WRITE_TOKEN=请替换为随机长令牌</code>，然后重启服务。配置文件不会提交到版本库。</p></div>'}
        <dl class="settings-list"><div><dt>当前执行方式</dt><dd>${escapeHtml(executionProviderLabel)}</dd></div><div><dt>认证状态</dt><dd>${escapeHtml(displayLabel(provider?.authentication ?? 'UNKNOWN'))}</dd></div><div><dt>接口地址</dt><dd>${escapeHtml(settings?.apiUrlMasked ?? '未配置')}</dd></div><div><dt>模型</dt><dd>${escapeHtml(settings?.model ?? provider?.model ?? '未配置')}</dd></div><div><dt>最近验证</dt><dd>${escapeHtml(formatDate(settings?.verification?.checkedAt))}</dd></div></dl>
        <form id="provider-settings-form" data-revision="${escapeHtml(settings?.revision ?? 0)}"><label>API 地址<input name="apiUrl" type="url" required placeholder="${escapeHtml(settings?.apiUrlMasked ? `重新输入完整地址；当前 ${settings.apiUrlMasked}` : 'https://模型服务地址/v1')}" ${canEdit ? '' : 'disabled'}></label><label>API Key<input name="apiKey" type="password" autocomplete="new-password" placeholder="${settings?.apiKeyConfigured ? '留空表示保留现有密钥' : '输入服务密钥'}" ${canEdit ? '' : 'disabled'}></label><label>模型<input name="model" value="${escapeHtml(settings?.model ?? '')}" placeholder="模型标识" ${canEdit ? '' : 'disabled'}></label><label class="inline-check"><input name="clearApiKey" type="checkbox" ${canEdit ? '' : 'disabled'}> 清除已保存的 API Key</label><button class="secondary-button" type="submit" ${canEdit ? '' : 'disabled'}>保存待验证配置</button></form>
        <button class="primary-button verify-provider" data-verify-provider type="button" ${canEdit && settings?.revision > 0 ? '' : 'disabled'}>验证并启用</button>
        <p class="form-note">保存会使旧验证失效；只有无副作用验证成功后，新批次才会默认使用这项配置。</p>
      </section>
      <section class="panel metrics-card"><div class="section-heading"><h2>运行观测</h2><label>统计窗口<select id="metrics-window"><option value="24h" ${state.metricsWindow === '24h' ? 'selected' : ''}>24 小时</option><option value="7d" ${state.metricsWindow === '7d' ? 'selected' : ''}>7 天</option><option value="30d" ${state.metricsWindow === '30d' ? 'selected' : ''}>30 天</option></select></label></div>
        <div class="compact-metrics"><div><span>批次耗时 P50 / P95</span><b>${formatDuration(runs?.runDurationMs?.p50)} / ${formatDuration(runs?.runDurationMs?.p95)}</b><small>${sampleHint(runs?.runDurationMs)}</small></div><div><span>节点耗时 P50 / P95</span><b>${formatDuration(runs?.nodeDurationMs?.p50)} / ${formatDuration(runs?.nodeDurationMs?.p95)}</b><small>${sampleHint(runs?.nodeDurationMs)}</small></div><div><span>排队耗时 P50 / P95</span><b>${formatDuration(runs?.queueDurationMs?.p50)} / ${formatDuration(runs?.queueDurationMs?.p95)}</b><small>${sampleHint(runs?.queueDurationMs)}</small></div><div><span>服务提供方调用</span><b>${sampledNumber(runs?.providerCalls)}</b><small>${sampleHint(runs?.providerCalls)}</small></div><div><span>Token</span><b>${sampledNumber(runs?.tokens)}</b><small>${sampleHint(runs?.tokens)}</small></div><div><span>估算成本</span><b>${Number(runs?.estimatedCostUsd?.sampleSize ?? 0) > 0 ? `$${formatNumber(runs.estimatedCostUsd.total, 4)}` : '—'}</b><small>${sampleHint(runs?.estimatedCostUsd)}</small></div><div><span>模型调用重试</span><b>${sampledNumber(runs?.providerCalls, 'retries')}</b><small>${sampleHint(runs?.providerCalls)}</small></div><div><span>工作流节点重试</span><b>${sampledNumber(runs?.workflowNodeRetries)}</b><small>${sampleHint(runs?.workflowNodeRetries)}</small></div></div>
      </section>
    </div>
    <section class="panel governance-metrics"><div class="section-heading"><h2>治理效果</h2><span>${escapeHtml(displayLabel(governance?.cohort?.kind ?? 'EMPTY'))}</span></div><div class="compact-metrics"><div><span>首次修订通过率</span><b>${formatRate(governance?.firstRevisionPassRate)}</b><small>${sampleHint(governance?.firstRevisionPassRate)}</small></div><div><span>三轮内收敛率</span><b>${formatRate(governance?.threeIterationConvergenceRate)}</b><small>${sampleHint(governance?.threeIterationConvergenceRate)}</small></div><div><span>人工介入比例</span><b>${formatRate(governance?.humanInterventionRate)}</b><small>${sampleHint(governance?.humanInterventionRate)}</small></div><div><span>平均处理时间</span><b>${formatDuration(governance?.meanResolutionTimeMs?.value)}</b><small>${sampleHint(governance?.meanResolutionTimeMs)}</small></div><div><span>短期复发率</span><b>${formatRate(governance?.shortTermRecurrenceRate)}</b><small>${sampleHint(governance?.shortTermRecurrenceRate)}</small></div></div>${metricDefinitions(runs, governance)}</section>
    <section class="agent-boundary panel">
      <div><h2>Agent 可以调整表达，不能改变职责</h2><p>拓扑、职责、输入输出、工具权限和基础提示词由代码固定。这里保存的内容只会作为追加提示词，用于后续节点执行。</p></div>
      ${badge(canEdit ? 'VERIFIED' : 'CANDIDATE', canEdit ? '可编辑提示词' : '只读查看')}
    </section>
    <section class="agent-grid">${state.agents.map((agent) => `<article class="agent-card panel">
      <div class="card-heading"><h2>${escapeHtml(AGENT_LABELS[agent.agentId] ?? agent.displayName)}</h2>${badge('CANDIDATE', '职责固定')}</div>
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

async function loadAgentOperations(force = false) {
  if (!force && state.providerStatus && state.providerSettings && state.runMetrics && state.governanceMetrics) return
  const windowKey = encodeURIComponent(state.metricsWindow)
  const results = await Promise.allSettled([
    request('/api/v1/agents/providers/status'), request('/api/v1/provider-settings'),
    request(`/api/v1/metrics/runs?window=${windowKey}`), request(`/api/v1/metrics/governance?window=${windowKey}`),
  ])
  if (results[0].status === 'fulfilled') state.providerStatus = results[0].value
  if (results[1].status === 'fulfilled') state.providerSettings = results[1].value
  if (results[2].status === 'fulfilled') state.runMetrics = results[2].value
  if (results[3].status === 'fulfilled') state.governanceMetrics = results[3].value
  state.resourceErrors.providerStatus = results[0].status === 'rejected' ? results[0].reason : null
  state.resourceErrors.providerSettings = results[1].status === 'rejected' ? results[1].reason : null
  state.resourceErrors.runMetrics = results[2].status === 'rejected' ? results[2].reason : null
  state.resourceErrors.governanceMetrics = results[3].status === 'rejected' ? results[3].reason : null
}

function providerErrorMessage(error) {
  return userFacingError(error, '服务提供方操作失败，请检查配置后重试。')
}

async function saveProviderSettings(form) {
  if (!state.operatorMode || !state.token) {
    showToast('请先进入治理模式。', 'warning')
    return
  }
  const data = new FormData(form)
  if (!window.confirm('保存后需要重新验证，确认继续吗？')) return
  try {
    await request('/api/v1/provider-settings', {
      method: 'PUT',
      body: JSON.stringify({
        provider: 'pi-agent', apiUrl: String(data.get('apiUrl') ?? ''),
        ...(String(data.get('apiKey') ?? '') ? { apiKey: String(data.get('apiKey')) } : {}),
        clearApiKey: data.get('clearApiKey') === 'on',
        model: String(data.get('model') ?? '').trim() || null,
        expectedRevision: Number(form.dataset.revision ?? 0),
      }),
    })
    form.reset()
    await loadAgentOperations(true)
    renderAgents()
    showToast('配置已安全保存，请完成连接验证。', 'success')
  } catch (error) {
    showToast(providerErrorMessage(error), 'danger')
  }
}

async function verifyProviderSettings() {
  if (!state.operatorMode || !state.token || !state.providerSettings) {
    showToast('请先进入治理模式并保存配置。', 'warning')
    return
  }
  try {
    const verification = await request('/api/v1/provider-settings/verify', {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: Number(state.providerSettings.revision), enable: true }),
    })
    await loadAgentOperations(true)
    renderAgents()
    if (verification?.status !== 'VERIFIED' || verification?.enabled !== true) {
      const error = new Error('provider verification failed')
      error.code = verification?.reasonCode ?? 'VERIFICATION_REQUIRED'
      throw error
    }
    showToast('连接验证成功，新批次将默认使用 Pi Agent。', 'success')
  } catch (error) {
    await loadAgentOperations(true)
    renderAgents()
    showToast(providerErrorMessage(error), 'danger')
  }
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
  if (page !== 'graph') {
    state.graphStream?.close()
    state.graphStream = null
  }
  if (page === 'graph') {
    renderGraph()
  }
  if (page === 'evaluations') await renderEvidence()
  if (page === 'sources') await renderDiscovery()
  if (page === 'agent-settings') {
    await loadAgentOperations()
    renderAgents()
  }
  closeNavigation()
  content.focus({ preventScroll: true })
}

async function openRun(runId) {
  setPageMeta('runs')
  state.page = 'runs'
  content.innerHTML = '<div class="loading-state"><span class="spinner"></span>正在读取批次快照…</div>'
  const encoded = encodeURIComponent(runId)
  const [snapshot, progress] = await Promise.all([
    request(`/api/v1/runs/${encoded}`),
    request(`/api/v1/runs/${encoded}/progress`),
  ])
  state.selectedRun = { ...snapshot, progress }
  renderRunWorkspace(state.selectedRun)
}

async function performActionItem(button) {
  if (!state.operatorMode || !state.token) {
    showToast('请先进入治理模式。', 'warning')
    return
  }
  const action = button.dataset.action
  const actionItemId = button.dataset.actionItem
  const reason = window.prompt(action === 'RESOLVE' ? '请输入解决依据' : '请输入本次操作依据')?.trim()
  if (!reason) return
  let feedback
  if (action === 'REGENERATE') {
    feedback = window.prompt('请输入重新生成时必须采用的反馈')?.trim()
    if (!feedback) return
  }
  button.disabled = true
  try {
    const suffix = action === 'REGENERATE' ? 'regenerate' : `actions/${action.toLowerCase()}`
    await request(`/api/v1/action-items/${encodeURIComponent(actionItemId)}/${suffix}`, {
      method: 'POST',
      body: JSON.stringify({
        expectedRevision: Number(button.dataset.revision), reason,
        ...(feedback ? { feedback } : {}),
      }),
    })
    await refreshControlPlane()
    renderOverview()
    showToast('治理操作已提交并记录审计。', 'success')
  } catch (error) {
    button.disabled = false
    showToast(userFacingError(error, '治理操作失败，请刷新后重试。'), 'danger')
  }
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
  const previousReturnFocus = drawerReturnFocus
  const previousReturnKey = drawerReturnKey
  drawer.classList.remove('open')
  drawer.setAttribute('aria-hidden', 'true')
  drawerBackdrop.hidden = true
  drawer.hidden = true
  requestAnimationFrame(() => {
    const returnTarget = document.contains(previousReturnFocus)
      ? previousReturnFocus
      : (previousReturnKey ? content.querySelector(previousReturnKey) : null)
    if (returnTarget instanceof HTMLElement) returnTarget.focus({ preventScroll: true })
  })
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
    showToast('服务端尚未配置写入令牌。请到“Agent 设置”查看配置方法。', 'warning')
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
  showToast(`批次 ${shortId(runId, 16)} 已启动。`, 'success')
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
  const actionSourceButton = event.target.closest('[data-action-source-id]')
  if (actionSourceButton) {
    const sourceId = actionSourceButton.dataset.actionSourceId
    navigate('sources').then(() => {
      const returnFocus = [...content.querySelectorAll('[data-source-id]')]
        .find((button) => button.dataset.sourceId === sourceId)
        ?? nav.querySelector('[data-page="sources"]')
      return openSource(sourceId, returnFocus)
    }).catch((error) => showToast(userFacingError(error, '无法读取来源详情。'), 'danger'))
  }
  const actionButton = event.target.closest('[data-action-item]')
  if (actionButton) performActionItem(actionButton)
  if (event.target.closest('[data-run-back]')) { state.selectedRun = null; renderRuns() }
  const refresh = event.target.closest('[data-refresh-run]')
  if (refresh) openRun(refresh.dataset.refreshRun).catch(showFatal)
  const knowledgeButton = event.target.closest('[data-version-id]')
  if (knowledgeButton) openKnowledge(knowledgeButton.dataset.versionId, knowledgeButton).catch(showFatal)
  const evidenceButton = event.target.closest('[data-evidence]')
  if (evidenceButton) openEvidence(evidenceButton.dataset.evidence, evidenceButton)
  const evaluationButton = event.target.closest('[data-evaluation-id]')
  if (evaluationButton) openEvaluation(evaluationButton.dataset.evaluationId, evaluationButton).catch((error) => showToast(userFacingError(error, '无法读取评测详情。'), 'danger'))
  const sourceButton = event.target.closest('[data-source-id]')
  if (sourceButton) openSource(sourceButton.dataset.sourceId, sourceButton).catch((error) => showToast(userFacingError(error, '无法读取来源详情。'), 'danger'))
  const refreshSourceButton = event.target.closest('[data-refresh-source]')
  if (refreshSourceButton) refreshSource(refreshSourceButton.dataset.refreshSource).catch((error) => showToast(userFacingError(error, '无法刷新来源。'), 'danger'))
  const registerSourceButton = event.target.closest('[data-register-source]')
  if (registerSourceButton) createSource({ kind: 'FILE', locator: registerSourceButton.dataset.registerSource, project: 'default' }).catch((error) => showToast(userFacingError(error, '无法登记来源。'), 'danger'))
  if (event.target.closest('[data-load-evaluations]')) renderEvidence(true).catch((error) => showToast(userFacingError(error, '无法加载更多评测记录。'), 'danger'))
  if (event.target.closest('[data-load-sources]')) renderDiscovery(false, true).catch((error) => showToast(userFacingError(error, '无法加载更多来源。'), 'danger'))
  if (event.target.closest('[data-verify-provider]')) verifyProviderSettings()
  const lineageRun = event.target.closest('[data-lineage-run]')
  if (lineageRun) navigate('runs').then(() => openRun(lineageRun.dataset.lineageRun)).catch(showFatal)
  const knowledgeModule = event.target.closest('[data-knowledge-module]')
  if (knowledgeModule) applyKnowledgeModule(knowledgeModule.dataset.knowledgeModule)
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
  state.knowledgeQuery = event.target.value.trim()
  clearTimeout(state.searchTimer)
  state.searchTimer = setTimeout(async () => {
    try {
      await refreshKnowledgeList()
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
      if (stage) stage.innerHTML = emptyState('选择一个批次', '工作流图只展示服务端已记录的 Agent 工作状态。')
      return
    }
    if (stage) stage.innerHTML = '<div class="loading-state"><span class="spinner"></span>正在读取 Agent 节点事实…</div>'
    await loadGraph(runId)
  }
  if (event.target.id === 'knowledge-status') {
    state.knowledgeStatus = event.target.value
    try {
      await refreshKnowledgeList()
    } catch (error) {
      document.querySelector('#knowledge-list').innerHTML = errorState('筛选失败', error)
      document.querySelector('#knowledge-count').textContent = '—'
    }
  }
  if (event.target.id === 'metrics-window') {
    state.metricsWindow = event.target.value
    state.runMetrics = null
    state.governanceMetrics = null
    await loadAgentOperations(true)
    renderAgents()
  }
  const filter = event.target.closest('[data-run-filter]')
  if (filter) filterRuns(filter.dataset.runFilter)
})

content.addEventListener('submit', (event) => {
  if (event.target.id === 'feedback-form') {
    event.preventDefault()
    submitFeedback(event.target).catch((error) => showToast(userFacingError(error, '无法提交知识反馈。'), 'danger'))
  }
  if (event.target.classList.contains('agent-prompt-form')) {
    event.preventDefault()
    saveAgentPrompt(event.target).catch((error) => showToast(userFacingError(error, '无法保存 Agent 提示词。'), 'danger'))
  }
  if (event.target.id === 'workflow-start-form') {
    event.preventDefault()
    startWorkflow(event.target).catch((error) => showToast(userFacingError(error, '无法创建新批次。'), 'danger'))
  }
  if (event.target.id === 'provider-settings-form') {
    event.preventDefault()
    saveProviderSettings(event.target)
  }
  if (event.target.id === 'source-create-form') {
    event.preventDefault()
    const data = new FormData(event.target)
    const displayName = String(data.get('displayName') ?? '').trim()
    const credentialRef = String(data.get('credentialRef') ?? '').trim()
    createSource({
      kind: String(data.get('kind') ?? 'FILE'), locator: String(data.get('locator') ?? '').trim(),
      project: String(data.get('project') ?? 'default').trim() || 'default',
      ...(displayName ? { displayName } : {}), ...(credentialRef ? { credentialRef } : {}),
    }).catch((error) => showToast(userFacingError(error, '无法登记来源。'), 'danger'))
  }
  if (event.target.classList.contains('rule-card')) {
    event.preventDefault()
    saveEvaluationRule(event.target).catch((error) => showToast(userFacingError(error, '无法保存评测规则。'), 'danger'))
  }
  if (event.target.id === 'evaluation-filter-form') {
    event.preventDefault()
    const data = new FormData(event.target)
    state.evaluationFilters = Object.fromEntries(['runId', 'moduleId', 'gate', 'status', 'from', 'to'].map((key) => [key, String(data.get(key) ?? '').trim()]))
    state.evaluationEnvelope = null
    renderEvidence(false).catch((error) => showToast(userFacingError(error, '无法筛选评测记录。'), 'danger'))
  }
  if (event.target.id === 'source-filter-form') {
    event.preventDefault()
    const data = new FormData(event.target)
    state.sourceStatus = String(data.get('status') ?? '')
    state.sourceKind = String(data.get('kind') ?? '')
    state.sourceProject = String(data.get('project') ?? '').trim()
    state.sourceEnvelope = null
    renderDiscovery(false).catch((error) => showToast(userFacingError(error, '无法筛选来源。'), 'danger'))
  }
})

drawerContent.addEventListener('submit', (event) => {
  if (event.target.id === 'feedback-form') {
    event.preventDefault()
    submitFeedback(event.target).catch((error) => showToast(userFacingError(error, '无法提交知识反馈。'), 'danger'))
  }
  if (event.target.id === 'knowledge-diff-form') {
    event.preventDefault()
    compareKnowledgeVersions(event.target)
  }
  if (event.target.id === 'source-update-form') {
    event.preventDefault()
    updateSource(event.target).catch((error) => showToast(userFacingError(error, '无法更新来源配置。'), 'danger'))
  }
})

drawerContent.addEventListener('click', (event) => {
  const download = event.target.closest('[data-download-artifact]')
  if (download) {
    downloadArtifact(download.dataset.downloadArtifact).catch((error) => showToast(userFacingError(error, '无法下载评测证据。'), 'danger'))
    return
  }
  const lineageRun = event.target.closest('[data-lineage-run]')
  if (lineageRun) {
    navigate('runs').then(() => openRun(lineageRun.dataset.lineageRun)).catch(showFatal)
    return
  }
  const evaluation = event.target.closest('[data-evaluation-id]')
  if (evaluation) {
    openEvaluation(evaluation.dataset.evaluationId, evaluation).catch((error) => showToast(userFacingError(error, '无法读取评测详情。'), 'danger'))
    return
  }
  const version = event.target.closest('[data-version-id]')
  if (version) {
    openKnowledge(version.dataset.versionId, version).catch(showFatal)
    return
  }
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
  if (target) target.innerHTML = runs.length ? runs.map((run, index) => target.closest('.reference-run-history') ? referenceRunRow(run, index === 0) : runRow(run)).join('') : emptyState('没有匹配的批次', '请选择其他状态筛选。')
}

operatorButton.addEventListener('click', () => {
  if (!state.capabilities) {
    showToast('能力状态读取失败，请重新连接后再试。', 'warning')
    return
  }
  if (!state.capabilities?.writeEnabled) {
    showToast('服务端尚未配置写入令牌。请到“Agent 设置”查看配置方法。', 'warning')
    return
  }
  if (state.operatorMode) {
    state.token = ''
    state.operatorMode = false
    updateMode()
    refreshControlPlane().then(() => state.page === 'overview' && renderOverview()).catch(() => {})
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
  refreshControlPlane().then(() => state.page === 'overview' && renderOverview()).catch((error) => showToast(userFacingError(error, '无法刷新控制面数据。'), 'danger'))
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
  if (event.key === 'Escape' && drawer.classList.contains('open')) {
    event.preventDefault()
    closeDrawer()
  }
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
    operatorButton.textContent = '＋ 新建批次'
  }
  if (state.page === 'agent-settings') renderAgents()
  if (state.page === 'runs') renderRuns()
  if (state.page === 'overview') renderOverview()
}

function showFatal(error) {
  registryIndicator.className = 'health-dot failed'
  registryLabel.textContent = '连接失败'
  content.innerHTML = emptyState('无法读取知识飞轮', userFacingError(error, '无法连接控制面服务。'), '<button class="primary-button" data-reload>重新连接</button>')
}

async function boot() {
  const keys = ['status', 'capabilities', 'runs', 'knowledge', 'agents', 'actionItems', 'activities', 'components', 'knowledgeHealth']
  const results = await Promise.allSettled([
    request('/api/v1/system/status'), request('/api/v1/system/capabilities'), request('/api/v1/runs'), request('/api/v1/knowledge'), request('/api/v1/agents'),
    request('/api/v1/action-items'), request('/api/v1/activity'), request('/api/v1/system/components'), request('/api/v1/knowledge/health'),
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
  state.actionItems = results[5].status === 'fulfilled' ? collection(results[5].value, 'actionItems') : []
  state.activities = results[6].status === 'fulfilled' ? collection(results[6].value, 'activities') : []
  state.components = results[7].status === 'fulfilled' ? results[7].value : null
  state.knowledgeHealth = results[8].status === 'fulfilled' ? results[8].value : null
  if (state.runs[0]) {
    state.latestProgress = await request(`/api/v1/runs/${encodeURIComponent(state.runs[0].runId)}/progress`).catch(() => null)
  }
  state.loadedAt = new Date().toISOString()
  const partial = Object.values(state.resourceErrors).some(Boolean)
  registryIndicator.className = `health-dot ${partial ? 'pending' : 'healthy'}`
  registryLabel.textContent = partial ? '部分数据可用' : '服务已连接'
  governanceCount.textContent = state.actionItems.filter((item) => item.status !== 'RESOLVED').length || ''
  runtimeFooter.innerHTML = `<span><i class="health-dot healthy"></i>控制台 API 已连接</span><span>读取于 ${escapeHtml(formatDate(state.loadedAt))}</span><span>${escapeHtml(state.runs.length)} 个批次 · ${escapeHtml(state.knowledge.length)} 个知识版本</span>`
  updateMode()
  setPageMeta('overview')
  renderOverview()
  connectActivityStream()
  closeNavigation()
}

async function refreshControlPlane() {
  const keys = ['runs', 'actionItems', 'activities', 'knowledgeHealth']
  const results = await Promise.allSettled([
    request('/api/v1/runs'), request('/api/v1/action-items'), request('/api/v1/activity'), request('/api/v1/knowledge/health'),
  ])
  if (results[0].status === 'fulfilled') state.runs = collection(results[0].value, 'runs')
  if (results[1].status === 'fulfilled') state.actionItems = collection(results[1].value, 'actionItems')
  if (results[2].status === 'fulfilled') state.activities = collection(results[2].value, 'activities')
  if (results[3].status === 'fulfilled') state.knowledgeHealth = results[3].value
  results.forEach((result, index) => {
    state.resourceErrors[keys[index]] = result.status === 'rejected' ? result.reason : null
  })
  const partial = Object.values(state.resourceErrors).some(Boolean)
  registryIndicator.className = `health-dot ${partial ? 'pending' : 'healthy'}`
  registryLabel.textContent = partial ? '部分数据可用' : '服务已连接'
  governanceCount.textContent = state.actionItems.filter((item) => item.status !== 'RESOLVED').length || ''
  if (state.runs[0]) {
    state.latestProgress = await request(`/api/v1/runs/${encodeURIComponent(state.runs[0].runId)}/progress`).catch(() => null)
  }
}

function connectActivityStream() {
  if (!('EventSource' in window) || state.activityStream) {
    if (!('EventSource' in window) && !state.activityPoll) {
      state.activityPoll = setInterval(() => refreshControlPlane().then(() => state.page === 'overview' && renderOverview()).catch(() => {}), 10_000)
    }
    return
  }
  const after = state.activities[0]?.cursor ?? ''
  const stream = new EventSource(`/api/v1/activity/stream?after=${encodeURIComponent(after)}`)
  stream._cursor = after
  stream.addEventListener('ready', () => {
    clearInterval(state.activityPoll)
    state.activityPoll = null
  })
  stream.addEventListener('activity', (event) => {
    stream._cursor = event.lastEventId || stream._cursor
    refreshControlPlane().then(() => state.page === 'overview' && renderOverview()).catch(() => {})
  })
  stream.addEventListener('reconnect', (event) => {
    try { stream._cursor = JSON.parse(event.data).after || stream._cursor } catch {}
  })
  stream.onerror = () => {
    stream.close()
    if (state.activityStream === stream) state.activityStream = null
    if (!state.activityPoll) {
      state.activityPoll = setInterval(() => refreshControlPlane().then(() => state.page === 'overview' && renderOverview()).catch(() => {}), 10_000)
    }
    setTimeout(() => {
      if (!state.activityStream) connectActivityStreamFrom(stream._cursor)
    }, 2_000)
  }
  state.activityStream = stream
}

function connectActivityStreamFrom(after) {
  if (state.activityStream || !('EventSource' in window)) return
  const stream = new EventSource(`/api/v1/activity/stream?after=${encodeURIComponent(after || '')}`)
  stream._cursor = after || ''
  stream.addEventListener('ready', () => {
    clearInterval(state.activityPoll)
    state.activityPoll = null
  })
  stream.addEventListener('activity', (event) => {
    stream._cursor = event.lastEventId || stream._cursor
    refreshControlPlane().then(() => state.page === 'overview' && renderOverview()).catch(() => {})
  })
  stream.onerror = () => {
    stream.close()
    if (state.activityStream === stream) state.activityStream = null
    if (!state.activityPoll) state.activityPoll = setInterval(() => refreshControlPlane().then(() => state.page === 'overview' && renderOverview()).catch(() => {}), 10_000)
    setTimeout(() => !state.activityStream && connectActivityStreamFrom(stream._cursor), 2_000)
  }
  state.activityStream = stream
}

boot().catch(showFatal)
