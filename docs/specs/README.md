<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：设计规范目录。
-->
# 设计规范目录

设计与代码一起维护，docs/specs 是唯一设计入口。totalRules 保存跨模块约定，domainFunction、application、infrastructure、interfaces 对应实际实现职责。目录名称优先匹配代码，例如 SQLite 使用 sqlite，LangGraph 使用 langgraph；不照搬旧编号章节，不创建无实现的代码占位目录。

| 分类 | 对应代码 | 设计入口 |
| --- | --- | --- |
| totalRules | 仓库整体 | [Requirements](totalRules/Requirements.md)、[Architecture](totalRules/Architecture.md)、[DomainDrivenDesign](totalRules/DomainDrivenDesign.md)、[CodeTaste](totalRules/CodeTaste.md)、[UiuxDesign](totalRules/UiuxDesign.md)、[Verification](totalRules/Verification.md) |
| domainFunction | src/domain | [Agents](domainFunction/agents/Agents.md)、[Workflow](domainFunction/services/workflow/Workflow.md)、[Knowledge](domainFunction/services/knowledge/Knowledge.md)、[Association](domainFunction/services/association/Association.md)、[Evaluation](domainFunction/services/evaluation/Evaluation.md)、[SourceScan](domainFunction/services/sourceScan/SourceScan.md)、[Workspace](domainFunction/services/workspace/Workspace.md)、[legacyOkf](domainFunction/services/migration/LegacyOkf.md) |
| languagePlugins | 当前只有 application/ports 契约 | [LanguagePlugins](domainFunction/languagePlugins/LanguagePlugins.md)，未创建具体插件 |
| application | src/application | [Application](application/Application.md) |
| infrastructure | src/infrastructure 的同名目录 | [sqlite](infrastructure/sqlite/Sqlite.md)、[redis](infrastructure/redis/Redis.md)、[langgraph](infrastructure/langgraph/LangGraph.md)、[agentAdapters](infrastructure/agentAdapters/AgentAdapters.md)、[evaluation](infrastructure/evaluation/Evaluation.md)、[http](infrastructure/http/Http.md)、[observability](infrastructure/observability/Observability.md) |
| interfaces | src/interfaces、web | [HttpApi](interfaces/HttpApi.md)、[UiuxDesign](totalRules/UiuxDesign.md) |
| schemas | 跨层版本化机器契约 | [Schema 目录](schemas/README.md)，保持 $id 和字节兼容 |

Domain 中 `agents` 与 `services` 平级：`agents/<role>` 保存领域内部角色实现；`services/<feature>` 按 association、evaluation、knowledge、workflow、sourceScan、workspace、migration 组织领域对外服务及所属规则。`Domain.ts` 保留共享实体与不变量。领域服务封装业务能力，不复制 Agent 的生成步骤，也不承担 Application 的持久化事务。

## Spec 与操作文档的对应关系

| 设计 | 操作指南 |
| --- | --- |
| Architecture / DomainDrivenDesign / CodeTaste | [Development](../Development.md)和[4+1 视图](../diagrams/Views4Plus1.md) |
| Agents / Workspace / Workflow | [AgentDevelopment](../AgentDevelopment.md) |
| AgentAdapters / HTTP / LangGraph / DB / Redis | [Runtime](../Runtime.md)和[Operations](../Operations.md) |
| HttpApi / UiuxDesign | [GettingStarted](../GettingStarted.md)和[Operations](../Operations.md) |
| Requirements / Verification | [Status](../Status.md)记录当前能力与实际验证口径 |

设计写应有行为与当前限制，指南写如何运行和修改。旧 security 章节删除，已有材料、HTTP 和凭据约束归属实际模块；不因此删除代码防护。旧 ADR、任务包、报告与早期交接归纳在 historyEpitaph，不作为另一套当前设计。

<details lang="en">
<summary>English summary</summary>

Design specifications live under docs/specs and follow code ownership. Shared rules, Domain functions, Application, Infrastructure and Interfaces have explicit entrypoints. Operational guides link to these designs instead of duplicating them. Schemas retain their versioned identities. Planned capabilities are identified as such, and old handoffs are summarized separately.

</details>
