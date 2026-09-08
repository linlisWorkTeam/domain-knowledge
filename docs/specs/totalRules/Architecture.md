<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：系统架构。
-->
# 系统架构

代码位置：[src/interfaces/runner/Composition.ts](../../../src/interfaces/runner/Composition.ts)、[src/application/apps/ApplicationApps.ts](../../../src/application/apps/ApplicationApps.ts)、[src/domain/services/workflow/Workflow.ts](../../../src/domain/services/workflow/Workflow.ts)、[src/infrastructure/langgraph/Graph.ts](../../../src/infrastructure/langgraph/Graph.ts)。


## 系统上下文

本仓库持有运行代码、Schema、设计与 Console；wpKnowledge 保存经过整理的知识正文及外部证据。用户经 CLI 或 HTTP 调用 Application，Application 组合 Domain 规则和端口，Composition 绑定具体实现。知识内容仓库不运行第二套 Runner。

## 协作关系

| 层 | 拥有的决定 | 交接结果 |
| --- | --- | --- |
| Interfaces | 解析参数、路由、响应、组合根装配 | 用例输入或 HTTP 投影 |
| Application | 加载可信材料、冻结配置、调用角色、评测与提交事务的次序 | 已持久化的 Run、工件引用和查询结果 |
| Domain | 角色步骤、跨角色业务流转、实体状态和 Gate 判定 | 业务结果、待保存正文、领域判定 |
| Infrastructure | SDK、网络、模型会话、图引擎、数据库和外部进程 | 满足端口的技术执行结果 |

## 运行与事实

`FlywheelRun` 表达业务生命周期；LangGraph executionStatus 表达执行器进展，两者共享 runId 但不能互相覆盖。Registry 保存业务事件和节点投影，checkpoint 保存引擎恢复信息，Console 不读取引擎私有表。

角色返回的计划是工件，不能改写固定业务连接。七个角色的模型调用和阶段转换分别在 Domain Agent 与 Domain Workflow 中审查；无需通过抽象工厂或自动注册才能复用。接口、注册表和依赖注入已满足当前扩展范围。

## 已知实现取舍

SourceScan、Workspace、legacyOkf 是按资源职责归入 Domain 的既有模块，仍使用文件系统、Git 或 YAML；七角色的业务实现保持无这些依赖。QualityPolicy 和 KnowledgeWritingGuide 当前在 Application，重写规范不把它们描述成已迁入 Domain。Redis 有端口适配实现，本地组合根仍以 SQLite 和进程内执行表为主。

LanguagePlugin 仅有契约；公司 CLI 保留适配入口与契约测试，真实公司协议未验收；SearchAgent 仍是独立检索方向。变更这些边界时直接修改所属设计，已过期 ADR 见历史汇总。

[4+1 视图](../../diagrams/Views4Plus1.md)展示逻辑、开发、进程、物理与场景五个视角。

<details lang="en">
<summary>English summary</summary>

Domain owns role behavior and workflow policies. Application loads trusted inputs and commits business results. Infrastructure supplies model, graph, storage and execution adapters. Registry is the business record; graph checkpoints are execution state. Resource-oriented Domain modules retain their existing file and Git access. Planned capabilities are explicitly distinguished from implemented behavior.

</details>


文档关系：[设计目录](../README.md)负责代码与设计定位；[开发指南](../../Development.md)说明修改和交付步骤。
