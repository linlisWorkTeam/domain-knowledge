<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：OrchestratorAgent 的职责、输入输出与确认状态。
-->
# OrchestratorAgent：业务计划

代码位置：[执行入口](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgent.ts)、[输入输出契约](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgent.test.ts)、[独立样例](../../../../../src/domain/agents/orchestratorAgent/examples/OrchestratorAgentSample.json)。

角色 ID：`orchestrator`。共同执行、失败和交接协议见 [Agents](../Agents.md)。

## 输入输出确认记录

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-17 | Orchestrator 职责与输入输出 | 已确认（待实现） | 2026-09-10 用户确认 Orchestrator 负责确定本轮要处理的任务。输入为本次业务目标、代码仓模块概况、项目配置及已有任务进度；输出本轮任务计划，说明处理哪些模块、交给哪个 Agent、使用哪些输入材料。 |

## 目标输入输出（已确认，待实现）

| 边界 | 约定 |
| --- | --- |
| 输入 | 本次业务目标、代码仓的模块概况、项目配置、已有任务进度 |
| 输出 | 本轮任务计划，包含要处理的模块、承接 Agent 和所用输入材料 |
| 执行分工 | 实际执行顺序由工作流负责；DocGen 内部 Worker 拆分由 DocGen 负责；已有测试按输入源代码是否变化的规则复用 |

任务计划不改变固定工作流连接，也不替代既有 Gate 判定。模块概况的来源、项目配置的必要字段、任务状态读取、机器字段与计划校验在实现时细化；不因本次确认扩大其他 Agent 的材料权限。

## 职责与当前输入输出

依据策略和模块材料形成当前轮业务计划。以下描述当前实现；目标已按 IO-17 确认，尚未完整落实到契约与执行接线。

| 边界 | 当前实现 |
| --- | --- |
| 输入 | 策略 `policyRef`、模块材料 `moduleRefs`；载荷支持可选的上一轮报告 `latestReportRef` |
| 模型输出 | `strategy`、`iteration`、`parallel` |
| 交接输出 | `resultKind: plan`，包含固定五类外层下游角色节点（DocGen、TestGen、Code、Check、Review）及其依赖、资源声明和预期工件；DocWorker 由 DocGen 内部调用 |
| 权限与限制 | 模型输出经校验后，执行入口构造固定任务计划；不能用模型的 parallel 等字段改写工作流连接或决定 Gate PASS |

## 待确认与验收重点

对应 S2-01：按 IO-17 落实输入与本轮任务计划，继续细化模块概况来源、任务材料绑定及材料不足时的处理。当前固定节点计划不等于已经支持目标中的按模块任务规划。验收应覆盖计划与受信模块材料一致、固定节点与依赖、非法模型输出和失败处理；跨角色连接以 [Workflow](../../workflow/Workflow.md) 为准。

开发步骤与证据统一记录在 [Status](../../../../Status.md)，独立运行方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。
