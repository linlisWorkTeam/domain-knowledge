<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：ReviewAgent 的职责、输入输出与确认状态。
-->
# ReviewAgent

## 1. 职责与边界

Review 阅读本轮知识文档、Check 比较报告和实际评测报告，找出需要修订的文档问题，向 DocGen 提供修改位置、原因和建议。

Review 不读取原始仓库，不自行查询未授权历史，也不直接修改文档或批准发布。最终判定由 Gate 完成。

## 2. 输入与输出

输入包含本轮知识及两类报告的正文，不能只给一个引用名称。有前几轮记录时，框架还提供授权的历史文档、比较结果、评测结果和纠正意见。

| 输出 | 内容 |
| --- | --- |
| 修改意见 | 文档位置、问题、建议及本轮报告依据 |
| 阻塞标记 | 是否存在阻塞问题 |
| 历史总结 | 已尝试的修订、有效性、回归情况及下一步建议；有历史输入时必需 |

没有需要修改的问题可以返回空意见列表。每条意见的依据只能选择本轮提供的比较报告、评测报告或二者，真实工件引用由框架绑定。

## 3. 工作流程

### 阅读报告并定位问题

框架加载材料后，Review 对照实际评测与比较结果分析文档。例如，文档“返回值”写 3，比较报告指出原实现返回 4、重建实现返回 3，测试也失败。Review 可以提出：

> 修改“返回值”一节，将返回值更正为 4，并说明适用条件。当前描述与本轮比较报告及失败测试矛盾。

模型应根据证据解释问题，不能为了凑格式生成没有依据的意见。Prompt 同时要求在存在历史时总结哪些尝试有效、是否出现回归以及下一步建议。

### 将意见交给下一轮

框架与 DocGen 使用同一套位置解析，检查意见能否定位到当前文档。合法意见被规范为 COR 数字编号，problem 和 suggestion 合成 criterion，problem 记入 risk，选定报告转换为受信 evidenceRefs。

需要继续且预算允许时，下一轮 DocGen 接收上一版正文和这些意见进行修订。Review 没有意见也不代表通过；系统继续按实际评测和阻塞条件判定。

### 停止时留下交接

流程进入 STOPPED 时，Application 保存问题摘要、下一步建议及可打开的证据，有 Review 历史时保留总结，并按交接键去重。

测试校验或修复失败、文档拆分提案、文档质量耗尽轮次等分支可能还没执行 Review。此时 Application 根据已有事实生成交接，不为写摘要强行调用模型，也不把早期测试失败直接归因为知识错误。

## 4. 关键约束与失败处理

必需报告或文档缺失，在模型调用前失败。意见位置支持当前文档路径、唯一章节或唯一原文所在章节；位置不存在、存在歧义或指向另一文档时拒绝。

重复意见编号、非法依据均拒绝；模型不能指定另一个 Run 的证据。有历史输入却缺少 historySummary，也不能作为合法输出。

若 blocking 为真却没有修改意见，框架保留未解决风险。取消与非法输出不得提交成功结果，规则见 [Agents](../Agents.md)。停止交接由框架保证，重试和恢复不能重复创建同一交接。

## 5. 验收场景

- **意见可供 DocGen 使用。** 给定返回错误报告，意见定位到当前文档的唯一章节或原文；框架绑定正确的比较/评测引用，DocGen 可按该位置修订。
- **拒绝虚构位置和依据。** 指向不存在或歧义位置、重复编号、使用非法证据，结果被拒绝；多条意见分别绑定各自选定的真实报告。
- **检查历史与空意见。** 有历史时输出总结；没有问题时允许空意见。报告阻塞却没有意见时保留风险；测试失败不会因 Review 不阻塞而获得 PASS。
- **四类停止都可交接。** 分别触发测试校验/修复失败、文档提案、质量耗尽、Gate 停止，检查原因、建议和证据可读取；重复路由后仍只有同一交接。

输入、定位、证据、历史总结结构及停止交接已有回归。受控端到端验证过“测试失败 → Review 意见 → DocGen 修订 → 再评测”，预设回答不证明真实模型能正确归因。

## 6. 未实现与待定事项

真实模型对文档问题的定位、因果分析和历史总结质量尚未验收。自动清理和完整治理展示仍按 [Knowledge](../../knowledge/Knowledge.md) 保留为未完成能力。

## 7. 实现及测试索引

角色 ID：`review`，readablePaths 为空。输入为 knowledgeRef、evaluationReportRef、comparisonReportRef，历史正文包由 previousCorrectionRefs 引用。输出为 blocking、corrections 和有历史时必需的 historySummary；完整意见字段见 Contract。

STOPPED 保存 ReviewHandoffPrepared 事件及 CAS 交接，包含 summary、historySummary、evidenceRefs、handoffRef。规则对应：报告与意见为 IO-15、IO-16；停止交接为 AC-AGENT-106；资料清理为 IO-19。

- 跨角色意见定位：[AgentSpecRegression.test.mjs](../../../../../tests/integration/AgentSpecRegression.test.mjs)。
- 四类停止交接及去重：[StoppedHandoff.test.ts](../../../../../tests/integration/StoppedHandoff.test.ts)。
- Gate 独立判定：[Domain.test.ts](../../../../../tests/unit/Domain.test.ts)。
- 修订和再评测流程：[AgentRevisionFlow.test.ts](../../../../../tests/acceptance/AgentRevisionFlow.test.ts)。
- 既往执行版本与产物：[AgentSpecRepairAndE2E.md](../../../../reports/AgentSpecRepairAndE2E.md)。

代码位置：[执行入口](../../../../../src/domain/agents/reviewAgent/ReviewAgent.ts)、[输入输出契约](../../../../../src/domain/agents/reviewAgent/ReviewAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/reviewAgent/ReviewAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/reviewAgent/ReviewAgent.test.ts)、[独立样例](../../../../../src/domain/agents/reviewAgent/examples/ReviewAgentSample.json)。
