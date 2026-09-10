<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：七角色执行设计。
-->
# Agent 与内部 subAgent 执行设计

代码位置：[src/domain/agents/AgentRegistry.ts](../../../../src/domain/agents/AgentRegistry.ts)、[src/domain/agents/AgentExecution.ts](../../../../src/domain/agents/AgentExecution.ts)、[src/domain/agents/AgentContracts.ts](../../../../src/domain/agents/AgentContracts.ts)。


## DocGen 与 DocWorker 的归属

DocGen 是外层知识生成 Agent，docWorkerAgent 位于 docGenAgent/subAgents/ 下，作为其内部源码分析 subAgent。外层 LangGraph 只调度 DocGen，不再调度 DocWorker；执行身份仍保留七种，供提示词配置、审计和独立开发使用。

DocGen 按源码路径均匀拆分任务，默认一个 Worker，最多五个；重复路径去重，不派发空任务，workerCount=0 时直接汇总。执行端负责有界并发、取消、冻结提示词、独立模型会话和工件提交。全部 Worker 成功后 DocGen 才汇总正文；失败不能产生部分候选。DocGen 结果保存 workerResultRefs，追溯每个子任务的命令、输出与片段。候选知识入库、质量检查、评测与发布仍由 Application 协调。

Worker 的提交键绑定 Run、内部任务身份、源码输入和冻结提示词；同一输入在正文修订和恢复时复用已提交片段。调整执行版本拒绝旧 Run 恢复，不提供新旧拓扑兼容分支。

## 共同协议

每个 XxxAgent 目录有入口、Contract、Prompt、测试和显式样例；DocWorker 目录嵌套在 DocGen 内。`execute(input, context)` 的 input 使用角色专属 Payload 与已加载材料；context 注入模型 Port、promptAddon 与取消信号。入口依次检查取消和材料、构建 Prompt / Schema、调用一次模型、再次检查取消、校验输出、返回 output / payload / artifacts。格式及网络重试由 Adapter 负责，DocGen 在汇总模型调用前先完成内部 Worker 批次；其他角色仍为一次业务调用。

`RoleResult` 中 pending 引用由 Application 保存正文后绑定，Domain 不操作 CAS 路径或信封事务。材料的可见范围由角色 Prompt 定义与载荷引用共同限制，不能把完整工作流上下文交给所有角色。

## 角色契约与业务步骤

| 目录 / 角色 | 输入材料 | 返回结果与约束 |
| --- | --- | --- |
| orchestratorAgent / orchestrator | 策略、模块材料 | 校验模型输出后生成固定五类外层任务计划；计划不改变跨角色连接 |
| docGenAgent/subAgents/docWorkerAgent / doc-worker | 模块源码、公开接口、分块身份 | 文档片段和来源引用，交 DocGen 汇总 |
| docGenAgent / doc-gen | 源码、接口；可选片段、上一版、corrections、质量反馈 | body、title、description；正文至少 200 字符，待保存知识正文及来源 |
| testGenAgent / test-gen | 固定源码、接口、语言、测试策略 | 测试候选与 oracle 声明；不接收候选知识，候选命令当前不进入门禁 |
| codeAgent / code | 知识、接口、构建契约、允许生成路径 | files；动态 Schema 限定白名单，语义校验拒绝重复路径，不读取参考源码和门禁测试 |
| checkAgent / check | Diff、判据、公开接口 | blocking、字符串 findings；只返回检查意见，不修代码 |
| reviewAgent / review | 知识、评测报告、判据 | correction 为一项或 null，标准化编号并绑定可信评测证据；结果信封使用 corrections 数组 |

DocGen 修订必须由 Application 显式提供旧正文和纠正材料；Review 不能自行捏造评测引用。目前 Review 未单独绑定 Check findings 明细，不把结构迁移写成完整归因能力。

## 输出与失败

闭合 Schema 拒绝缺失字段、额外字段或角色错配；Code 额外检查路径语义。缺材料在模型前失败；取消在模型前后检查。失败由 Application / Adapter 记录，不能伪造正常业务结果。角色只有授权工具，发布、Registry 和图调度不属于角色能力。

## 开发入口

使用 `npm run agent:run -- --role code --input src/domain/agents/codeAgent/examples/CodeAgentSample.json --output /tmp/code-agent-run`，其他角色替换角色 ID 和样例。Fixture 与 DSH 都经过同一入口和提交链路；默认样例使用可控模型，`--provider dsh` 需要明确接入配置。结果为独立开发 Run，不自动评测或发布。步骤详见 [角色开发](../../../AgentDevelopment.md)。

## 独立检索方向（未实现）

SearchAgent 不属于七角色枚举。目标是 KnowledgeSearchApp 直接调用，只读已发布、当前 VERIFIED 且正文摘要有效的知识，不创建 FlywheelRun、不经 Orchestrator 或 LangGraph。当前 KnowledgeSearchApp 仍是普通查询服务，治理目录允许多状态，不能直接充作该角色的合格材料读取工具。KF-SYS-043 保持 Planned。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。

固定源码 DocGen 样例为 `docGenAgent/examples/DocGenFixedSourceSample.json`，含原始源码、公开接口和追加指令；检查器与四项迁移测试由同一角色目录拥有。统一 agent:run 负责执行和提交，固定参考测试不作为生产角色阶段。
