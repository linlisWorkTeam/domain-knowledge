<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：OrchestratorAgent 的职责、输入输出与确认状态。
-->
# OrchestratorAgent：业务计划

代码位置：[执行入口](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgent.ts)、[输入输出契约](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgent.test.ts)、[独立样例](../../../../../src/domain/agents/orchestratorAgent/examples/OrchestratorAgentSample.json)。

角色 ID：`orchestrator`。共同执行、失败和交接协议见 [Agents](../Agents.md)。

## 职责与当前输入输出

依据策略和模块材料形成当前轮业务计划。以下描述当前实现，最终业务输入输出仍待逐项确认。

| 边界 | 当前实现 |
| --- | --- |
| 输入 | 策略 `policyRef`、模块材料 `moduleRefs`；载荷支持可选的上一轮报告 `latestReportRef` |
| 模型输出 | `strategy`、`iteration`、`parallel` |
| 交接输出 | `resultKind: plan`，包含固定六类下游角色节点、依赖、资源声明和预期工件 |
| 权限与限制 | 模型输出经校验后，执行入口构造固定任务计划；不能用模型的 parallel 等字段改写工作流连接或决定 Gate PASS |

## 待确认与验收重点

对应 S2-01：确认计划所需材料、任务输出及材料不足时的处理。验收应覆盖固定节点与依赖、非法模型输出和失败处理；跨角色连接以 [Workflow](../../services/workflow/Workflow.md) 为准。

开发步骤与证据统一记录在 [Status](../../../../Status.md)，独立运行方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。
