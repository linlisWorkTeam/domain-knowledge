<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：DocWorkerAgent 的职责、输入输出与确认状态。
-->
# DocWorkerAgent

## 1. 职责与边界

DocWorker 是 DocGen 的内部助手，阅读分配给自己的源码，交回业务规则、接口、流程和边界说明。它保留独立开发入口，但外层 LangGraph 不直接调度它。

Worker 不生成最终知识版本，也不判断文档是否通过。DocGen 收齐片段后统一汇总。

## 2. 输入与输出

输入包括本次模块、分配的源码文件及明确共享的公开接口。assignedSourcePaths 未提供时使用 input.sourcePaths；dependencyRefs 不能隐式增加读取权限。

| 输出内容 | 要说明的事情 |
| --- | --- |
| 分析范围 | 模块、已分析文件和涉及的符号 |
| 知识片段 | 业务行为、接口、流程和边界 |
| 源码依据 | 结论及其授权文件，必要时指出符号 |
| 未解决问题 | 缺少哪些依赖，哪些行为还不能确定 |

结果同时保留 workerId 和来源。框架将完整 JSON 保存为 knowledgeChunk，chunkRef 指向该结果；最终来源使用受信输入，不直接采用模型自报的来源。

## 3. 工作流程

### 接收分配并阅读

Application 根据分配范围创建独立材料清单、工件引用和只读工作区。Prompt、材料正文与工具工作区使用同一授权集合，不能带入父级完整源码或历史修订材料。

例如，Worker A 分到订单创建文件，Worker B 分到退款文件。两者可读取明确共享的接口，但 A 看不到 B 的退款源码。目录存在不代表目录内所有文件都已授权。

### 返回分析片段

Worker 分析每个分配文件，说明源码依据。缺少依赖、无法确定行为时，将问题列入 unresolvedQuestions，不推测缺失材料的内容。

框架校验结果后保存完整片段，连同未解决问题交给 DocGen。未解决问题还作为 unresolvedRisks 传递，不能只保留正文摘要而丢掉风险。

### 重试与复用

批次的重试和复用由 [DocGen](../../DocGenAgent.md) 管理。输入不变且结果已经提交时可复用；并发、重试或跨轮复用都不得扩大 Worker 的可见范围。

## 4. 关键约束与失败处理

analysisScope.files 必须精确覆盖分配源码，不重复、不越界，每个文件至少有一项 sourceEvidence。每项依据包含 claim、path，可带 symbol；symbols 可以为空，不要求模型伪造符号。

fragment 至少 20 字符。缺材料、字段非法、漏文件、重复覆盖或引用范围外路径都导致失败。DocGen 随后取消同批在途任务，不使用不完整批次继续汇总。

Prompt 要求覆盖分配文件、给出依据和列出不确定行为。文件覆盖和路径授权由框架检查，但它们不能证明自然语言结论符合源码语义。共同执行与取消规则见 [Agents](../../../Agents.md)。

## 5. 验收场景

- **并发材料隔离。** 创建和退款文件使用不同标记，两个 Worker 并发时检查 Prompt、保存的材料及实际工作区。每个只能看到自己的标记与共享接口，不出现父级历史。
- **重试及复用不扩权。** 对同一任务重试或下一轮复用，三个通道中的可见范围保持一致，不出现兄弟任务材料。
- **完整覆盖分配。** 分配两个文件时都必须列出并有依据；删掉一个或加入第三个文件，结果被拒绝。
- **保留缺口。** Worker 返回未解决问题后，父级收到的完整片段和风险必须保留该问题。

材料裁剪、覆盖检查及风险传递已有角色和集成回归。真实源码分析质量尚未验收，完整生产操作系统隔离由 DSH 的隔离验收另行确认。

## 6. 未实现与待定事项

按业务模块和调用关系分组、再按上下文预算拆小，并提供必要依赖的原则继续保留。分组算法、具体预算和跨模块依赖处理尚未实现，2026-09-10 已明确留待下一版本确定。

当前文件均分满足基本分派，不代表业务分组目标已完成，也不授予额外依赖的读取权限。

## 7. 实现及测试索引

角色 ID：`doc-worker`；parentAgentId：`doc-gen`。规则对应：内部管理为 IO-07；待定分组与预算为 IO-08；结构化片段为 IO-09；三通道材料边界为 AC-AGENT-104。

- 并发、重试和复用边界：[WorkerMaterialBoundary.test.ts](../../../../../../../tests/integration/WorkerMaterialBoundary.test.ts)。
- 工具工作区授权：[AgentWorkspace.test.ts](../../../../../../../tests/security/AgentWorkspace.test.ts)。
- 结果交接及批次管理：[DocGenSubAgents.test.ts](../../../../../../../tests/integration/DocGenSubAgents.test.ts)。
- 独立运行方法：[AgentDevelopment.md](../../../../../../AgentDevelopment.md)。
- 既往执行版本与产物：[AgentSpecRepairAndE2E.md](../../../../../../reports/AgentSpecRepairAndE2E.md)。

代码位置：[执行入口](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.ts)、[输入输出契约](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgentContract.ts)、[提示词与读取范围](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgentPrompt.ts)、[角色测试](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.test.ts)、[独立样例](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/examples/DocWorkerAgentSample.json)。
