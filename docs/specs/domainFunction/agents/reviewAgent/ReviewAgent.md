<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：ReviewAgent 的职责、输入输出与确认状态。
-->
# ReviewAgent：评测复核与纠正

代码位置：[执行入口](../../../../../src/domain/agents/reviewAgent/ReviewAgent.ts)、[输入输出契约](../../../../../src/domain/agents/reviewAgent/ReviewAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/reviewAgent/ReviewAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/reviewAgent/ReviewAgent.test.ts)、[独立样例](../../../../../src/domain/agents/reviewAgent/examples/ReviewAgentSample.json)。

角色 ID：`review`。共同执行、失败和交接协议见 [Agents](../Agents.md)。

## 职责与当前输入输出

依据知识与评测证据定位知识问题，提出纠正意见。以下描述当前实现，最终业务输入输出仍待逐项确认。

| 边界 | 当前实现 |
| --- | --- |
| 输入 | 知识 `knowledgeRef`、评测报告 `evaluationReportRef`、判据 `criteriaRef`；可选历史纠正 `previousCorrectionRefs` |
| 模型输出 | `blocking`、`recommendation`（PASS 或 ITERATE）、一项 `correction` 或 null |
| correction 内容 | `correctionId`、`knowledgePath`、`criterion`、`risk` |
| 交接输出 | `resultKind: attribution`；统一编号并绑定可信评测引用的 `corrections` 数组，以及 `unresolvedRisks` |
| 失败与限制 | 报告阻塞但无纠正项时记录未解决风险；模型不能自行捏造评测引用，不能直接刷新或发布知识 |

## 待确认与验收重点

对应 S2-07：确认评测证据、Check findings 接入与归因、Correction 及无须修订时的输出。目前未单独绑定 Check findings 明细，不能把提示词要求或结构迁移写成完整归因能力。

知识修订由 [DocGenAgent](../docGenAgent/DocGenAgent.md) 接收 Application 显式提供的旧正文与纠正材料后执行；跨角色连接见 [Workflow](../../services/workflow/Workflow.md)。

开发步骤与证据统一记录在 [Status](../../../../Status.md)，独立运行方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。
