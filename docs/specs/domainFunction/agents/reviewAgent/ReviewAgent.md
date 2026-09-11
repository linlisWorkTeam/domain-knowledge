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

## 哪些输出会被拒绝

位置不在当前文档中、定位有歧义、意见编号重复或依据不合法，都会拒绝。依据只能选本轮提供的比较/评测报告，框架再填入真实引用；模型不能指定另一个 Run 的证据。

Review 可以报告阻塞问题，但不能自行批准发布。即使没有意见，系统也仍按实际评测和 Gate 决定后续；如果报告阻塞却没有给出意见，框架会保留未解决风险。

## 停止后交给人什么

停止不能只留一句“失败”。框架要保存问题、下一步建议和可打开的证据；有 Review 历史时一并保留对比总结。重试或恢复不能重复创建同一交接。

测试候选失败、文档拆分提案、文档质量耗尽轮次等情况，可能还没到 Review。此时由 Application 根据已有事实写摘要，不为了交接而强行调用 Review。

## 目前做到哪

IO-15、IO-16 的报告输入、修订意见、历史总结和可信引用已实现。AC-AGENT-106 已覆盖测试校验/修复失败、文档提案、质量耗尽、Gate 停止四类交接；普通修订、空意见、非法位置和取消也有角色测试。

完整受控流程验证了“测试失败 → Review 意见 → DocGen 修订 → 再测评”。它采用预设回答，不能证明真实模型总能找准原因。自动清理和完整治理展示仍按 [Knowledge IO-19](../../knowledge/Knowledge.md) 保留为未完成能力。

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
