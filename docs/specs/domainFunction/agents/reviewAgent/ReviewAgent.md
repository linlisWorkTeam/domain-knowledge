<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：ReviewAgent 的职责、输入输出与确认状态。
-->
# ReviewAgent：评测复核与纠正

代码位置：[执行入口](../../../../../src/domain/agents/reviewAgent/ReviewAgent.ts)、[输入输出契约](../../../../../src/domain/agents/reviewAgent/ReviewAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/reviewAgent/ReviewAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/reviewAgent/ReviewAgent.test.ts)、[独立样例](../../../../../src/domain/agents/reviewAgent/examples/ReviewAgentSample.json)。

角色 ID：`review`。共同执行、失败和交接协议见 [Agents](../Agents.md)。

## 已确认的证据输入（已实现，语义质量待验收）

2026-09-10，[IO-15](../checkAgent/CheckAgent.md) 已确认：Review 在评测之后同时读取 Check 的比较结果及差异依据、评测执行器的测试结果，用于分析知识卡片需要修订的位置。两类报告正文已经由 Application 加载到 Review 的授权材料；机器字段、权限和输出按下文 IO-15、16 实现，纠正意见的业务质量仍待真实模型验收。

## 输出确认记录

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-16 | Review 修订意见及交接 | 已实现，待业务验收 | 2026-09-10 用户确认 Review 输出知识卡片修订意见列表，每项包含修订位置、问题说明、依据和修订建议；交给 DocGen 修改知识卡片，没有发现需要修订的问题时返回空列表。 |

## 当前输入输出

IO-15、16 已实现。必需输入为 `knowledgeRef`、`evaluationReportRef`、`comparisonReportRef`；可选 `previousCorrectionRefs` 加载 Application 按轮次整理的历史材料包，每包包含先前文档、实际测评、比较报告、纠正意见正文及其证据引用。角色不获得原始仓库文件，`readablePaths` 为空。

模型输出 `blocking` 与 `corrections` 数组；有历史输入时必须同时输出 `historySummary`，总结有用尝试、回归和下一步建议。每条修订意见包含：

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

工作流 STOPPED 时生成 `ReviewHandoffPrepared` 事件及 CAS 摘要，人工待办包含问题段落、建议、历史对比及证据入口。所有详细材料保存在后台。Knowledge IO-19 的治理后资料清理仍属于原有共享能力待办；本次端到端验收显式保留全部中间产物。状态与验收依据见 [Status](../../../../Status.md)。

## 本轮缺口修复验收

修订定位与 DocGen 共用解析规则：当前文档路径、唯一章节或唯一原文所在章节。历史材料提供先前文档、实际评测、比较与意见正文，并形成带证据引用的问题与建议摘要。

## 停止交接的强制验收（2026-09-11）

AC-AGENT-106：所有转人工的 STOPPED 路径，包括测试校验/修复耗尽、文档提案、质量拒绝耗尽及测评 Gate 停止，都必须在结束前持久化精简交接。包含明确的问题、下一步建议、相关候选/提案/质量报告/失败评测的有效引用；存在历史复核时保留对比摘要。无需 Review 的早期停止由 Application 根据确定性结果组织摘要，不强行调用 Review。交接事件及待办在节点重试、恢复时幂等；后台证据继续保留。

验收命令：`node --test tests/integration/StoppedHandoff.test.ts`。分别触发四条停止路径，核对摘要非泛化占位语、证据可从 CAS 读取、重复路由只有一个交接事件且待办不重复；测试失败不能归因于知识错误。
