<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：DocGenAgent 的职责、输入输出与确认状态。
-->
# DocGenAgent：把源码分析写成一份文档

DocGen 负责写候选知识文档。首次生成时，它组织内部 DocWorker 阅读源码，再汇总片段；后续轮次则根据上一版文档和纠正意见修改正文。

写出来的文档要交给 Code 重建、独立评测和 Review。DocGen 没有发布权限。

## 一次生成需要什么

框架提供本次模块的源码、公开接口和允许读取的范围。如果安排了 Worker，还会提供各 Worker 的分析范围、知识片段、源码依据和没弄清的问题。

DocGen 要把这些内容组织成一份完整文档，处理重复和矛盾，并给出标题、摘要和关键词。无法解决的问题应留在风险说明中，不能在汇总时丢掉。

例如，两个 Worker 分别分析订单创建和取消逻辑。它们交付的是两份分析材料，DocGen 默认将其合成一份订单模块文档，而不是直接发布两篇文档。

## Worker 怎么安排

当前按源码文件列表均分任务，默认 1 个 Worker，可设置 0～5 个；0 表示不启动 Worker，DocGen 直接分析。重复路径去重，不派发空任务。

每个 Worker 在独立会话中处理自己的材料。全部成功后，DocGen 才开始汇总。任何一个失败，框架取消同批其他在途任务并等待结束，不用缺了一部分的结果继续写文档。

同一次 Run 中，任务范围、源码和冻结提示词未变时，可复用已保存的 Worker 结果；文档修订不必重新读一遍相同源码。完整结果引用会保留下来，便于查清文档使用了哪些分析材料。

文件均分只是当前实现。按业务模块和调用关系分组、按上下文预算拆小、处理跨模块依赖，仍按 IO-08 保留为下一版本目标。

## “绑定上一版文档”到底是什么意思

假设第一版有“创建订单”“取消订单”“退款”三个章节。Review 只指出“退款”章节有错，框架会把第一版原文和这条意见一起交给 DocGen。

DocGen 必须在这份原文上改“退款”，其余正文原样保留；不能顺手重写“创建订单”，也不能换成另一份模块文档。这就是绑定上一版：明确本轮改哪一份、依据是什么、允许改哪里。

框架会检查上一版确实存在，修改位置能唯一找到，以及未涉及的正文有没有变化。若意见针对整篇文档，或提供了整体质量反馈，则允许调整本篇结构。框架生成的 YAML 描述头不算正文比较范围。

找不到上一版、位置不存在或有歧义、指向另一文档、改动超出允许章节，都会失败。记录“已接收这些纠正意见”不等于问题已经修好，修复效果仍由下一次评测和 Review 判断。

## 内容太多，想拆成几篇怎么办

默认每次飞轮只处理一份文档。DocGen 认为内容太多时，可以只返回拆分建议，说明困难及建议范围，等待用户决定；这时不同时生成正文，也不继续进入 Code。

用户决定继续合成一份，调用方将明确答复和原提案交给新任务；用户同意拆分，则先选择其中一份范围再启动任务。没有答复不能当作同意拆分。

提案和停止处理已实现。专用 Console 决策界面、自动判断“多大必须拆分”的阈值、自动多文档任务都不属于当前已交付能力。

## 输出是什么，描述信息谁来写

正常结果是一份正文、标题、摘要和关键词。模型只写这些内容，框架负责生成 YAML 头、保存 Markdown，并将标题、摘要、关键词写入同一知识版本的索引。

读取方可以先看授权文档的标题和摘要，再决定加载哪一份正文。索引不能扩大读取权限，也不会让候选文档自动成为已通过评测的知识。

## 开发规则与验收

### IO-07 / IO-09：收齐 Worker 结果后再汇总

| 项目 | 约定 |
| --- | --- |
| 前提 | 本次模块和源码已固定，Worker 数量为 0～5，默认 1。 |
| 行为 | DocGen 按去重后的文件列表分配非空任务；启用 Worker 时等全部成功后才汇总，保留完整片段及未解决问题。失败则取消同批在途任务并等待结束；冻结输入不变时可复用已提交结果。 |
| 结果 | 正常生成一份候选并保留 Worker 结果引用；Worker 批次失败不得继续合成半份文档。数量为 0 时直接分析。 |
| 验收 | 两个 Worker 均成功才调用汇总模型；其中一个失败不得产生候选。重试复用已提交且材料一致的结果，风险信息仍传给汇总。见 [角色测试](../../../../../src/domain/agents/docGenAgent/DocGenAgent.test.ts) 和 [DocGenSubAgents.test.ts](../../../../../tests/integration/DocGenSubAgents.test.ts)。 |
| 状态 | 最小批次管理已实现，有角色及集成回归；业务分组和预算仍属 IO-08 待完成目标。 |

### IO-18：在指定上一版上定向修订

| 项目 | 约定 |
| --- | --- |
| 前提 | 本轮收到纠正意见或整体质量反馈，且提供对应的上一版正文。 |
| 行为 | 框架先验证上一版和定位。仅章节意见且无整体质量反馈时，DocGen 只改命中章节，其余正文逐字保留；整篇意见或整体质量反馈允许调整本篇结构。 |
| 结果 | 成功保存候选及上一版、意见编号的关联；缺上一版、定位不存在/不唯一、指向别篇或越界改正文均拒绝。接受意见不表示问题已解决。 |
| 验收 | 上一版含创建、取消、退款三节，只给退款意见：仅改退款应通过，顺改创建必须失败；缺上一版或两个同名目标章节必须拒绝。Review 原文定位应能被 DocGen 接续使用。见 [角色测试](../../../../../src/domain/agents/docGenAgent/DocGenAgent.test.ts) 和 [AgentSpecRegression.test.mjs](../../../../../tests/integration/AgentSpecRegression.test.mjs)。 |
| 状态 | 已实现，有修订及跨角色定位回归；最终修复效果仍需独立评测。 |

### IO-18：拆分建议必须停下来等明确决定

| 项目 | 约定 |
| --- | --- |
| 前提 | 默认生成单文档；模型认为需要拆分，或新任务携带用户对既有提案的明确答复。 |
| 行为 | 提案只交原因和建议范围，不同时交正文。框架保存提案后停止；继续一份时核对显式 keep-single 答复及提案绑定，拆分时由调用方选定范围建立新任务。 |
| 结果 | 提出建议时不创建候选、不调用 Code；无答复不得自动拆分。混交提案与正文、错误提案或范围绑定均拒绝。 |
| 验收 | 只返回提案时检查 Run 停止且没有候选；提案混入正文须拒绝；显式继续单文档后才允许生成正文。见 [角色测试](../../../../../src/domain/agents/docGenAgent/DocGenAgent.test.ts) 和 [DocGenDecision.test.ts](../../../../../tests/integration/DocGenDecision.test.ts)。 |
| 状态 | 提案、停止和单文档答复链路已实现；专用 Console 决策界面、自动阈值及自动多文档任务未交付。 |

### IO-22：正文与描述信息一起保存

| 项目 | 约定 |
| --- | --- |
| 前提 | DocGen 正常交付正文、标题、摘要、关键词，可能附带未解决风险。 |
| 行为 | 框架校验正文至少 200 字符、描述非空、关键词非空、不重复且无首尾空白，拒绝模型自写 YAML 头；统一生成 Markdown 描述头和同版本索引。索引及正文读取都核对授权。 |
| 结果 | 得到带描述和来源的候选文档；非法格式拒绝。描述可用于选择加载哪篇正文，不能扩大读取范围，也不授予发布状态。 |
| 验收 | 正常输出的 Markdown 与索引描述应一致；空关键词、模型自写 YAML 须拒绝；读取描述不应加载正文，未授权请求不得读取工件。见 [角色测试](../../../../../src/domain/agents/docGenAgent/DocGenAgent.test.ts) 和 [KnowledgeDocument.test.ts](../../../../../tests/integration/KnowledgeDocument.test.ts)、[DocGenDecision.test.ts](../../../../../tests/integration/DocGenDecision.test.ts)。 |
| 状态 | 已实现，有序列化、索引和授权回归；描述准确性及文档能否支撑真实业务重建待验收。 |

## 保留的目标与证据边界

IO-10 保留按业务主题分批汇总、中间摘要、问题回查源码及请求补充分析的目标；方案待论文调研，尚未实现。2026-09-10 已确认将业务分组/预算、分批汇总及补充分析留待下一版本确定，不能用文件均分和一次汇总声称已解决大仓库上下文问题。

运行资料清理按 [Knowledge IO-19](../../knowledge/Knowledge.md)，历史最佳回退等按 [Evaluation IO-20](../../evaluation/Evaluation.md)。自动清理与历史回退仍未完成，不因本页整理而取消。

上述流程回归使用预设模型回答，已有执行证据见 [验收报告](../../../../reports/AgentSpecRepairAndE2E.md)。源码分析的完整性、矛盾处理和真实模型文档质量仍需业务验收。

<details>
<summary>开发对照：字段、修订规则和提示词</summary>

角色 ID 为 `doc-gen`。必需输入为 moduleId、sourceRefs、publicInterfaceRefs；可选 workerFragmentRefs、baseKnowledgeRef、corrections、qualityFeedback、documentDecision。DocGenContext.docWorkers 承接内部执行；workerCount 默认 1，范围 0～5，非法值在模型调用前失败。

正常输出为 body、title、description、keywords，可带 unresolvedRisks。正文至少 200 字符，标题/摘要不能纯空白，关键词非空、不重复且不得含首尾空白。模型不得输出 YAML 头，框架统一序列化。模块标识必须与输入一致且为稳定 slug。

结果为 knowledgeCandidate，包含 bodyRef、provenance、changedPaths、workerResultRefs 和 unresolvedRisks；修订还带 baseKnowledgeRef、appliedCorrectionIds。片段工件保存完整结构，Worker 的未解决问题必须传给 DocGen。

有 corrections 或 qualityFeedback 时必需非空 baseKnowledgeRef；生产后续轮次缺失上一版直接失败。Correction 的 knowledgePath 支持当前 `knowledge/<moduleId>.md`、该路径加 `#章节标题`、唯一章节标题或唯一原文片段。Review 与 DocGen 共用 DocGenRevision，原文片段归入所在章节；只涉及章节且无整体质量反馈时，其余正文逐字保留。Correction 沿用 correctionId、criterion、evidenceRefs、risk，拒绝重复编号和非法定位。

拆分输出为独立的 `splitProposal: { reason, suggestedDocuments }`，不能混入 body。结果 userDecisionRequired 携带 proposalRef；candidate_knowledge 识别后不创建候选，经 workflow_router STOPPED。继续单文档时显式提供 `documentDecision: { action: 'keep-single', proposalRef }` 和提案正文；框架核对提案及源码绑定。

版本 tags 保存关键词。KnowledgeSearchApp 的 `describe(allowedVersionIds)` 只读授权描述，`loadDocument(versionId, allowedVersionIds)` 才读正文；未授权请求在工件读取前拒绝，不新增 SearchAgent。

Prompt 要求可追溯的单文档汇总、定向修订、范围外保留、矛盾/缺口说明，以及拆分前等待答复。执行端负责并发上限、取消、冻结提示词及保存结果；DocGen 不操作数据库或发布。共同约定见 [Agents](../Agents.md)。

</details>

## 代码与样例

代码位置：[执行入口](../../../../../src/domain/agents/docGenAgent/DocGenAgent.ts)、[输入输出契约](../../../../../src/domain/agents/docGenAgent/DocGenAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/docGenAgent/DocGenAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/docGenAgent/DocGenAgent.test.ts)、[独立样例](../../../../../src/domain/agents/docGenAgent/examples/DocGenAgentSample.json)。
