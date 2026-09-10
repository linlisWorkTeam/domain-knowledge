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

IO-17 已实现当前单模块流程。输入为 policyRef、moduleRefs、businessGoalRef、projectConfigurationRef、progressRef。模块概况来自冻结场景和源码快照；业务目标来自场景 businessGoal（未填时使用模块知识生成与测评目标）；进度包含本轮序号、Run 状态和上一轮质量报告。

模型输出 strategy、iteration、tasks。tasks 中五类外层角色 DocGen、TestGen、Code、Check、Review 各一次，每项含 agentType、moduleId、materials。Domain 拒绝跨模块、错轮次、重复/缺失角色和角色越权材料。

| 角色 | 本轮材料槽位 |
| --- | --- |
| DocGen | source、interfaces |
| TestGen | source、interfaces、testPolicy |
| Code | knowledge、projectConfiguration |
| Check | source、generatedCode、comparisonRules |
| Review | knowledge、evaluation、comparison |

尚未生成的工件用业务材料槽位描述，Application 在上游完成后绑定真实引用。纠正、历史记录等迭代补充材料由各角色的明确契约提供。结果信封保留模块及材料槽位，固定五类节点和依赖不接受模型改写；DocWorker 由 DocGen 内部调用，测试复用由框架按源码内容处理。

## 验证与边界

角色测试覆盖非法模块、材料泄漏、不完整计划及错轮次。完整 C++ 流程覆盖两轮执行与固定拓扑，原生 DSH SDK 受控请求覆盖计划进入生产 Adapter。当前一次 Run 处理显式选定的单模块，不声称实现跨模块自动发现或任意 DAG 编排。
