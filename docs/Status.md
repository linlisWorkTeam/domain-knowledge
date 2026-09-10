<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：当前实现与验证状态。
-->
# 当前实现与验证状态

本文件只描述当前代码及明确保留的能力边界。历史里程碑、日期化报告和旧任务包汇总到 [historyEpitaph](HistoryEpitaph.md)。

| 范围 | 当前事实 | 未完成或未验证部分 |
| --- | --- | --- |
| Agent 结构 | 六个外层 Agent；DocWorker 位于 DocGen/subAgents，保留独立执行身份、契约、提示词与提交记录；DocGen 组织源码拆分与汇总 | 本次结构与流程回归不代表真实模型生成质量验收 |
| 跨角色流程 | Domain 定义业务连接，LangGraph 只调度外层角色；DocGen 内部 Worker 使用独立 Registry 提交与有界并发 | 旧 roleExecutionVersion 拒绝恢复；不开放动态拓扑编辑 |
| Domain 组织 | 按领域功能平级组织，已移除 services 目录和总导出 | 共享实体仍位于 Domain.ts |
| 模型接入 | DSH 原生 SDK、受控 Fixture、OpenCode Go 环境配置已实现 | 公司 CLI 真实协议未验收 |
| 评测与发布 | 可信场景执行、确定性 Gate、幂等发布和审计已实现 | TestGen 候选 oracle 晋升、C++ 插件和敌对代码沙箱未实现 |
| 查询与关联 | 现有查询、血缘、Diff、来源和关联领域能力 | SearchAgent 直接检索链仍为 Planned |
| 资源模块 | SourceScan、Workspace、legacyOkf 已归入 Domain | 保留既有文件系统、Git 和 YAML 依赖 |
| 文档组织 | 设计集中 docs/specs，按代码模块重写；4+1 视图集中一份 | 旧规范目录、独立 security 章节与重复任务模板已移除 |

## 本次验证口径

2026-09-10，feat/knowledge-generation-agent 基于 main@96d277b 完成 DocGen 内部 Worker 重构。Node 24.13.0 下 typecheck、validate:specs、git diff --check 通过；定向验证 35 项通过。全量 npm test 为 229 项，227 通过、2 失败。

两项失败均已在未修改的 96d277b 独立源码快照中复现：Site 发布资产测试仍要求小写文件名，但资产为 ConsoleDev007Dev008.gif；主题测试要求 UiuxDesign.md 包含 #080b10 等颜色值，现有文档缺失。它们不是本次重构引入的问题，本分支未修改站点资源、主题规范或对应测试。

新增 DocGenWithWorkersSample CLI 组合样例通过：fixture 模式下两个 Worker 提交片段后 DocGen 汇总成功，publication=NOT_EVALUATED。本轮未调用真实模型、未做浏览器验收。验证细节与后续边界见 [本次交接](epitaph/2026-09-10-1046-docgen-internal-workers.md)。
