<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：DocGenAgent 的职责、输入输出与确认状态。
-->
# DocGenAgent：知识正文生成与修订

代码位置：[执行入口](../../../../../src/domain/agents/docGenAgent/DocGenAgent.ts)、[输入输出契约](../../../../../src/domain/agents/docGenAgent/DocGenAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/docGenAgent/DocGenAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/docGenAgent/DocGenAgent.test.ts)、[独立样例](../../../../../src/domain/agents/docGenAgent/examples/DocGenAgentSample.json)。

角色 ID：`doc-gen`。共同执行、失败和交接协议见 [Agents](../Agents.md)。

## 职责与当前输入输出

结合源码及分块片段生成知识正文，也可根据旧正文和纠正材料定向修订。以下描述当前实现，正文内容与业务质量标准仍待逐项确认；内部 Worker 组织方式已随 main 实现。

| 边界 | 当前实现 |
| --- | --- |
| 输入 | 模块标识 `moduleId`、源码 `sourceRefs`、公开接口 `publicInterfaceRefs` |
| 内部执行参数 | `workerCount` 默认 1，允许 0～5；通过 DocGenContext.docWorkers 执行内部批次，非法数量在调用模型前失败 |
| 可选修订材料 | Worker 片段 `workerFragmentRefs`、上一版 `baseKnowledgeRef`、纠正意见 `corrections`、质量反馈 `qualityFeedback` |
| 模型输出 | `body`、`title`、`description`；正文至少 200 字符，标题与描述非空 |
| 交接输出 | `resultKind: knowledgeCandidate`，Markdown 正文工件 `bodyRef`、来源 `provenance`、变更路径、内部子任务 `workerResultRefs` 与未解决风险 |
| 权限与限制 | 修订所需旧正文和纠正材料必须由 Application 显式提供；角色声明待保存工件，Application 保存并回填引用，角色不直接发布 |

## 内部 Worker 调用与复用（当前实现）

DocGen 是外层知识生成 Agent，docWorkerAgent 位于 docGenAgent/subAgents/ 下，作为其内部源码分析 subAgent。外层 LangGraph 只调度 DocGen，不再调度 DocWorker；执行身份仍保留七种，供提示词配置、审计和独立开发使用。

DocGen 按源码路径均匀拆分任务，默认一个 Worker，最多五个；重复路径去重，不派发空任务，workerCount=0 时直接汇总。执行端负责有界并发、取消、冻结提示词、独立模型会话和工件提交。全部 Worker 成功后 DocGen 才汇总正文；失败不能产生部分候选。DocGen 结果保存 workerResultRefs，追溯每个子任务的命令、输出与片段。候选知识入库、质量检查、评测与发布仍由 Application 协调。

Worker 的提交键绑定 Run、内部任务身份、源码输入和冻结提示词；同一输入在正文修订和恢复时复用已提交片段。调整执行版本拒绝旧 Run 恢复，不提供新旧拓扑兼容分支。

组合样例见 [DocGenWithWorkersSample](../../../../../src/domain/agents/docGenAgent/examples/DocGenWithWorkersSample.json)，内部调用验证见 [DocGenSubAgents.test.ts](../../../../../tests/integration/DocGenSubAgents.test.ts)。

## 待确认与验收重点

对应 S2-03：确认知识卡片的内容和颗粒度、来源、旧版与纠正输入、质量反馈及定向修订规则。正文长度检查只证明结构下限，不证明业务质量。

固定源码样例为 [DocGenFixedSourceSample.json](../../../../../src/domain/agents/docGenAgent/examples/DocGenFixedSourceSample.json)，包含原始源码、公开接口和追加指令；[样例检查器](../../../../../src/domain/agents/docGenAgent/examples/DocGenReference.ts) 与 [样例测试](../../../../../src/domain/agents/docGenAgent/DocGenExample.test.ts) 由本角色目录维护。统一 agent:run 负责执行和提交，固定参考测试不作为生产角色阶段；操作方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。

开发步骤与证据统一记录在 [Status](../../../../Status.md)，独立运行方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。
