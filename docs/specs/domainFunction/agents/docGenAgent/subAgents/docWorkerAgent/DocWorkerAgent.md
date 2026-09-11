<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：DocWorkerAgent 的职责、输入输出与确认状态。
-->
# DocWorkerAgent：知识片段提取

代码位置：[执行入口](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.ts)、[输入输出契约](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgentContract.ts)、[提示词与读取范围](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgentPrompt.ts)、[角色测试](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.test.ts)、[独立样例](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/examples/DocWorkerAgentSample.json)。

角色 ID：`doc-worker`，`parentAgentId: doc-gen`；保留独立开发入口，外层 LangGraph 不直接调度。共同执行、失败和交接协议见 [Agents](../../../Agents.md)。

## 输入输出确认记录

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-07 | DocWorker 的归属与存在目的 | 已确认 | 2026-09-10 用户确认 DocWorker 是 DocGen 内部子 Agent，用于拆分源码分析工作，控制单次分析的上下文大小。具体拆分依据、上下文预算、片段格式与汇总容量仍待逐项确认；当前按文件列表均分不等于已实现按上下文容量拆分。 |
| IO-08 | Worker 任务拆分原则与输入范围 | 已确认（待实现） | 2026-09-10 用户确认先按业务模块和调用关系分组，再按上下文预算拆小。每个 Worker 接收任务范围、相关源码和必要依赖信息。具体预算、跨模块依赖处理和分组算法尚未确定；当前文件数量均分实现需要后续调整。 |
| IO-09 | Worker 输出与 DocGen 汇总职责 | 结构契约已实现，语义待验收 | 2026-09-10 用户确认 Worker 返回分析范围、知识正文、源码依据和未解决问题。DocGen 汇总片段、消除重复和矛盾并组织成最终知识卡片；具体机器字段与汇总实现待落实。 |

IO-07 中的拆分依据已由 IO-08 补充确认，片段输出由 IO-09 补充确认；具体上下文预算与汇总容量继续讨论。

## 目标输出（结构契约已实现）

| 内容 | 约定 |
| --- | --- |
| 分析范围 | 说明实际覆盖的模块、文件和函数，供 DocGen 核对任务覆盖情况 |
| 知识正文 | 提取业务规则、接口行为、关键流程及边界条件 |
| 源码依据 | 将结论对应到文件、符号或代码位置，供 DocGen 追溯核对 |
| 未解决问题 | 明确缺少的依赖、无法确定的行为，交后续处理 |

Worker 交付以上知识片段或文档，由 DocGen 汇总、去重、处理矛盾并默认合成一份知识文档，遵守 [DocGen IO-18](../../DocGenAgent.md)。Worker 产出数量不决定最终文档数量；内容过大而建议拆分时，由 DocGen 先与用户沟通，以用户意见为准。每次飞轮只处理一份知识文档。字段名、来源校验、缺口处理与矛盾解决机制仍需细化；当前已保存完整结构化片段并传递未解决问题；源码语义与矛盾消解仍需真实模型验收。

## 职责与当前输入输出

作为 DocGen 内部 subAgent，从分配给本 Worker 的源码中提取知识片段，交给 [DocGenAgent](../../DocGenAgent.md) 汇总。以下描述当前实现，目标片段内容已按 IO-09 确认，覆盖校验与材料不足后的处理仍待细化；调用归属已随 main 实现。

| 边界 | 当前实现 |
| --- | --- |
| 输入 | 模块标识 `moduleId`、源码 `sourceRefs`、公开接口 `publicInterfaceRefs`；可选分配路径 `assignedSourcePaths` 和依赖材料 `dependencyRefs` |
| 可读文件 | 分配的源码路径（未提供时使用 input.sourcePaths）及公开接口路径 |
| 模型输出 | `workerId`、`fragment`、`provenance`、`analysisScope`、`sourceEvidence`、`unresolvedQuestions`；片段至少 20 字符，覆盖与证据路径校验 |
| 交接输出 | `resultKind: knowledgeChunk`，JSON 片段工件 `chunkRef`、受信输入的 `provenance`、`unresolvedRisks` |
| 权限与限制 | 只提取片段，不发布知识或决定门禁；交接来源使用 input.provenance，不直接信任模型自报来源 |

## 待确认与验收重点

对应 S2-02：分块原则按 IO-08、输出内容按 IO-09 实现，具体上下文预算、跨模块依赖处理、覆盖与来源校验和材料不足后的处理仍需细化。验证片段结构与实际覆盖分别进行，不能把满足最小长度当作知识完整。

开发步骤与证据统一记录在 [Status](../../../../../../Status.md)，独立运行方法见 [AgentDevelopment](../../../../../../AgentDevelopment.md)。

## 本轮实现约定（2026-09-10）

IO-09 采用必需字段 `analysisScope: { moduleId, files, symbols }`、`fragment`、`sourceEvidence: [{ claim, path, symbol? }]`、`unresolvedQuestions: string[]`；保留 workerId 和 provenance。files 必须精确覆盖分配源码（不能重复或越界），证据路径只允许分配源码及显式公开接口；每个覆盖文件至少有一项证据。symbols 可以为空，不伪造符号提取能力。结构校验及路径授权不证明结论与源码语义一致。

片段工件保存完整 JSON，确保汇总收到范围、正文、依据和缺口；未解决问题进入结果 unresolvedRisks，并沿内部执行端传递给 DocGen，不能被固定空数组丢弃。缺依赖可以明确报告问题，不得编造依据；未覆盖任务文件则本次执行失败。上述字段与语义校验落地后由角色测试与组合回归验证。

2026-09-10 用户确认：本次保留现有最小链路，IO-08 的业务模块/调用关系分组、上下文预算和跨模块依赖处理，以及 IO-10 的分批汇总等未定项留待下个版本确定，不作为本次 PR 的完成条件。

## 强制材料边界验收（2026-09-11）

AC-AGENT-104：每个 Worker 的授权集合等于 assignedSourcePaths 与公开接口。Application 必须创建裁剪后的独立源码清单及 CAS 引用；提示词、sourceRefs/publicInterfaceRefs 的正文和模型工具工作区使用同一授权集合。不得把父级完整源码清单传入子任务；隐藏其引用但携带正文同样违规。重试、跨轮复用和并发 Worker 均不得扩大范围。

验收命令：`node --test tests/integration/WorkerMaterialBoundary.test.ts tests/security/AgentWorkspace.test.ts`。准备两个文件各含唯一标记；两个 Worker 并发时各自提示词、工件和实际工作区只出现自己的标记，未授权文件不存在；公开接口仍可读。重试和下一轮复用保留相同裁剪材料，父级修订/历史材料不能进入子任务。文件与提示词都必须检查，不能仅断言 readablePaths。生产 OS 隔离另由已有 DSH sandbox 验收覆盖。
