<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：ReviewAgent 的职责、输入输出与确认状态。
-->
# ReviewAgent：评测复核与纠正

代码位置：[执行入口](../../../../../src/domain/agents/reviewAgent/ReviewAgent.ts)、[输入输出契约](../../../../../src/domain/agents/reviewAgent/ReviewAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/reviewAgent/ReviewAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/reviewAgent/ReviewAgent.test.ts)、[独立样例](../../../../../src/domain/agents/reviewAgent/examples/ReviewAgentSample.json)。

角色 ID：`review`。共同执行、失败和交接协议见 [Agents](../Agents.md)。

## 已确认的证据输入（待实现）

2026-09-10，[IO-15](../checkAgent/CheckAgent.md) 已确认：Review 在评测之后同时读取 Check 的比较结果及差异依据、评测执行器的测试结果，用于分析知识卡片需要修订的位置。两类结果需要真实进入 Review 的可见材料，不能仅保存引用或在提示词中声称已有证据。具体机器字段与权限范围仍待细化，修订意见的业务输出按 IO-16 确认。

## 输出确认记录

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-16 | Review 修订意见及交接 | 已确认（待实现） | 2026-09-10 用户确认 Review 输出知识卡片修订意见列表，每项包含修订位置、问题说明、依据和修订建议；交给 DocGen 修改知识卡片，没有发现需要修订的问题时返回空列表。 |

## 目标输出（已确认，待实现）

| 内容 | 约定 |
| --- | --- |
| 修订位置 | 指出哪张知识卡片、哪个段落 |
| 问题说明 | 说明知识缺失、错误或歧义 |
| 依据 | 对应的代码差异或失败测试，来源于本轮可信输入 |
| 修订建议 | 说明需要补充或纠正什么 |

Review 输出修订意见列表，由 Application 将意见及原知识卡片交给 DocGen 执行修改；未发现需要修订的问题时返回空列表。空列表只表示没有提出修订意见，不替代测试结果或 Gate 的通过判定。具体机器字段、位置标识及多项意见与结果信封的映射在实现时明确。

[Knowledge IO-19](../../knowledge/Knowledge.md) 已确认人工治理的材料范围：Review 提供问题段落、说明、建议及失败用例或代码差异依据，由 Application 组织精简治理清单，必要时附上一版对比；不要求人工遍历全部文档版本和完整临时代码。Review 应从框架显式提供的历史证据中提炼有价值的尝试及退化，避免重复修复；不能自行查询全部历史或扩大其他角色的读取范围。完整相关证据暂存在后台，需要时展开，治理完成后按保留政策处理。治理清单及历史材料交接的机器契约待实现，Review 不直接删除工件。

## 职责与当前输入输出

依据知识与评测证据定位知识问题，提出纠正意见。以下描述当前实现；Check 与测试结果的联合输入方向已按 IO-15、修订意见输出已按 IO-16 确认，完整机器契约待落实。

| 边界 | 当前实现 |
| --- | --- |
| 输入 | 知识 `knowledgeRef`、评测报告 `evaluationReportRef`、判据 `criteriaRef`；可选历史纠正 `previousCorrectionRefs` |
| 模型输出 | `blocking`、`recommendation`（PASS 或 ITERATE）、一项 `correction` 或 null |
| correction 内容 | `correctionId`、`knowledgePath`、`criterion`、`risk` |
| 交接输出 | `resultKind: attribution`；统一编号并绑定可信评测引用的 `corrections` 数组，以及 `unresolvedRisks` |
| 失败与限制 | 报告阻塞但无纠正项时记录未解决风险；模型不能自行捏造评测引用，不能直接刷新或发布知识 |

## 待确认与验收重点

对应 S2-07：按 IO-15 补齐 Check findings 与评测证据的联合输入，按 IO-16 实现带位置、问题、依据和建议的修订意见列表及无意见时的空列表。当前模型仅返回一项 correction 或 null，信封虽使用 corrections 数组，仍不等于目标列表和字段已经支持。目前未单独绑定 Check findings 明细，不能把提示词要求或结构迁移写成完整归因能力。

知识修订由 [DocGenAgent](../docGenAgent/DocGenAgent.md) 接收 Application 显式提供的旧正文与纠正材料后执行；跨角色连接见 [Workflow](../../workflow/Workflow.md)。

开发步骤与证据统一记录在 [Status](../../../../Status.md)，独立运行方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。
