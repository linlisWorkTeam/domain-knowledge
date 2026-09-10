<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：七角色执行设计。
-->
# 七角色执行设计

代码位置：[src/domain/agents/AgentRegistry.ts](../../../../src/domain/agents/AgentRegistry.ts)、[src/domain/agents/AgentExecution.ts](../../../../src/domain/agents/AgentExecution.ts)、[src/domain/agents/AgentContracts.ts](../../../../src/domain/agents/AgentContracts.ts)。


领域外调用角色统一经过 `src/domain/services/workflow/AgentExecutionService.ts`；本目录拥有角色内部实现和共享契约。服务负责选择已注册角色，角色负责生成步骤，Application 负责材料与持久化。association / evaluation 的确定性规则归各自服务，详见 [领域边界](../../totalRules/DomainDrivenDesign.md)。开发时的 subagent 委派遵循 [并行协作规则](../../totalRules/CodeTaste.md#开发过程中的-subagent-并行协作)。

## 共同协议

每个 XxxAgent 目录有入口、Contract、Prompt、测试和显式样例。`execute(input, context)` 的 input 使用角色专属 Payload 与已加载材料；context 注入模型 Port、promptAddon 与取消信号。入口依次检查取消和材料、构建 Prompt / Schema、按角色阶段调用模型、每阶段后再次检查取消并校验输出，最终返回 output / payload / artifacts。格式重试由 Adapter 负责；DocWorker/DocGen 的可定位语义错误由阶段执行器最多反馈修正一次，权限、材料、传输错误不自动重试。

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

知识角色使用阶段标识：Orchestrator 为 `plan`，DocWorker 为 `extract`，DocGen 首次为 `outline`、`body`，修订为 `revision`。每阶段首次请求保留原阶段标识，修正请求使用 `<stage>:attempt-2`，会话/工作区/幂等键因此隔离；阶段之间共享调用方取消信号和 3 轮/30 分钟总预算。

DocWorker 的 `sourceRefs` 由 Application 加载固定提交内容，支持 `{path, commit, content, sha256}`、含相同文件对象的 `files` 清单，或单一路径的裸源码字符串。仅含摘要的 manifest 不能证明模型引用；模型仅返回已编号源码中的路径与闭区间，不接收模型自填 quote。空白选区不能作为事实证据；程序按范围提取原文，形成与旧记录相同的完整事实工件；每项 fact 的路径须属于已分配源码，quote 必须等于 `startLine..endLine` 的源码逐行文本（LF 连接）。缺少接口、行为或边界类别时必须记录证据缺口；未经核验的额外材料不能补齐引用。语义解释仍需后续测试门禁验证，原文匹配不代表解释已经正确。

DocGen 首次生成先验证唯一 H2 概要，再按冻结顺序生成 `section-1` 等编号交给正文阶段。模型返回 title、description 与 `sections[{sectionId,body}]`；程序生成 H1/H2 骨架，正文 H2 顺序、title 和 description 必须匹配，概要保存为审计工件。文档标题必须单行，章节 body 禁止单独 CR、围栏外 H1/H2、Setext 标题与未闭合围栏，重复或缺漏章节允许一次有定位信息的反馈，未知编号直接拒绝。已有版本修订必须由 Application 显式提供旧正文和带有效证据的 Correction，不能用质量反馈授权全文改写。`knowledgePath` 为 `knowledge/<moduleId>.md#<精确 H2 标题>`；标题必须在旧正文中唯一，代码块中的伪标题不算章节。修订只向模型请求授权编号的章节体，程序按旧正文偏移逆序替换内容，再执行既有范围校验。每个指名 H2 必须实际改变，所有未指名章节、文档前言、H2 标题和章节顺序逐字保持。当前修订粒度为 H2，显式 `range` 字段拒绝执行，避免把细粒度授权扩大到整节；更细范围协议尚未交付。

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


## 阶段反馈、预算与恢复

`seven-role-mvp-v3` 更改模型内部契约，旧角色结果/知识正文仍可读，但旧执行版本禁止恢复。`StageValidationIssue` 只携带确定性错误码、字段和受信修正建议，不把模型错误文本作为指令。反馈使用原材料、工具和路径授权，不能扩大修订范围。TestGen 的参考行为校验失败仍直接拒绝并保留候选；阶段反馈不读取 oracle 结果去修改测试预期。

Application 的 `RoleExecutionService` 在模型调用前保存 STARTED 次数，返回后保存 PASSED/REJECTED/FAILED 与原始模型输出到 CAS，并关联 `ArtifactCommitted(kind=role-stage-attempt)` 审计事件。失败尝试不进入成功角色信封；历史失败工件不覆盖。恢复重用已通过阶段，失败或中断尝试消耗额度，不因重启获得第三次尝试。阶段首次开始时间亦持久化，恢复不重置阶段截止时间。

DocWorker extract：180 秒、最多 8192 输出 token；DocGen outline：90 秒、2048；body/revision：240 秒、12288。时间上限包含排队、格式重试及语义反馈，两次语义尝试共享同一截止时间，Provider 配置更低时取更低输出上限。取消/超时沿模型 Port 传给真实子进程，等待清理后返回。持久化失败不能触发额外模型调用。

Review 的提示材料由程序提取当前知识的唯一 H2 与完整 knowledgePath 列表；H3/H4 和围栏示例不授权。模型必须选用已有 H2，严格范围校验保持不变，不能通过改写失败输出绕过。


## 知识风险的证据复核（执行版本 v4）

代码：[KnowledgeRisks.ts](../../../../src/domain/services/knowledge/KnowledgeRisks.ts)。`seven-role-mvp-v4` 禁止旧 v3 检查点恢复；历史输出和失败记录继续可读，不重判旧门禁。`knowledge-risk-v1` 原始记录包含稳定 riskId、来源工件、种类与声明；`knowledge-risk-assessment-v1` 工件绑定 runId、versionId、iteration 和每项证据。报告独立使用 knowledgeRiskBlocking，原因 KNOWLEDGE_RISK_UNRESOLVED，不再混入 CHECK_BLOCKING。

普通 unresolvedRisks 是任意缺证据声明，始终 OPEN，不能靠 Review PASS、字符串分类或测试总分自动关闭。DocWorker 可以另外声明 verificationNeeds 的三个预定义编号；编号不接受自定义描述，由 Domain 生成精确范围声明：MODULE_BEHAVIOR_TESTS 只要求当前版本固定与晋升案例全部通过；SYSTEM_INTEGRATION 与 OUTSIDE_PUBLIC_TYPES 只在冻结 moduleContract 限定独立模块公开类型验收时记 OUT_OF_SCOPE，仍保留未验证限制。不能用预定义事项替换具体源码缺失、未知行为或安全缺陷。

Domain 按 Application 绑定的冻结场景与本轮可信评测逐项形成 OPEN / VERIFIED / OUT_OF_SCOPE。只有完整、非空、无基础设施失败、稳定性为 1 的通过评测能验证 MODULE_BEHAVIOR_TESTS；不声称覆盖所有输入。没有模块契约或证据不足保持 OPEN；未知种类和篡改的声明不能通过。每轮重新评估，不沿用上一版本的通过。原始记录不删除、不修改，处置工件作为门禁 evidenceRefs 保存，可从 Console 评测证据下载；页面独立显示知识风险原因。

本版普通自由文本缺证据风险尚不支持自动解除，需要补充材料后重新提取事实；不提供任意风险的模型自评清除接口。验收覆盖失败后修订通过且保留逐轮风险审计、未解决风险拒绝、缺少范围证据、跨版本评测不复用及旧版本拒绝恢复。
