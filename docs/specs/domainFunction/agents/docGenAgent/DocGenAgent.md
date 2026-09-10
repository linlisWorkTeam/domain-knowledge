<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：DocGenAgent 的职责、输入输出与确认状态。
-->
# DocGenAgent：知识正文生成与修订

代码位置：[执行入口](../../../../../src/domain/agents/docGenAgent/DocGenAgent.ts)、[输入输出契约](../../../../../src/domain/agents/docGenAgent/DocGenAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/docGenAgent/DocGenAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/docGenAgent/DocGenAgent.test.ts)、[独立样例](../../../../../src/domain/agents/docGenAgent/examples/DocGenAgentSample.json)。

角色 ID：`doc-gen`。共同执行、失败和交接协议见 [Agents](../Agents.md)。

## 职责与当前输入输出

结合源码及分块片段生成知识正文，也可根据旧正文和纠正材料定向修订。以下描述当前实现，最终业务输入输出仍待逐项确认。

| 边界 | 当前实现 |
| --- | --- |
| 输入 | 模块标识 `moduleId`、源码 `sourceRefs`、公开接口 `publicInterfaceRefs` |
| 可选修订材料 | Worker 片段 `workerFragmentRefs`、上一版 `baseKnowledgeRef`、纠正意见 `corrections`、质量反馈 `qualityFeedback` |
| 模型输出 | `body`、`title`、`description`；正文至少 200 字符，标题与描述非空 |
| 交接输出 | `resultKind: knowledgeCandidate`，Markdown 正文工件 `bodyRef`、来源 `provenance`、变更路径与未解决风险 |
| 权限与限制 | 修订所需旧正文和纠正材料必须由 Application 显式提供；角色声明待保存工件，Application 保存并回填引用，角色不直接发布 |

## 待确认与验收重点

对应 S2-03：确认知识卡片的内容和颗粒度、来源、旧版与纠正输入、质量反馈及定向修订规则。正文长度检查只证明结构下限，不证明业务质量。

固定源码样例为 [DocGenFixedSourceSample.json](../../../../../src/domain/agents/docGenAgent/examples/DocGenFixedSourceSample.json)，包含原始源码、公开接口和追加指令；[样例检查器](../../../../../src/domain/agents/docGenAgent/examples/DocGenReference.ts) 与 [样例测试](../../../../../src/domain/agents/docGenAgent/DocGenExample.test.ts) 由本角色目录维护。统一 agent:run 负责执行和提交，固定参考测试不作为生产角色阶段；操作方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。

开发步骤与证据统一记录在 [Status](../../../../Status.md)，独立运行方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。
