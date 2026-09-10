<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：CheckAgent 的职责、输入输出与确认状态。
-->
# CheckAgent：只读检查

代码位置：[执行入口](../../../../../src/domain/agents/checkAgent/CheckAgent.ts)、[输入输出契约](../../../../../src/domain/agents/checkAgent/CheckAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/checkAgent/CheckAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/checkAgent/CheckAgent.test.ts)、[独立样例](../../../../../src/domain/agents/checkAgent/examples/CheckAgentSample.json)。

角色 ID：`check`。共同执行、失败和交接协议见 [Agents](../Agents.md)。

## 输入输出确认记录

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-14 | CheckAgent 输入与比较依据 | 输入范围已确认；规则与算法待论文调研 | 2026-09-10 用户确认输入为原始源码、CodeAgent 生成的临时代码和比较规则。原始源码作为比较基准，临时代码作为待检查对象，规则规定比较范围及关注的差异；具体规则和相似度算法待论文调研后确定。 |
| IO-15 | Check 输出及评测、Review 的结果交接 | 已确认（待实现） | 2026-09-10 用户确认 Check 输出比较结果及差异依据，评测负责输出测试结果，之后 Review 同时读取两者，分析知识卡片需要修订的位置。保持 Check 后进入评测、再到 Review 的流程，不将差异结果误作测试执行指令。 |

## 目标输入（已确认，待实现）

| 输入 | 用途 |
| --- | --- |
| 原始源码 | 比较基准 |
| CodeAgent 生成的临时代码 | 待检查对象 |
| 比较规则 | 规定比较范围及关注的差异，具体内容待论文调研 |

本次确认输入范围，不预设相似度算法、分数尺度、权重或通过阈值。源码及临时代码的材料传递方式、文件读取白名单、规则配置字段和输出报告结构仍待细化。CheckAgent 的比较材料授权不改变 CodeAgent 禁止读取原始源码的边界。

## 目标输出与下游用途（已确认，待实现）

Check 输出机器可读取的比较结果及差异依据，供后续 Review 结合测试结果分析知识问题；具体报告字段、比较规则及相似度算法尚未确定。评测执行器负责运行测试，不依靠差异报告决定怎样执行测试。节点顺序和证据传递见 [Workflow](../../workflow/Workflow.md)。

当前评测节点将 Check 结果引用作为输入依赖保存，测试执行未使用差异明细；最终 Gate 判定使用 check.blocking，Review 尚未加载 Check 明细。实现 IO-15 时需补齐可信材料加载、Review 契约与证据引用，不能只保存报告而不消费其内容。

## 职责与当前输入输出

根据差异与判据输出只读检查意见。以下描述当前实现；目标输入范围已按 IO-14、输出及下游用途按 IO-15 确认，尚未同步改入角色契约与材料加载。

| 边界 | 当前实现 |
| --- | --- |
| 输入 | 差异 `diffRef`、判据 `criteriaRef`、公开接口 `publicInterfaceRefs` |
| 模型输出 | `blocking`、字符串列表 `findings`、检查范围 `scope` |
| 交接输出 | `resultKind: findings`；每项带 findingId、severity、criterionId、evidenceLocation、message |
| 转换规则 | 严重程度按 blocking 统一映射为 BLOCKER 或 INFO；criterionId 当前固定为 deterministic-check，证据位置使用 scope 第一项或工作流角色位置 |
| 权限与限制 | 只给检查意见，不修代码；模型意见不能冒充确定性测试执行事实 |

## 待确认与验收重点

对应 S2-06：按 IO-14 落实两份源码与比较规则的输入，按 IO-15 补齐比较结果及差异依据到 Review 的交接；比较规则及相似度算法待论文调研后确定。验收关注 findings 可追溯性、检查范围和只读边界；当前固定判据及统一证据位置不能视为完整归因或已确定的相似度算法。

开发步骤与证据统一记录在 [Status](../../../../Status.md)，独立运行方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。
