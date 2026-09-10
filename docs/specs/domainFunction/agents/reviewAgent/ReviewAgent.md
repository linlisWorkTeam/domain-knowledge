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
| IO-16 | Review 修订意见及交接 | 已实现，待业务验收 | 2026-09-10 用户确认 Review 输出知识卡片修订意见列表，每项包含修订位置、问题说明、依据和修订建议；交给 DocGen 修改知识卡片，没有发现需要修订的问题时返回空列表。 |

## 当前输入输出

IO-15、16 已实现。必需输入为 `knowledgeRef`、`evaluationReportRef`、`comparisonReportRef`；可选 `previousCorrectionRefs` 只加载 Application 显式提供的历史纠正记录。角色不获得原始仓库文件，`readablePaths` 为空。

模型输出 `blocking` 与 `corrections` 数组。每条修订意见包含：

| 字段 | 含义 |
| --- | --- |
| correctionId | 本次意见标识；信封中统一规范为 COR 数字编号 |
| knowledgePath | 本轮知识正文中已有的段落标题或原文定位片段 |
| problem | 缺失、错误或歧义的说明 |
| suggestion | 应补充或修改的内容 |
| evidence | evaluation、comparison 或二者，选择本轮可信依据 |

无意见时空数组合法；blocking 且无意见时记录 unresolvedRisks。Domain 拒绝重复意见标识和正文中不存在的位置。框架把依据选择映射为输入工件引用，模型不能自行指定其他 Run 的 ArtifactRef。

交给 DocGen 的信封沿用 `corrections`，将 problem 和 suggestion 合并为 criterion，将 problem 保存为 risk，并附可信 evidenceRefs。下一轮同时提供上一版正文，沿既有单文档修订规则执行。最终结果仍由测评、Check、Review 和 Gate 共同决定。

## 验证与保留边界

角色测试覆盖多条意见、两类依据绑定、无意见、位置越界与取消。完整 C++ 测试覆盖失败测评 → Review → DocGen 修订 → 再测评。意见的业务质量仍待真实模型验证。

Knowledge IO-19 的完整人工治理清单、历史提炼和资料保留/清理属于独立治理能力，当前只保留结构化意见及证据，不执行自动删除。状态与验收依据见 [Status](../../../../Status.md)。
