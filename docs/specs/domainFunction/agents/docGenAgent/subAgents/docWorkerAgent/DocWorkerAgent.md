<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：DocWorkerAgent 的职责、输入输出与确认状态。
-->
# DocWorkerAgent：读完分给自己的源码，交出分析片段

DocWorker 是 DocGen 的内部助手。DocGen 将源码分成几个任务，每个 Worker 只分析分给自己的部分，交回业务规则、接口、流程和边界说明。

它不写最终知识版本，也不决定文档是否通过。DocGen 收齐片段后统一汇总。

## 需要哪些材料

每个任务包含模块、分配的源码文件和允许共享的公开接口。目录存在不代表能读整个目录；兄弟 Worker 的源码、父任务的历史文档和修订材料不能混进来。

例如，Worker A 分到订单创建文件，Worker B 分到退款文件。两者可以读取明确共享的接口，但 A 不能看到 B 的退款源码，即使它们同时执行或某个任务正在重试。

## 交回的片段必须说清什么

| 内容 | 要回答的问题 |
| --- | --- |
| 分析范围 | 我读了哪些文件，涉及哪个模块、哪些符号？ |
| 知识片段 | 这些代码规定了什么业务行为、接口、流程和边界？ |
| 源码依据 | 每个结论来自哪个授权文件，必要时指出符号？ |
| 未解决问题 | 哪些依赖没拿到，哪些行为还不能确定？ |

分配的文件一个都不能漏，每个文件至少提供一项依据；不能拿其他任务的文件凑覆盖。如果缺少依赖导致无法确定行为，应明确列出问题，而不是猜测。

框架保存完整片段，连同未解决问题交给 DocGen。输出文件名和引用都合法，并不能证明结论符合源码含义；这部分仍需要语义验收。

## 开发规则与验收

### IO-07 / AC-AGENT-104：内部 Worker 只能看到分配材料

| 项目 | 约定 |
| --- | --- |
| 前提 | DocGen 已分配源码文件和明确共享的接口；其他 Worker 或父级可能持有更多材料。 |
| 行为 | Application 用同一授权集合裁剪 Prompt、材料正文/CAS 清单和只读工具工作区。并发、重试及复用都沿用该范围，不加入父级历史或隐式依赖。 |
| 结果 | Worker 仅分析自己的材料，结果回到 DocGen；不得因目录存在、父级可读或重试而看到兄弟源码。 |
| 验收 | 给创建和退款文件放不同标记，两个 Worker 并发时分别检查三个材料通道；每个只能看到自己的标记及共享接口。重试、跨轮复用也须相同。见 [WorkerMaterialBoundary.test.ts](../../../../../../../tests/integration/WorkerMaterialBoundary.test.ts)、[AgentWorkspace.test.ts](../../../../../../../tests/security/AgentWorkspace.test.ts)。 |
| 状态 | 材料裁剪已实现，有并发、重试、复用回归；完整生产操作系统隔离由 DSH 另行验收。 |

### IO-09：完整返回范围、依据与未解决问题

| 项目 | 约定 |
| --- | --- |
| 前提 | Worker 已收到分配材料，缺依赖时可能无法确定部分行为。 |
| 行为 | Worker 返回分析范围、片段、源码依据和未解决问题。框架检查分配文件精确覆盖且每个至少有一项依据，拒绝范围外路径；完整保存结果，交 DocGen 汇总。 |
| 结果 | 合法结果形成分析片段；缺材料、漏文件、重复或越界引用、非法字段均失败。未知行为列为问题，不得用猜测掩盖；批次失败处理归 DocGen。 |
| 验收 | 分配两个文件时均须列出并提供依据；删一个文件、加入第三个文件须拒绝。保留的未解决问题必须到达父级，不得只存正文摘要。见 [角色测试](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.test.ts) 和 [DocGenSubAgents.test.ts](../../../../../../../tests/integration/DocGenSubAgents.test.ts)。 |
| 状态 | 字段、覆盖、路径授权及问题传递已实现；框架不保证自然语言结论与源码语义一致，分析质量待验收。 |

## 保留的目标

IO-08：先按业务模块和调用关系分组，再按上下文预算拆小，并提供必要依赖。原则已确认，分组算法、具体预算和跨模块依赖处理尚未实现；2026-09-10 已明确留待下一版本确定。当前文件均分只满足基本分派，不能算此目标完成，也不能据此自行增加依赖读取权限。

<details>
<summary>开发对照：字段、材料裁剪和提示词</summary>

角色 ID 为 `doc-worker`，parentAgentId 为 `doc-gen`，外层 LangGraph 不直接调度。输入为 moduleId、sourceRefs、publicInterfaceRefs，可带 assignedSourcePaths 和 dependencyRefs。未传分配路径时使用 input.sourcePaths；公开接口必须明确授权，dependencyRefs 不能隐式扩权。

输出保留 workerId、fragment、provenance，必需 analysisScope（moduleId、files、symbols）、sourceEvidence（claim、path、可选 symbol）、unresolvedQuestions。fragment 至少 20 字符；files 精确覆盖分配源码，不重复或越界，每个文件至少有一项证据；symbols 可为空，不伪造符号提取能力。

Application 用 WorkerMaterials 创建只含分配源码和公开接口的独立清单与 CAS 引用。Prompt、sourceRefs/publicInterfaceRefs 正文和工具工作区使用同一授权集合，不能传父级完整清单或藏着其正文。

结果为 knowledgeChunk，chunkRef 指向完整 JSON，provenance 使用受信输入，unresolvedRisks 传递未解决问题。最终血缘不直接采用模型自报来源。Prompt 要求覆盖分配文件、给出依据，并把不确定行为列为问题。

共同执行规则见 [Agents](../../../Agents.md)，运行方法见 [AgentDevelopment](../../../../../../AgentDevelopment.md)，验收证据见 [报告](../../../../../../reports/AgentSpecRepairAndE2E.md)。

</details>

## 代码与样例

代码位置：[执行入口](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.ts)、[输入输出契约](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgentContract.ts)、[提示词与读取范围](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgentPrompt.ts)、[角色测试](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.test.ts)、[独立样例](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/examples/DocWorkerAgentSample.json)。
