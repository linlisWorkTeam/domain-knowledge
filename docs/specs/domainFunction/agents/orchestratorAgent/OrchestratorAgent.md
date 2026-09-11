<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：OrchestratorAgent 的职责、输入输出与确认状态。
-->
# OrchestratorAgent

## 1. 职责与边界

Orchestrator 根据业务目标和已有进度，从授权模块中选一个，说明选择原因，并安排本轮下游任务及材料。

执行顺序由工作流固定。Orchestrator 不能改写任务图、跳过评测或批准发布；DocWorker 由 DocGen 内部安排，测试复用由框架根据源码判断。

## 2. 输入与输出

输入包括业务目标、候选模块概况、项目配置、治理策略、当前轮次及上一轮进度。模块概况描述源码和接口路径，不开放整个仓库；没有业务目标时使用模块知识生成与测评目标。

输出是一份计划，包含选择依据、本轮编号及五类下游任务。每项任务声明角色、模块和材料槽位：

| 下游角色 | 可分配材料 |
| --- | --- |
| DocGen | 源码、公开接口 |
| TestGen | 源码、公开接口、测试策略 |
| Code | 候选知识、编写配置 |
| Check | 原源码、生成代码、比较规则 |
| Review | 候选知识、评测报告、比较报告 |

尚未生成的文档和报告先分配材料类型，上游完成后框架再填入真实内容。历史、纠正意见及质量反馈由对应角色契约补充。

## 3. 工作流程

### 首次选择模块

框架加载业务目标和授权候选，当前最多支持 32 个候选；未传候选列表时沿用单模块场景。Orchestrator 选择一个模块，说明它与目标的关系，并为五类下游角色各安排一次任务。

例如，候选包含价格计算与日志输出，目标是补齐价格规则文档。选择价格模块后，框架校验计划，将该模块、同一提交的源码快照和任务材料保存到 Run。

### 后续轮次安排

下一轮继续处理已选模块，不能从价格模块转去日志模块。Orchestrator 根据已有进度给出本轮计划，框架核对轮次、角色及材料范围，再按固定流程执行。

### 轮次结束与中断恢复

是否继续由 Application 和 Gate 决定。进入下一轮前，框架检查最大轮次；预算允许时 ITERATE，否则 STOPPED，模型要求多跑一轮不能改变预算。

框架按 Run、本轮和路由执行键保存决定。若数据库已提交而图检查点尚未保存就中断，恢复时返回既有决定并补齐状态迁移，不根据已推进的 Run 重新判定，也不重复消耗轮次。

## 4. 关键约束与失败处理

一次 Run 只处理一个模块。五类下游任务必须各出现一次，不漏派、不重复，也不能混入其他模块。选择未授权模块、填错轮次、计划不完整或分配越权材料时拒绝计划。

角色不开放工具，readablePaths 为空。Prompt 要求说明选择理由、五类任务和授权材料；实际材料由框架校验后加载，材料槽位不能扩大权限。

同一路由执行键的输入发生变化时，恢复请求被拒绝；合法重放不应因 Run 已进入 ITERATING 而再次尝试记录评测。共同失败规则见 [Agents](../Agents.md)，固定拓扑及恢复约定见 [Workflow](../../workflow/Workflow.md)。

## 5. 验收场景

- **选择真正影响处理对象。** 授权价格与日志模块，模型选择价格后，实际源码、生成文档和发布对象都必须属于价格模块；后续轮次沿用该选择。
- **拒绝非法计划。** 换成未授权模块、填错轮次、漏掉或重复角色、分配越权材料，计划均不得执行。
- **遵守轮次预算。** 最大轮次为 1，质量失败或 Gate 拒绝后停止；为 2 时，允许第二轮修订并通过。
- **恢复不改变结论。** 分别在质量拒绝、Gate ITERATE 和 Gate STOPPED 的提交与检查点之间模拟中断，恢复结论和轮次一致；同键改变输入时拒绝。

模块选择、计划校验、轮次限制及路由恢复已有角色和受控流程回归。恢复验收中的状态迁移由框架完成，不依赖模型再次作出相同选择。

## 6. 未实现与待定事项

真实模型能否选出最符合业务优先级的模块，尚未验收。当前没有跨模块自动发现或任意任务图编排，不能从本轮任务计划推导出这些能力。

## 7. 实现及测试索引

角色 ID：`orchestrator`。输入引用为 policyRef、moduleRefs、businessGoalRef、projectConfigurationRef、progressRef；输出为 strategy、iteration、tasks，每项 task 包含 agentType、moduleId、materials。完整定义见 Contract。

规则对应：模块选择及材料计划为 IO-17；框架轮次限制为 AC-AGENT-105，持久化路由恢复为 AC-AGENT-105-R1。

- 实际模块绑定及发布对象：[AgentSpecRegression.test.mjs](../../../../../tests/integration/AgentSpecRegression.test.mjs)。
- 轮次上限：[WorkflowIterationLimit.test.ts](../../../../../tests/integration/WorkflowIterationLimit.test.ts)。
- 提交与检查点之间的恢复：[WorkflowRouterReplay.test.ts](../../../../../tests/integration/WorkflowRouterReplay.test.ts)。

代码位置：[执行入口](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgent.ts)、[输入输出契约](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/orchestratorAgent/OrchestratorAgent.test.ts)、[独立样例](../../../../../src/domain/agents/orchestratorAgent/examples/OrchestratorAgentSample.json)。
