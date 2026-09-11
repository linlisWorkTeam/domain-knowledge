<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：OrchestratorAgent 的职责、输入输出与确认状态。
-->
# OrchestratorAgent：决定本轮先做哪个模块

Orchestrator 根据业务目标和已有进度，从允许处理的模块中选一个，说明选择原因，再列出本轮各 Agent 需要的材料。执行顺序由工作流固定，模型不能跳过评测或批准发布。

## 接收什么，交出什么

输入包括业务目标、候选模块说明、项目配置、当前轮次和上一轮进度。模块概况说明源码、接口路径及相关配置，不给模型任意浏览整个仓库的权限。

输出是一份任务计划：本次选哪个模块，为什么选它，DocGen、TestGen、Code、Check、Review 分别用哪些材料。暂时还没生成的文档或报告，先按材料类型分配，等上游完成再由框架填入真实内容。

例如，授权列表有“价格计算”和“日志输出”两个模块，目标是补齐价格规则文档。Orchestrator 可以选择价格计算，并解释它与目标的关系。选择被框架保存后，下一轮仍处理价格计算，不能转去日志模块。

## 开发规则与验收

### IO-17：选定模块并交付完整计划

| 项目 | 约定 |
| --- | --- |
| 前提 | 业务目标、授权模块、配置和本轮进度已加载；当前最多 32 个候选。 |
| 行为 | Orchestrator 选择一个授权模块，说明原因；为 DocGen、TestGen、Code、Check、Review 各安排一次任务，材料不得越权。框架保存模块及固定提交，后续轮次沿用。 |
| 结果 | 得到本轮五项任务计划。非法模块、错轮次、缺项、重复或越权材料均拒绝，不执行错误计划；DocWorker 仍由 DocGen 管理。 |
| 验收 | 授权价格与日志两个模块，选价格后，实际源码、文档及发布对象都必须是价格；改成未授权模块或漏一类任务须拒绝。见 [角色测试](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgent.test.ts) 和 [AgentSpecRegression.test.mjs](../../../../../tests/integration/AgentSpecRegression.test.mjs)。 |
| 状态 | 已实现，有角色及流程回归；真实模型选择是否符合业务优先级尚未验收。 |

### AC-AGENT-105 / AC-AGENT-105-R1：轮次和恢复由框架保证

| 项目 | 约定 |
| --- | --- |
| 前提 | 工作流已配置最大轮次；同一路由可能在数据库提交后、图检查点保存前中断。 |
| 行为 | Application 在进入下一轮前检查预算，按 Run、本轮和路由执行键持久化决定。恢复时返回已保存决定并补齐状态迁移，不按已经推进的 Run 状态重新判定。 |
| 结果 | 预算允许时进入下一轮，否则 STOPPED。重放不额外消耗轮次、不改变原决定、不因已进入 ITERATING 而报状态错误；同键但输入改变时拒绝恢复。 |
| 验收 | 最大轮次为 1 时质量失败或 Gate 拒绝必须停止；为 2 时允许第二轮通过。分别在质量拒绝、Gate ITERATE、Gate STOPPED 的提交与检查点之间模拟中断，恢复结论须一致，改变重放输入须拒绝。见 [WorkflowIterationLimit.test.ts](../../../../../tests/integration/WorkflowIterationLimit.test.ts)、[WorkflowRouterReplay.test.ts](../../../../../tests/integration/WorkflowRouterReplay.test.ts)。 |
| 状态 | 已实现，有受控恢复回归；这是框架责任，不能靠 Orchestrator Prompt 保证。 |

当前不提供跨模块自动发现或任意任务图编排；不得从模型计划推导出改变固定工作流的权限。

<details>
<summary>开发对照：字段、材料和提示词</summary>

角色 ID 为 `orchestrator`，不开放工具，`readablePaths` 为空。输入引用为 policyRef、moduleRefs、businessGoalRef、projectConfigurationRef、progressRef。未提供 businessGoal 时使用模块知识生成与测评目标。

模型返回 strategy、iteration、tasks；每个 task 包含 agentType、moduleId、materials。

| 下游角色 | 可分配的材料槽位 |
| --- | --- |
| DocGen | source、interfaces |
| TestGen | source、interfaces、testPolicy |
| Code | knowledge、projectConfiguration |
| Check | source、generatedCode、comparisonRules |
| Review | knowledge、evaluation、comparison |

历史、纠正意见和质量反馈由各角色契约补充。框架核对任务后才加载材料，模型不能用槽位扩大权限或改动固定拓扑。

Prompt 要求说明模块选择依据、五类任务及授权材料；禁止安排 DocWorker 或决定 Gate。共同执行和失败规则见 [Agents](../Agents.md)，轮次和恢复见 [Workflow](../../workflow/Workflow.md)。

</details>

## 代码与样例

代码位置：[执行入口](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgent.ts)、[输入输出契约](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgent.test.ts)、[独立样例](../../../../../src/domain/agents/orchestratorAgent/examples/OrchestratorAgentSample.json)。
