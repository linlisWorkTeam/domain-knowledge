<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：七角色执行设计。
-->
# 七角色执行设计

代码位置：[src/domain/agents/AgentRegistry.ts](../../../../src/domain/agents/AgentRegistry.ts)、[src/domain/agents/AgentExecution.ts](../../../../src/domain/agents/AgentExecution.ts)、[src/domain/agents/AgentContracts.ts](../../../../src/domain/agents/AgentContracts.ts)。


## 共同协议

每个 XxxAgent 目录有入口、Contract、Prompt、测试和显式样例。`execute(input, context)` 的 input 使用角色专属 Payload 与已加载材料；context 注入模型 Port、promptAddon 与取消信号。入口依次检查取消和材料、构建 Prompt / Schema、按角色阶段调用模型、每阶段后再次检查取消并校验输出，最终返回 output / payload / artifacts。格式及网络重试由 Adapter 负责，本轮角色不新增业务修订循环。

`RoleResult` 中 pending 引用由 Application 保存正文后绑定，Domain 不操作 CAS 路径或信封事务。材料的可见范围由角色 Prompt 定义与载荷引用共同限制，不能把完整工作流上下文交给所有角色。

## 角色契约与业务步骤

| 目录 / 角色 | 输入材料 | 返回结果与约束 |
| --- | --- | --- |
| orchestratorAgent / orchestrator | 策略、模块材料 | 模型返回固定六类 tasks（role、objective、sourcePaths、dependsOn）；确定性检查完备性、当前轮次、授权源码范围和固定依赖，计划不改变跨角色连接 |
| docWorkerAgent / doc-worker | 模块源码、公开接口、分块身份 | fragment、facts、provenance、unresolvedRisks；facts 区分接口/行为/边界，路径与闭区间行号 quote 必须逐行匹配授权源码工件，JSON 片段交 DocGen 汇总 |
| docGenAgent / doc-gen | 源码、接口；可选片段、上一版、corrections、质量反馈 | 首次 outline → body；修订 revision。正文至少 200 字符，标题顺序和元数据须落实概要，保留概要工件、正文和来源 |
| testGenAgent / test-gen | 固定源码、接口、语言、测试策略 | 测试候选与 oracle 声明；不接收候选知识，候选命令当前不进入门禁 |
| codeAgent / code | 知识、接口、构建契约、允许生成路径 | files；动态 Schema 限定白名单，语义校验拒绝重复路径，不读取参考源码和门禁测试 |
| checkAgent / check | Diff、判据、公开接口 | blocking、字符串 findings；只返回检查意见，不修代码 |
| reviewAgent / review | 知识、评测报告、判据 | correction 为一项或 null，标准化编号并绑定可信评测证据；结果信封使用 corrections 数组 |

知识角色使用阶段标识：Orchestrator 为 `plan`，DocWorker 为 `extract`，DocGen 首次为 `outline`、`body`，修订为 `revision`。模型 Adapter 负责格式修复及网络重试，Domain 不新增重试循环；阶段之间共享调用方取消信号和运行预算。

DocWorker 的 `sourceRefs` 由 Application 加载固定提交内容，支持 `{path, commit, content, sha256}`、含相同文件对象的 `files` 清单，或单一路径的裸源码字符串。仅含摘要的 manifest 不能证明模型引用；每项 fact 的路径须属于已分配源码，quote 必须等于 `startLine..endLine` 的源码逐行文本（LF 连接）。缺少接口、行为或边界类别时必须记录证据缺口；未经核验的额外材料不能补齐引用。语义解释仍需后续测试门禁验证，原文匹配不代表解释已经正确。

DocGen 首次生成先验证唯一 H2 概要，再把概要交给正文阶段；正文 H2 顺序、title 和 description 必须匹配，概要保存为审计工件。已有版本修订必须由 Application 显式提供旧正文和带有效证据的 Correction，不能用质量反馈授权全文改写。`knowledgePath` 为 `knowledge/<moduleId>.md#<精确 H2 标题>`；标题必须在旧正文中唯一，代码块中的伪标题不算章节。每个指名 H2 必须实际改变，所有未指名章节、文档前言、H2 标题和章节顺序逐字保持。当前修订粒度为 H2，显式 `range` 字段拒绝执行，避免把细粒度授权扩大到整节；更细范围协议尚未交付。

Review 不能自行捏造评测引用；反馈证据的加载与绑定属于 Application。

## 输出与失败

闭合 Schema 拒绝缺失字段、额外字段或角色错配；Code 额外检查路径语义。缺材料在模型前失败；取消在模型前后检查。失败由 Application / Adapter 记录，不能伪造正常业务结果。角色只有授权工具，发布、Registry 和图调度不属于角色能力。

## 开发入口

使用 `npm run agent:run -- --role code --input src/domain/agents/codeAgent/examples/CodeAgentSample.json --output /tmp/code-agent-run`，其他角色替换角色 ID 和样例。Fixture 与 DSH 都经过同一入口和提交链路；默认样例使用可控模型，`--provider dsh` 需要明确接入配置。结果为独立开发 Run，不自动评测或发布。步骤详见 [角色开发](../../../AgentDevelopment.md)。

## 独立检索方向（未实现）

SearchAgent 不属于七角色枚举。目标是 KnowledgeSearchApp 直接调用，只读已发布、当前 VERIFIED 且正文摘要有效的知识，不创建 FlywheelRun、不经 Orchestrator 或 LangGraph。当前 KnowledgeSearchApp 仍是普通查询服务，治理目录允许多状态，不能直接充作该角色的合格材料读取工具。KF-SYS-043 保持 Planned。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。

固定源码 DocGen 样例为 `docGenAgent/examples/DocGenFixedSourceSample.json`，含原始源码、公开接口和追加指令；检查器与四项迁移测试由同一角色目录拥有。统一 agent:run 负责执行和提交，固定参考测试不作为生产角色阶段。

真实验收发现的输出错误保留为失败证据，不修改候选预期或门禁。角色提示应明确模块范围内的静态推导与系统集成范围限制，候选案例先验证分支前置条件；正文阶段直接给出概要对应的精确 H2 标题行。确定性结构校验、风险拒绝和参考实现晋升规则保持有效。
