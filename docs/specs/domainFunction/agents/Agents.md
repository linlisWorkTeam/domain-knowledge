<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：七角色设计索引与共同执行协议。
-->
# 七角色设计索引与共同协议

代码位置：[src/domain/agents/AgentRegistry.ts](../../../../src/domain/agents/AgentRegistry.ts)、[src/domain/agents/AgentExecution.ts](../../../../src/domain/agents/AgentExecution.ts)、[src/domain/agents/AgentContracts.ts](../../../../src/domain/agents/AgentContracts.ts)。

## 角色设计索引

每个角色的职责、输入输出、权限、确认记录和验收重点由对应文档维护；本文件只维护角色索引与共同协议。角色目录与 src/domain/agents 保持对应。

| 角色 ID | 独立设计 | 职责 |
| --- | --- | --- |
| `orchestrator` | [OrchestratorAgent](orchestratorAgent/OrchestratorAgent.md) | 业务计划 |
| `doc-worker` | [DocWorkerAgent](docWorkerAgent/DocWorkerAgent.md) | 知识片段提取 |
| `doc-gen` | [DocGenAgent](docGenAgent/DocGenAgent.md) | 知识正文生成与修订 |
| `test-gen` | [TestGenAgent](testGenAgent/TestGenAgent.md) | 测试生成 |
| `code` | [CodeAgent](codeAgent/CodeAgent.md) | 代码生成 |
| `check` | [CheckAgent](checkAgent/CheckAgent.md) | 只读检查 |
| `review` | [ReviewAgent](reviewAgent/ReviewAgent.md) | 评测复核与纠正 |

## 角色划分确认

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-01 | Agent 划分与业务阶段 | 已确认 | 保留原有 Orchestrator、DocWorker、DocGen、TestGen、Code、Check、Review 七个 Agent。知识生成、知识检索、知识飞轮、知识评测、知识关联是多 Agent 协作的五个业务阶段，不分别改为五个独立 Agent。各阶段到角色的具体分工仍待逐项明确。 |

输入输出确认记录随角色维护：[TestGen IO-02](testGenAgent/TestGenAgent.md)、[CodeAgent IO-03～06](codeAgent/CodeAgent.md)。未确认项不能作为修改代码、Schema 或材料权限的依据。

## 共同协议

每个 XxxAgent 目录有入口、Contract、Prompt、测试和显式样例。`execute(input, context)` 的 input 使用角色专属 Payload 与已加载材料；context 注入模型 Port、promptAddon 与取消信号。入口依次检查取消和材料、构建 Prompt / Schema、调用一次模型、再次检查取消、校验输出、返回 output / payload / artifacts。格式及网络重试由 Adapter 负责，本轮角色不新增业务修订循环。

`RoleResult` 中 pending 引用由 Application 保存正文后绑定，Domain 不操作 CAS 路径或信封事务。材料的可见范围由角色 Prompt 定义与载荷引用共同限制，不能把完整工作流上下文交给所有角色。

## 输出与失败

闭合 Schema 拒绝缺失字段、额外字段或角色错配；Code 额外检查路径语义。缺材料在模型前失败；取消在模型前后检查。失败由 Application / Adapter 记录，不能伪造正常业务结果。角色只有授权工具，发布、Registry 和图调度不属于角色能力。

## 开发入口

使用 `npm run agent:run -- --role code --input src/domain/agents/codeAgent/examples/CodeAgentSample.json --output /tmp/code-agent-run`，其他角色替换角色 ID 和样例。Fixture 与 DSH 都经过同一入口和提交链路；默认样例使用可控模型，`--provider dsh` 需要明确接入配置。结果为独立开发 Run，不自动评测或发布。步骤详见 [角色开发](../../../AgentDevelopment.md)。

## 独立检索方向（未实现）

SearchAgent 不属于七角色枚举。目标是 KnowledgeSearchApp 直接调用，只读已发布、当前 VERIFIED 且正文摘要有效的知识，不创建 FlywheelRun、不经 Orchestrator 或 LangGraph。当前 KnowledgeSearchApp 仍是普通查询服务，治理目录允许多状态，不能直接充作该角色的合格材料读取工具。KF-SYS-043 保持 Planned。

文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
