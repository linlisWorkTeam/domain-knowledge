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

## 执行规则

1. 每次 Run 只选一个模块，当前最多接收 32 个授权候选；未传候选列表时使用原单模块场景。
2. 五类下游任务各出现一次，不漏派、不重复，也不把不同模块混进同一批次。
3. DocWorker 由 DocGen 内部安排；测试是否复用由框架根据源码判断。
4. 计划通过校验后，框架将模块、同一提交的源码快照和任务材料绑定到 Run。后续轮次沿用该选择。

选了未授权模块、填错轮次、遗漏角色或分配越权材料时，计划被拒绝，不照着错误计划继续运行。最大轮次由框架检查，不能由模型要求额外增加。

## 目前做到哪

IO-17 已实现：业务输入、模块选择、任务计划和材料范围校验都已接入流程。角色测试覆盖非法模块、错轮次、不完整计划和越权材料，完整回归验证选中的模块确实成为处理和发布对象。

真实模型能否选出最有价值的模块，仍需业务验收。当前没有跨模块自动发现或任意任务图编排。

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
