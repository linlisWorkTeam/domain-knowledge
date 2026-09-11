<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：DocGenAgent 的职责、输入输出与确认状态。
-->
# DocGenAgent

## 1. 职责与边界

DocGen 把源码分析写成一份候选知识文档，并在后续轮次根据评测意见修订。它负责组织内部 DocWorker、汇总片段、处理重复与矛盾，以及说明仍未解决的问题。

每次飞轮默认处理一份文档。文档生成后还要交给 Code 重建实现，经过独立评测、Review 和 Gate 才能发布。DocGen 不直接操作数据库或发布知识。

## 2. 输入与输出

| 材料 | 内容 |
| --- | --- |
| 基础输入 | 本次模块、固定版本的源码、公开接口和读取范围 |
| Worker 材料 | 各任务的分析范围、完整片段、源码依据及未解决问题 |
| 修订输入 | 上一版文档、纠正意见或整体质量反馈 |
| 决策输入 | 用户对拆分提案的明确答复及对应提案 |

正常输出包含正文、标题、摘要和关键词，可附未解决风险。框架保存 Markdown 后，返回候选引用、来源、变更路径及 Worker 结果引用；修订结果另记录上一版引用和接收的意见编号。

拆分提案是另一种输出，只包含拆分原因和建议文档范围，不附正文。输入输出的完整字段见文末 Contract。

## 3. 工作流程

### 首次生成

DocGen 先检查材料，再安排 Worker 阅读源码。当前按去重后的文件列表均分，默认 1 个 Worker，可设置 0～5 个，不派发空任务；设为 0 时由 DocGen 直接分析。

各 Worker 在独立会话中执行，全部成功后才开始汇总。例如两个 Worker 分别分析订单创建和取消逻辑，DocGen 将它们组织成一份订单模块文档。Worker 提出的缺口必须随完整片段传入，汇总结果继续保留未解决风险。

同一次 Run 内，任务范围、源码和冻结提示词不变时，可以复用已保存的 Worker 结果。框架保留结果引用，便于追溯这份文档使用了哪些分析。

DocGen 只输出正文和描述信息。框架统一生成 YAML 头，并将标题、摘要和关键词写入同一知识版本的索引，关键词保存为版本 tags。授权读取方可先调用 describe 查看描述，再通过 loadDocument 读取正文；这一能力不新增 SearchAgent，也不改变候选的发布资格。

### 根据意见修订

后续轮次中，框架把上一版原文与纠正意见交给 DocGen，明确本轮改哪份文档、依据是什么。

假设上一版有“创建订单”“取消订单”“退款”三节，Review 只指出退款章节有错，且没有整体质量反馈。DocGen 只能修改退款章节，其余正文必须逐字保留。框架接收结果时检查这一点，YAML 描述头不参与正文比较。

意见针对整篇文档，或附带整体质量反馈时，允许调整本篇结构。成功结果记录 baseKnowledgeRef 和 appliedCorrectionIds；记录接收意见不表示问题已经解决，修复效果仍由下一轮评测和 Review 判断。

### 提出文档拆分

内容难以合成一篇时，DocGen 可以返回拆分原因和建议范围。框架保存提案，返回 userDecisionRequired；候选节点不创建文档，路由进入 STOPPED，也不继续调用 Code。

用户明确选择继续一篇后，调用方在新任务中提供 keep-single 答复、proposalRef 和提案正文，框架核对模块与源码绑定后继续。用户同意拆分时，由调用方先选定一份范围再建立任务；没有答复不能推定同意。

## 4. 关键约束与失败处理

### 材料与 Worker 批次

模块标识必须与输入一致且使用稳定 slug。必需材料缺失、Worker 数量非法，在模型调用前失败。任一 Worker 失败时，执行端取消同批其他在途任务并等待结束，不拿部分结果继续汇总。

### 修订范围

有纠正意见或质量反馈时必须提供非空上一版；后续轮次缺上一版也直接失败。意见保留 correctionId、criterion、evidenceRefs 和 risk，编号不能重复，证据不能为空。

修改位置使用 Review 与 DocGen 共用的定位规则：支持当前文档路径、路径加章节标题、唯一章节标题或唯一原文片段。原文片段归入所在章节；不存在、无法唯一定位或指向另一文档都拒绝。仅允许修改部分章节时，范围外正文变化同样拒绝。

### 输出与读取权限

正文至少 200 字符；标题和摘要不能纯空白；关键词非空、不重复且无首尾空白。模型自写 YAML 头、提案与正文混交、错误提案绑定均拒绝。

索引和正文都按授权版本集合读取，未授权请求在工件读取前失败。Prompt 要求单文档汇总、定向修订、保留范围外正文和未解决问题；并发、取消、材料授权及保存由执行端保证。通用失败规则见 [Agents](../Agents.md)。

## 5. 验收场景

- **汇总完整批次。** 两个 Worker 均成功后才调用汇总模型，候选保留双方结果引用和风险；任一失败，不产生候选。冻结输入相同的重试可复用已提交片段。
- **只修改退款。** 提供三节正文和退款意见，仅改退款接受为新候选；同时改写创建章节则拒绝。
- **拒绝无依据修订。** 缺上一版、目标不存在或有两个同名目标章节时失败；Review 给出的唯一原文位置能被 DocGen 接续使用。
- **等待拆分决定。** 返回提案后 Run 停止且没有候选；混入正文拒绝；明确答复继续单文档后才生成正文。
- **保存描述并检查授权。** Markdown 描述与版本索引一致；空关键词和模型自写 YAML 拒绝。只读描述不加载正文，未授权请求不读取工件。

上述结构和流程已有受控回归。源码分析是否完整、矛盾是否解决及文档是否足以重建真实业务，仍需真实模型和业务场景验收。

## 6. 未实现与待定事项

业务分组、上下文预算及跨模块依赖处理尚未实现。按业务主题分批汇总、保存中间摘要、发现问题回查源码或请求补充分析仍是待论文调研的方案。2026-09-10 已确认留待下一版本确定，当前文件均分和一次汇总不算这些目标完成。

专用 Console 决策界面、自动拆分阈值和自动多文档任务尚未交付。自动清理及历史最佳回退也仍未完成，分别沿用 [Knowledge](../../knowledge/Knowledge.md) 和 [Evaluation](../../evaluation/Evaluation.md) 的目标。

## 7. 实现及测试索引

角色 ID：`doc-gen`。内部执行由 DocGenContext.docWorkers 承接。正文结果为 knowledgeCandidate，提案结果为 userDecisionRequired；字段和 Prompt 入口见下方代码链接。

规则对应：Worker 管理与片段交接为 IO-07、IO-09；业务分组为 IO-08；分批汇总为 IO-10；修订和拆分为 IO-18；描述与索引为 IO-22；清理和回退为 IO-19、IO-20。

- Worker 批次、失败及复用：[DocGenSubAgents.test.ts](../../../../../tests/integration/DocGenSubAgents.test.ts)。
- 提案停止及候选质量检查：[DocGenDecision.test.ts](../../../../../tests/integration/DocGenDecision.test.ts)。
- 跨角色修订定位：[AgentSpecRegression.test.mjs](../../../../../tests/integration/AgentSpecRegression.test.mjs)。
- 描述、索引及授权：[KnowledgeDocument.test.ts](../../../../../tests/integration/KnowledgeDocument.test.ts)。
- 既往执行版本与产物：[AgentSpecRepairAndE2E.md](../../../../reports/AgentSpecRepairAndE2E.md)。

代码位置：[执行入口](../../../../../src/domain/agents/docGenAgent/DocGenAgent.ts)、[输入输出契约](../../../../../src/domain/agents/docGenAgent/DocGenAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/docGenAgent/DocGenAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/docGenAgent/DocGenAgent.test.ts)、[独立样例](../../../../../src/domain/agents/docGenAgent/examples/DocGenAgentSample.json)。
