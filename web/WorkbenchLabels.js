/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：集中维护批次和节点的国际化文案。
 */
const labels = {
  'zh-CN': {
    CREATED: '创建任务', STARTED: '开始执行', RESUMED: '恢复执行', CHECKPOINT: '保存检查点', USAGE: '记录用量', READY: '待启动', QUEUED: '排队中', PENDING: '排队中', RUNNING: '运行中', PAUSED: '已暂停', SUCCEEDED: '执行完成', FAILED: '失败', CANCELLED: '已取消', UNKNOWN: '未知',
    GENERATE: '知识生成', INDEX: '知识索引', FLYWHEEL: '代码重建', EVALUATE: '知识评测', ASSOCIATE: '知识关联',
    FIXED_NATIVE_EVALUATION: '固定用例评测', KNOWLEDGE_REVISION: '知识修订', KNOWLEDGE_SOURCE_REVISION: '来源修订', KNOWLEDGE_SOURCE_VERIFICATION: '来源复核',
    records: '执行记录', graph: '节点图', logs: '运行日志', start: '开始时间', end: '结束时间', unknownNode: '执行节点',
  },
  en: {
    CREATED: 'Created', STARTED: 'Started', RESUMED: 'Resumed', CHECKPOINT: 'Checkpoint saved', USAGE: 'Usage recorded', READY: 'Ready', QUEUED: 'Queued', PENDING: 'Queued', RUNNING: 'Running', PAUSED: 'Paused', SUCCEEDED: 'Completed', FAILED: 'Failed', CANCELLED: 'Cancelled', UNKNOWN: 'Unknown',
    GENERATE: 'Knowledge generation', INDEX: 'Indexing', FLYWHEEL: 'Reconstruction', EVALUATE: 'Evaluation', ASSOCIATE: 'Associations',
    FIXED_NATIVE_EVALUATION: 'Fixed evaluation', KNOWLEDGE_REVISION: 'Knowledge revision', KNOWLEDGE_SOURCE_REVISION: 'Source revision', KNOWLEDGE_SOURCE_VERIFICATION: 'Source verification',
    records: 'Execution records', graph: 'Node graph', logs: 'Execution log', start: 'Started', end: 'Finished', unknownNode: 'Execution node',
  },
}
export function workbenchLabel(key, locale = document.documentElement.lang) {
  const language = labels[locale] ?? labels[locale?.split('-')[0]] ?? labels['zh-CN']
  return language[key] ?? language.UNKNOWN
}

const explanations = {
  orchestrator: ['任务编排', '决定本轮需要执行的步骤。', '模块范围、已有结果和执行配置', '本轮执行计划'],
  doc_gen: ['知识生成', '从源码整理用途、接口、行为和边界说明。', '固定源码及已有修订意见', '候选知识文档'],
  doc_worker: ['源码分块分析', '阅读分配的源码片段，提供可追溯的事实。', '授权源码片段', '供知识生成使用的事实和引用'],
  test_gen: ['测试生成', '依据知识提出测试，再交由参考实现校验。', '知识、公开接口和测试策略', '候选测试用例'],
  oracle_validation: ['参考测试校验', '先确认测试在参考实现上成立，避免错误测试成为门禁。', '候选测试和固定参考实现', '可信用例或候选拒绝证据'],
  code: ['代码重建', '仅依据知识和公开接口重新实现代码。', '知识、接口和构建约束', '隔离目录中的生成代码'],
  check: ['代码比较', '比较参考与生成实现的接口、结构和规范化差异。', '参考实现和生成代码', '差异报告及阻塞项'],
  evaluate: ['行为评测', '运行可信测试，比较预期和实际结果。', '生成代码与可信测试', '通过率、失败输入及观察结果'],
  review: ['问题复核', '依据证据判断哪些知识描述需要修订。', '知识及本轮检查、评测证据', '定位到章节的修订意见或未解决风险'],
  gate: ['门禁判定', '按固定规则决定能否通过，以及是否继续修订。', '测试、检查和复核结果', '通过、继续修订或停止的判定'],
  publish: ['知识发布', '将通过门禁的知识保存为可读取的发布产物。', '已通过门禁的知识和证据', '知识文件及发布记录'],
  INDEX: ['搜索目录更新', '整理卡片摘要和关键词，供问题检索使用。', '当前卡片版本', '搜索目录与更新统计'],
  ASSOCIATE: ['知识关联', '查找卡片之间及指定材料之间有证据支持的关系。', '卡片与用户提供的材料', '关联原因、来源和适用条件'],
  KNOWLEDGE_REVISION: ['知识修订', '根据可信失败证据修订对应章节。', '当前知识和已确认的问题', '新卡片版本及前后对比'],
  KNOWLEDGE_SOURCE_REVISION: ['来源修订', '纠正文档中已定位的源码事实矛盾。', '来源复核意见与固定源码', '修订版本及重新复核结果'],
  KNOWLEDGE_SOURCE_VERIFICATION: ['来源复核', '逐章核对知识描述是否与固定参考源码一致。', '卡片正文、固定源码和参考观察', '匹配、矛盾或证据不足的逐章结论'],
  FIXED_NATIVE_EVALUATION: ['固定用例评测', '分别在参考和生成实现上执行启动时冻结的测试。', '固定测试、参考实现和生成代码', '固定门禁结果及失败证据'],
}
const aliases = { GENERATE: 'doc_gen', FLYWHEEL: 'code', EVALUATE: 'evaluate', plan: 'orchestrator', 'doc-gen': 'doc_gen', 'doc-worker': 'doc_worker', 'test-gen': 'test_gen' }
export function nodeExplanation(key) {
  const base = String(key ?? '').split(':')[0]
  const [name, purpose, input, output] = (Object.hasOwn(explanations, aliases[base] ?? base) ? explanations[aliases[base] ?? base] : null) ?? ['执行节点', '旧记录没有提供这个节点的职责定义。', '见已保存的原始记录', '以该节点保存的结果为准']
  return { name, purpose, input, output }
}
export function executionNote(value) {
  const text = String(value ?? '')
  if (!text) return '尚无详细执行记录'
  let match
  if ((match = /^planned iteration (\d+)$/.exec(text))) return `已规划第 ${Number(match[1]) + 1} 轮执行步骤`
  if (/produced schema-validated role output$/.test(text)) return '已产出结构化结果，输出格式校验通过；质量结论以评测和门禁为准'
  if ((match = /^candidate (\S+) rejected by quality policy \(([^)]+)\)$/.exec(text))) return `候选知识未通过质量检查，得分 ${match[2]}`
  if (/^candidate \S+$/.test(text)) return '候选知识版本已保存，等待后续验证'
  if (text === 'source tests validated and reused') return '参考测试已验证，本轮复用可信用例'
  if (text === 'source tests validated' || text === 'reference oracle passed') return '测试在参考实现上验证通过'
  if ((match = /^evaluation (passed|failed); awaiting review and gate$/.exec(text))) return `行为评测${match[1] === 'passed' ? '通过' : '未通过'}，等待问题复核和门禁判定`
  if ((match = /^workflow route (PASS|ITERATE|STOPPED)$/.exec(text))) return `本轮处理结果：${({ PASS: '通过', ITERATE: '继续修订', STOPPED: '停止并保留问题' })[match[1]]}`
  if ((match = /^knowledge quality ([^;]+); (stopped|iterate):/.exec(text))) return `知识质量得分 ${match[1]}，${match[2] === 'stopped' ? '已停止，需处理质量问题' : '需要继续修订'}；具体弱项见原始记录`
  if (/^evaluation infrastructure failed/.test(text)) return '评测执行环境发生错误，不能据此判定知识正确或错误'
  if (/\p{Script=Han}/u.test(text)) return text.replaceAll('DocGen', '知识生成').replaceAll('TestGen', '测试生成').replaceAll('Review', '问题复核')
  return '已保存一条技术执行记录，具体内容见下方原始日志'
}
const fieldNames = { status: '状态', outcome: '结果', role: '执行角色', stage: '执行阶段', phase: '处理步骤', attempt: '执行次数', taskAttempt: '任务执行次数', modelCalls: '模型调用次数', tokens: '实际用量', reservedTokens: '预留用量', elapsedMs: '已用时间（毫秒）', generated: '生成数量', indexed: '已更新搜索目录', passed: '通过数量', total: '总数', testsPassed: '通过用例数', testsTotal: '用例总数', reused: '复用数量', failed: '失败数量', updated: '更新数量', added: '新增数量', publicationVerified: '是否已验证发布', section: '知识章节', heading: '知识章节', cardCount: '卡片数量', associationCount: '关联数量', fixedCaseCount: '固定用例数' }
const resultNames = { SOURCE_MATCHED: '来源匹配', SOURCE_MISMATCH: '存在源码事实矛盾', UNRESOLVED: '证据不足，仍需处理', BEHAVIOR_PASSED: '行为评测通过', PASS: '通过', ITERATE: '需要修订', STOPPED: '已停止', REJECTED: '未通过', MATCHED: '匹配', STARTED: '开始执行', COMPLETED: '执行完成', SUCCEEDED: '执行完成', FAILED: '失败', RUNNING: '运行中', PENDING: '等待执行', CANCELLED: '已取消', PAUSED: '已暂停', 'role-command': '准备角色输入', 'role-stage-attempt': '执行角色步骤', 'evidence-attribution': '依据证据定位问题' }
export function readableRecord(value) {
  return Object.entries(value ?? {}).filter(([key]) => fieldNames[key]).map(([key, raw]) => {
    let text = typeof raw === 'boolean' ? raw ? '是' : '否' : typeof raw === 'number' ? String(raw) : Object.hasOwn(resultNames, raw) ? resultNames[raw] : undefined
    if (!text && ['role', 'stage'].includes(key)) text = nodeExplanation(raw).name
    if (!text && typeof raw === 'string' && /\p{Script=Han}/u.test(raw)) text = raw
    return { label: fieldNames[key], value: text ?? '详见原始记录' }
  })
}
export function checkpointLabel(key) {
  const prefix = String(key).split(':')[0]
  return ({ 'source-execution-scope': '确认参考构建范围', 'source-materials': '准备章节来源材料', 'source-section': '保存章节复核结果', 'source-card': '汇总卡片复核结果', role: '保存角色输出', 'revision-card': '保存卡片修订', 'revision-source-materials': '准备修订复核材料', 'trusted-case': '保存可信用例结果', 'generated-case': '保存生成实现测试结果', 'reference-case': '保存参考实现测试结果', 'index-build': '保存搜索目录', module: '保存模块结果' })[prefix] ?? '保存阶段处理结果'
}
