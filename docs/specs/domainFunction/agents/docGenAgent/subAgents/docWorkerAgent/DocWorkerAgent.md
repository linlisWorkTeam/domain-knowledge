<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：DocWorkerAgent 的职责、输入输出与确认状态。
-->
# DocWorkerAgent：知识片段提取

代码位置：[执行入口](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.ts)、[输入输出契约](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgentContract.ts)、[提示词与读取范围](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgentPrompt.ts)、[角色测试](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.test.ts)、[独立样例](../../../../../../../src/domain/agents/docGenAgent/subAgents/docWorkerAgent/examples/DocWorkerAgentSample.json)。

角色 ID：`doc-worker`，`parentAgentId: doc-gen`；保留独立开发入口，外层 LangGraph 不直接调度。共同执行、失败和交接协议见 [Agents](../../../Agents.md)。

## 职责与当前输入输出

作为 DocGen 内部 subAgent，从分配给本 Worker 的源码中提取知识片段，交给 [DocGenAgent](../../DocGenAgent.md) 汇总。以下描述当前实现，片段内容、覆盖与材料不足策略仍待逐项确认；调用归属已随 main 实现。

| 边界 | 当前实现 |
| --- | --- |
| 输入 | 模块标识 `moduleId`、源码 `sourceRefs`、公开接口 `publicInterfaceRefs`；可选分配路径 `assignedSourcePaths` 和依赖材料 `dependencyRefs` |
| 可读文件 | 分配的源码路径（未提供时使用 input.sourcePaths）及公开接口路径 |
| 模型输出 | `workerId`、`fragment`、`provenance`；片段至少 20 字符，模型来源列表至少一项 |
| 交接输出 | `resultKind: knowledgeChunk`，片段工件 `chunkRef`、受信输入的 `provenance`、`unresolvedRisks` |
| 权限与限制 | 只提取片段，不发布知识或决定门禁；交接来源使用 input.provenance，不直接信任模型自报来源 |

## 待确认与验收重点

对应 S2-02：源码如何分块、片段覆盖范围、来源引用和材料不足处理仍需细化。验证片段结构与实际覆盖分别进行，不能把满足最小长度当作知识完整。

开发步骤与证据统一记录在 [Status](../../../../../../Status.md)，独立运行方法见 [AgentDevelopment](../../../../../../AgentDevelopment.md)。
