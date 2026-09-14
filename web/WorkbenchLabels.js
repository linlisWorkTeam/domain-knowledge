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
