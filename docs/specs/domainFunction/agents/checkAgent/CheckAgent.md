<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：CheckAgent 的职责、输入输出与确认状态。
-->
# CheckAgent：只读检查

代码位置：[执行入口](../../../../../src/domain/agents/checkAgent/CheckAgent.ts)、[输入输出契约](../../../../../src/domain/agents/checkAgent/CheckAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/checkAgent/CheckAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/checkAgent/CheckAgent.test.ts)、[独立样例](../../../../../src/domain/agents/checkAgent/examples/CheckAgentSample.json)。

角色 ID：`check`。共同执行、失败和交接协议见 [Agents](../Agents.md)。

## 职责与当前输入输出

根据差异与判据输出只读检查意见。以下描述当前实现，最终业务输入输出仍待逐项确认。

| 边界 | 当前实现 |
| --- | --- |
| 输入 | 差异 `diffRef`、判据 `criteriaRef`、公开接口 `publicInterfaceRefs` |
| 模型输出 | `blocking`、字符串列表 `findings`、检查范围 `scope` |
| 交接输出 | `resultKind: findings`；每项带 findingId、severity、criterionId、evidenceLocation、message |
| 转换规则 | 严重程度按 blocking 统一映射为 BLOCKER 或 INFO；criterionId 当前固定为 deterministic-check，证据位置使用 scope 第一项或工作流角色位置 |
| 权限与限制 | 只给检查意见，不修代码；模型意见不能冒充确定性测试执行事实 |

## 待确认与验收重点

对应 S2-06：确认差异材料、检查判据、相似度检查的分工及结果去向。验收关注 findings 可追溯性、检查范围和只读边界；当前固定判据及统一证据位置不能视为完整归因。

开发步骤与证据统一记录在 [Status](../../../../Status.md)，独立运行方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。
