<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：DocGenAgent 的职责、输入输出与确认状态。
-->
# DocGenAgent：知识正文生成与修订

代码位置：[执行入口](../../../../../src/domain/agents/docGenAgent/DocGenAgent.ts)、[输入输出契约](../../../../../src/domain/agents/docGenAgent/DocGenAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/docGenAgent/DocGenAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/docGenAgent/DocGenAgent.test.ts)、[独立样例](../../../../../src/domain/agents/docGenAgent/examples/DocGenAgentSample.json)。

角色 ID：`doc-gen`。共同执行、失败和交接协议见 [Agents](../Agents.md)。

## 已确认的组织目的

2026-09-10，用户确认 DocWorker 本来就是 DocGen 的内部子 Agent，其存在是为了解决源码分析任务的上下文容量问题。由 DocGen 将分析工作分配给内部 Worker，每次分析处理受控范围的材料，再汇总片段。该关系没有分歧，不再作为未决角色划分讨论；确认记录见 [DocWorker IO-07](subAgents/docWorkerAgent/DocWorkerAgent.md)。

用户随后确认拆分原则（IO-08）：先按业务模块和调用关系分组，再按上下文预算拆小；每个 Worker 接收任务范围、相关源码和必要依赖信息。每个 Worker 的具体上下文预算、跨模块依赖处理和片段汇总后的上下文控制方式仍待确认。下方当前实现中的文件均分、默认数量和数量上限不是已确认的产品要求。

IO-09 已确认 Worker 输出分析范围、知识正文、源码依据和未解决问题，详细约定见 [DocWorker 目标输出](subAgents/docWorkerAgent/DocWorkerAgent.md)。DocGen 负责汇总这些片段、消除重复和矛盾，按 IO-18 组织成最终知识卡片；汇总的上下文控制和矛盾解决机制仍需细化，不能把当前提示词要求等同于目标已实现。

## 汇总上下文方案（暂定，待论文调研）

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-10 | DocGen 汇总的上下文控制 | 暂定设计，非最终确认 | 2026-09-10 用户对具体机制尚不确定，要求先保留助手提出的设计、保证最小链路可运行，待论文调研后再调整。按业务主题分批读取 Worker 片段，维护中间摘要并逐步汇总正文；发现矛盾或证据不足时按需回查相关源码或请求 Worker 补充分析。内部批次不等于多份最终文档，最终输出与拆分决策遵守 IO-18。 |

当前先保留可运行的“Worker 片段 → DocGen 汇总 → 知识正文工件”链路作为开发基线。分批汇总、中间摘要和补充分析循环尚未实现，不能用现有组合样例宣称大仓库上下文问题已解决。具体预算、批次划分、补充分析终止条件待调研后细化。

本节的最小链路只指知识生成内部协作，不代表知识飞轮的相似度检查、测试评测、修订及发布闭环已验收。

## 单文档汇总与飞轮修订范围（已确认，待落实）

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-18 | DocGen 文档汇总与飞轮输入范围 | 已确认（修正此前多卡片解释） | 2026-09-10 用户明确 DocWorker 生成的文档由 DocGen 合成一份知识文档。如果内容过大、不建议合成一份，必须先与用户沟通，并以用户意见为准，不能自行拆分。每次飞轮输入一份知识文档，在该文档基础上进行修改。此记录取代此前“模块内默认输出多张卡片”的解释。 |

DocWorker 的多份产出是 DocGen 的内部汇总材料，不直接作为多份文档一起进入飞轮。默认由 DocGen 汇总、去重和处理矛盾，交付一份完整知识文档。若建议拆分，应说明内容规模、合成困难及建议方案，等待用户决定；未得到答复不能视为同意拆分。即使用户同意拆成多份，每次飞轮仍只选择其中一份文档处理。

修订输入是本轮选定的单份知识文档及其纠正材料；DocGen 在该文档基础上定向修改，输出同一文档的修订结果，不自动扩大到其他文档。源代码和测试等材料仍按各角色既定权限提供，“单文档输入”不改变 TestGen 读取源代码或 CodeAgent 的读取边界。

IO-10 的内部汇总算法继续保持暂定；“内容过大”的判断标准、向用户沟通及恢复任务的机制仍待细化。飞轮结束后的版本与过程资料保留已由 [Knowledge IO-19](../../knowledge/Knowledge.md) 确认：运行期间保留，达标后保留最终文档与验收记录，需人工治理时暂存相关证据；达标且最终文档及验收记录保存成功后立即清理中间资料，不设额外保留期；父版本选择的评分及可比性细节仍待细化；达标自动交付、耗尽轮次或预算转人工治理、保留历史最佳及关键回归回滚已有设计，参见 [Evaluation IO-20](../../evaluation/Evaluation.md)，相应实现缺口不等于业务原则未定。

## 知识索引分工（已确认，待实现）

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-22 | 文档描述与索引生成职责 | 本轮实现，真实模型待验收 | 用户确认 DocGen 生成文档标题、摘要和关键词，框架负责写入 YAML 头并建立支持渐进式加载的索引，不新增 Agent。 |

DocGen 在生成或修订单份知识文档时提供与正文一致的标题、摘要和关键词。框架校验这些描述，写入 YAML 头并更新索引；序列化、工件保存及索引维护不交给模型自行操作。渐进式加载先读取索引中的描述，再按任务需要加载对应正文，继续遵守角色既有的材料授权范围；索引不扩大 CodeAgent 可读取的文档范围。

当前输出为 body、title、description、keywords；框架生成 YAML 头，生产入库将关键词写入版本 tags，渐进读取接口见本轮实现约定。具体字段、索引格式、更新与读取接口由实现细化，不把标题和摘要字段已经存在当作索引能力已验收。框架侧知识管理规则见 [Knowledge](../../knowledge/Knowledge.md)。

## 职责与当前输入输出

结合源码及分块片段生成知识正文，也可根据旧正文和纠正材料定向修订。以下描述当前实现：一次返回一篇正文，与 IO-18 的默认输出范围一致；内容过大时的用户沟通及单文档飞轮边界仍需落实和验收。内部 Worker 组织方式已随 main 实现。

| 边界 | 当前实现 |
| --- | --- |
| 输入 | 模块标识 `moduleId`、源码 `sourceRefs`、公开接口 `publicInterfaceRefs` |
| 内部执行参数 | `workerCount` 默认 1，允许 0～5；通过 DocGenContext.docWorkers 执行内部批次，非法数量在调用模型前失败 |
| 可选修订材料 | Worker 片段 `workerFragmentRefs`、上一版 `baseKnowledgeRef`、纠正意见 `corrections`、质量反馈 `qualityFeedback` |
| 模型输出 | `body`、`title`、`description`、`keywords`；正文至少 200 字符，描述与关键词禁止纯空白 |
| 交接输出 | `resultKind: knowledgeCandidate`，Markdown 正文工件 `bodyRef`、来源 `provenance`、变更路径、内部子任务 `workerResultRefs` 与未解决风险 |
| 权限与限制 | 修订所需旧正文和纠正材料必须由 Application 显式提供；角色声明待保存工件，Application 保存并回填引用，角色不直接发布 |

## 内部 Worker 调用与复用（当前实现）

DocGen 是外层知识生成 Agent，docWorkerAgent 位于 docGenAgent/subAgents/ 下，作为其内部源码分析 subAgent。外层 LangGraph 只调度 DocGen，不再调度 DocWorker；执行身份仍保留七种，供提示词配置、审计和独立开发使用。

DocGen 按源码路径均匀拆分任务，默认一个 Worker，最多五个；重复路径去重，不派发空任务，workerCount=0 时直接汇总。执行端负责有界并发、取消、冻结提示词、独立模型会话和工件提交。全部 Worker 成功后 DocGen 才汇总正文；失败不能产生部分候选。DocGen 结果保存 workerResultRefs，追溯每个子任务的命令、输出与片段。候选知识入库、质量检查、评测与发布仍由 Application 协调。

Worker 的提交键绑定 Run、内部任务身份、源码输入和冻结提示词；同一输入在正文修订和恢复时复用已提交片段。调整执行版本拒绝旧 Run 恢复，不提供新旧拓扑兼容分支。

组合样例见 [DocGenWithWorkersSample](../../../../../src/domain/agents/docGenAgent/examples/DocGenWithWorkersSample.json)，内部调用验证见 [DocGenSubAgents.test.ts](../../../../../tests/integration/DocGenSubAgents.test.ts)。

## 待确认与验收重点

对应 S2-03：按 IO-18 验证 Worker 产出默认合成一份文档、建议拆分时先征求用户意见、每次飞轮只修订输入的单份文档；继续细化内容结构、标识与路径、来源、旧版与纠正输入、质量反馈及定向修订规则。[Review IO-16](../reviewAgent/ReviewAgent.md) 已确认由 Review 提供修订位置、问题说明、依据和建议，DocGen 执行知识文档修改；具体修订输入契约及处理机制待落实。正文长度检查只证明结构下限，不证明业务质量。

固定源码样例为 [DocGenFixedSourceSample.json](../../../../../src/domain/agents/docGenAgent/examples/DocGenFixedSourceSample.json)，包含原始源码、公开接口和追加指令；[样例检查器](../../../../../src/domain/agents/docGenAgent/examples/DocGenReference.ts) 与 [样例测试](../../../../../src/domain/agents/docGenAgent/DocGenExample.test.ts) 由本角色目录维护。统一 agent:run 负责执行和提交，固定参考测试不作为生产角色阶段；操作方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。

开发步骤与证据统一记录在 [Status](../../../../Status.md)，独立运行方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。

## 本轮实现约定（2026-09-10）

IO-22 输出增加必需 `keywords: string[]`（非空、不重复、元素去除首尾空白）；title、description 禁止纯空白。模型只生成正文和描述，框架使用 YAML 序列化器写入单份 Markdown 工件，拒绝模型自行提供 YAML 头，防止出现双重元数据。原始输出保留审计，知识候选保存同一份带 YAML 的文档，关键词写入版本 tags，标题及摘要写入既有版本索引。

渐进式读取通过 KnowledgeSearchApp 的 `describe(allowedVersionIds)` 只读取授权版本描述及 bodyRef，`loadDocument(versionId, allowedVersionIds)` 才读取该份正文；每次调用显式携带授权版本列表，未授权请求在读取工件前失败。不改变既有全文检索，不新增 SearchAgent，也不把索引当作发布门禁。
