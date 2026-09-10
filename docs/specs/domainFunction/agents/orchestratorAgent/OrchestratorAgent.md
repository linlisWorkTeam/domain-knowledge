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
| IO-17 | Orchestrator 职责与输入输出 | 已实现，待业务验收 | 2026-09-10 用户确认 Orchestrator 负责确定本轮要处理的任务。输入为本次业务目标、代码仓模块概况、项目配置及已有任务进度；输出本轮任务计划，说明处理哪些模块、交给哪个 Agent、使用哪些输入材料。 |

## 当前输入输出

IO-17 当前实现有界的模块选择：场景可提供最多 32 个授权候选模块，每个 Run 依据目标选择一个模块并保持到结束。未提供候选列表时按原单模块输入执行。输入为 policyRef、moduleRefs、businessGoalRef、projectConfigurationRef、progressRef。模块概况包括各模块说明、源码与接口路径和项目配置，选中后以同一提交冻结源码快照；业务目标来自场景 businessGoal（未填时使用模块知识生成与测评目标）；进度包含本轮序号、Run 状态和上一轮质量报告。

模型输出 strategy、iteration、tasks。tasks 中五类外层角色 DocGen、TestGen、Code、Check、Review 各一次，每项含 agentType、moduleId、materials。Domain 拒绝未授权模块、同一批次混用模块、错轮次、重复/缺失角色和角色越权材料。

| 角色 | 本轮材料槽位 |
| --- | --- |
| DocGen | source、interfaces |
| TestGen | source、interfaces、testPolicy |
| Code | knowledge、projectConfiguration |
| Check | source、generatedCode、comparisonRules |
| Review | knowledge、evaluation、comparison |

尚未生成的工件用业务材料槽位描述，Application 在上游完成后绑定真实引用。纠正、历史记录等迭代补充材料由各角色的明确契约提供。Application 按计划核验每个角色任务，结果信封保留模块及材料槽位，固定五类节点和依赖不接受模型改写；DocWorker 由 DocGen 内部调用，测试复用由框架按源码内容处理。

## 验证与边界

角色测试覆盖非法模块、材料泄漏、不完整计划及错轮次。完整 C++ 流程覆盖两轮执行与固定拓扑，原生 DSH SDK 受控请求覆盖计划进入生产 Adapter。Application 消费模型选中的模块，绑定 Run 归属和后续任务，补充材料仍按各角色契约确定。当前一次 Run 处理一个模块，不声称实现跨模块自动发现或任意 DAG 编排。

## 本轮缺口修复验收

业务规划依据目标、明确模块概览及进展选择本批次模块和任务输入。Application 消费选定模块并绑定任务材料；固定拓扑及独立测评/发布门禁不可跳过。
