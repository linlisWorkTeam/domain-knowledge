<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：当前实现与验证状态。
-->
# 当前实现与验证状态

本文件只描述当前代码及明确保留的能力边界。历史里程碑、日期化报告和旧任务包汇总到 [historyEpitaph](HistoryEpitaph.md)。

| 范围 | 当前事实 | 未完成或未验证部分 |
| --- | --- | --- |
| 七角色结构 | Domain 独立目录、专属契约、显式注册和公共提交链已实现；固定 DocGen 示例已合入角色样例 | 结构迁移不等于七角色真实效果验收 |
| 跨角色流程 | Domain 定义业务连接，LangGraph 负责执行与 checkpoint | 不开放动态拓扑编辑 |
| 模型接入 | DSH 原生 SDK、受控 Fixture、OpenCode Go 环境配置已实现 | 公司 CLI 真实协议未验收 |
| 评测与发布 | 可信场景执行、确定性 Gate、幂等发布和审计已实现 | TestGen 候选 oracle 晋升、C++ 插件和敌对代码沙箱未实现 |
| 查询与关联 | 现有查询、血缘、Diff、来源和关联领域能力 | SearchAgent 直接检索链仍为 Planned |
| 资源模块 | SourceScan、Workspace、legacyOkf 已归入 Domain | 保留既有文件系统、Git 和 YAML 依赖 |
| 文档组织 | 设计集中 docs/specs，按代码模块重写；4+1 视图集中一份 | 旧规范目录、独立 security 章节与重复任务模板已移除 |

## 本次验证口径

本轮按用户要求不重新运行测试。只进行类型、路径、文档结构、Schema 字节一致性与 diff 静态检查。初版七角色提交曾通过 219 项测试和 14 项 Console 测试；结果属于该历史提交，不能作为当前文档及目录变更后的测试结论。

DSH 单 DocGen 范例的历史 live 验证见历史汇总；本轮没有真实模型调用。后续按 PR 审查意见确定回归范围，不自动展开未实现能力。
