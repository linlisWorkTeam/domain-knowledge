<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：ReviewAgent 的职责、输入输出与确认状态。
-->
# ReviewAgent：根据失败证据，告诉 DocGen 文档该改哪里

Review 阅读本轮文档、Check 的差异报告和实际评测报告，找出需要修订的文档段落。它交付修改意见，由 DocGen 执笔。

## 它拿到什么

框架把报告正文交给 Review，而不只是告诉它“有一份报告”。有前几轮记录时，还会给出那些轮次的文档、比较结果、测试结果和修改意见，方便判断哪些尝试有效、哪些引入了回归。

Review 不读取原始仓库，也不能自行查询未授权历史。需要的证据由框架按本次任务范围提供。

## 一条有用的意见长什么样

例如，文档“返回值”一节写的是 3；Check 指出原实现返回 4，重建实现返回 3；测试也证实重建结果不符。Review 应说明：

> 修改“返回值”一节。当前写成 3，与比较报告和测试结果矛盾；建议改为 4，并说明适用条件。依据是本轮的代码差异及失败测试。

每条意见必须有现存位置、问题、建议和依据。没有需要修订的问题就返回空列表，不能为了凑格式编造问题。

有历史时还要总结哪些尝试有用、是否出现回归及下一步建议。当前只是要求这些信息完整且引用有效，真实模型归因是否准确仍需验收。

## 开发规则与验收

### IO-15 / IO-16：用真实报告提出可定位的修改意见

| 项目 | 约定 |
| --- | --- |
| 前提 | 本轮知识、比较报告和评测报告正文已加载；历史存在时框架提供授权的历轮材料。 |
| 行为 | Review 按报告给出问题、建议和文档位置，有历史时补充总结。框架与 DocGen 使用同一定位规则，核对意见编号及依据，并把所选报告绑定为真实证据引用。 |
| 结果 | 合法意见交下一轮 DocGen；缺必需材料在调用前失败，不存在/歧义的位置、重复意见编号或非法依据在输出校验时拒绝。不得引用其他 Run 的证据。 |
| 验收 | 给“返回值”章节及返回错误报告，应能生成可交给 DocGen 的意见；伪造位置或证据须拒绝，多条意见分别绑定所选真实报告。见 [角色测试](../../../../../src/domain/agents/reviewAgent/ReviewAgent.test.ts) 和 [AgentSpecRegression.test.mjs](../../../../../tests/integration/AgentSpecRegression.test.mjs)。 |
| 状态 | 输入、定位、证据绑定和历史总结结构已实现；真实模型归因与历史分析质量尚未验收。 |

### IO-16：没有修改意见也不能代替 Gate

| 项目 | 约定 |
| --- | --- |
| 前提 | Review 已阅读实际报告，可能未发现文档问题。 |
| 行为 | Review 可以返回空意见；若 blocking 为真却没有意见，框架保留未解决风险。发布与继续决策仍读取实际评测和阻塞条件。 |
| 结果 | 空意见是合法结果，不等于知识通过；Review 本身既不改文档，也不发布知识。 |
| 验收 | 空意见须通过角色结构校验；测试失败时即使 Review 不阻塞，也不能获得发布结果。正常受控流程须经过独立评测和 Gate 后才发布。见 [角色测试](../../../../../src/domain/agents/reviewAgent/ReviewAgent.test.ts) 、[Gate 单元测试](../../../../../tests/unit/Domain.test.ts) 和 [AgentRevisionFlow.test.ts](../../../../../tests/acceptance/AgentRevisionFlow.test.ts)。 |
| 状态 | 已实现，有角色及受控流程回归；不以意见数量衡量 Review 质量。 |

### AC-AGENT-106：停止时保存可操作的交接

| 项目 | 约定 |
| --- | --- |
| 前提 | 测试校验/修复失败、文档提案、质量耗尽或 Gate STOPPED 导致流程停止。 |
| 行为 | Application 根据已发生的事实保存摘要、下一步建议和可打开的证据，有 Review 历史则保留总结；按交接键去重。尚未到 Review 的分支无需强行调用模型。 |
| 结果 | 得到可读取的 CAS 交接和事件；恢复不重复创建。早期测试失败不得直接归因为知识错误。 |
| 验收 | 逐一触发四类停止，核对原因、建议、证据正文及交接引用；重复路由后仍只有同一交接。见 [StoppedHandoff.test.ts](../../../../../tests/integration/StoppedHandoff.test.ts)。 |
| 状态 | 已实现，有四类停止回归；这是 Application 的保证，不依赖 Review 一定已执行。 |

完整受控流程验证了“测试失败 → Review 意见 → DocGen 修订 → 再测评”，预设回答不能证明真实模型总能找准原因。自动清理和完整治理展示仍按 [Knowledge IO-19](../../knowledge/Knowledge.md) 保留为未完成能力。

<details>
<summary>开发对照：意见字段、证据和提示词</summary>

角色 ID 为 `review`，`readablePaths: []`。必需输入为 knowledgeRef、evaluationReportRef、comparisonReportRef；previousCorrectionRefs 可引用框架按轮次整理的历史正文包。

输出为 blocking、corrections；有历史材料时必需 historySummary。每条 correction 包含 correctionId、knowledgePath、problem、suggestion、evidence。evidence 选择 evaluation、comparison 或二者；knowledgePath 通过与 DocGen 共用的定位解析校验，支持当前文档路径、唯一章节或唯一原文所在章节。

框架将 correctionId 规范为 COR 数字编号，将 problem 与 suggestion 合并为 criterion，将 problem 写入 risk，并把依据映射为受信 evidenceRefs。下一轮提供上一版文档和这些意见，不能把模型输出的任意工件引用直接交给 DocGen。

STOPPED 保存 ReviewHandoffPrepared 事件及 CAS 交接，包含 summary、historySummary、evidenceRefs、handoffRef，并按交接键去重。验收入口 `tests/integration/StoppedHandoff.test.ts` 检查四类摘要可操作、证据可读、重复路由不重复交接；早期测试失败不得直接归因为知识错误。

Prompt 要求按实际报告定位问题，结合已有历史总结，仅引用授权轮次和证据，最终通过由 Gate 判断。共同执行规则见 [Agents](../Agents.md)，版本及证据见 [报告](../../../../reports/AgentSpecRepairAndE2E.md)。

</details>

## 代码与样例

代码位置：[执行入口](../../../../../src/domain/agents/reviewAgent/ReviewAgent.ts)、[输入输出契约](../../../../../src/domain/agents/reviewAgent/ReviewAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/reviewAgent/ReviewAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/reviewAgent/ReviewAgent.test.ts)、[独立样例](../../../../../src/domain/agents/reviewAgent/examples/ReviewAgentSample.json)。
