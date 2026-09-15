<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：七角色设计索引与共同执行协议。
-->
# 七个 Agent 怎么协作

这套系统要验证一件事：把源码里的业务行为写成文档后，另一个只看文档的 Agent，能不能重新写出行为正确的代码。

因此，文档写出来只是候选。系统还要生成代码、实际运行测试、分析失败原因；评测通过后才能发布为可使用的知识。

## 每个角色负责什么

| Agent | 接到的任务 | 交出的结果 |
| --- | --- | --- |
| [Orchestrator](orchestratorAgent/OrchestratorAgent.md) | 根据目标和进度选择本次处理的模块，安排任务材料 | 本轮任务计划 |
| [DocWorker](docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.md) | 阅读 DocGen 分给自己的源码 | 有源码依据的分析片段，以及没弄清的问题 |
| [DocGen](docGenAgent/DocGenAgent.md) | 汇总源码分析，或按意见修改上一版文档 | 一份候选文档；必要时提出拆分建议 |
| [TestGen](testGenAgent/TestGenAgent.md) | 根据源码和公开接口编写测试 | 测试源码和逐项用例清单 |
| [Code](codeAgent/CodeAgent.md) | 只根据候选文档和必要编写配置重建实现 | 新的 C/C++ 源文件 |
| [Check](checkAgent/CheckAgent.md) | 按配置规则比较原始代码和重建代码 | 带完整源码依据或明确单侧缺失的差异报告 |
| [Review](reviewAgent/ReviewAgent.md) | 结合差异报告和实际测试结果分析文档问题 | 指明修改位置、原因和建议的意见 |

DocWorker 是 DocGen 的内部助手，由 DocGen 分派。外层工作流只安排其余六个角色；七个角色都保留独立的提示词、执行记录和开发入口。

## 一次任务怎么走完

Orchestrator 先选定一个模块。随后，两条工作同时开始：DocGen 组织 Worker 阅读源码并写文档；TestGen 根据源码写测试，交执行器在原始实现上校验。

文档通过候选质量检查后，Code 只看这份文档重写实现。Check 对比新旧代码。等 Check 和参考测试校验都完成，再用固定下来的测试评测新实现，把差异与测试报告交给 Review。

最后由代码实现的发布判定规则（Gate）决定：通过就发布；需要修订且还有轮次，就带着意见进入下一轮；需要人工处理就停止并留下问题和证据。Agent 自己说“通过”不能代替这个判定。候选质量不足时会先反馈给 DocGen，跳过本轮代码生成。

固定流程及异常分支见 [Workflow](../workflow/Workflow.md)，图在 [4+1 视图](../../../diagrams/Views4Plus1.md)。Orchestrator 可以选任务，不能改写这套流程。

## 用一个小例子理解

假设源码中的函数返回 4，文档却写成返回 3。Code 只看文档，可能真的写出返回 3 的代码。TestGen 根据源码准备的测试要求返回 4，于是重建评测失败。Review 将失败与文档中的错误段落联系起来，DocGen 修订该段，再交 Code 重建和测试。

这只是角色分工示例。真实模型未必能一次写对或正确归因；现有完整自动化测试采用预设回答，验证系统会怎样处理这些结果。

## 几个容易混淆的词

| 文档中的词 | 这里的意思 |
| --- | --- |
| Run / 一次飞轮 | 从选择模块开始，到发布、停止或失败结束的一次任务，可以包含多轮修订 |
| 候选文档 | 已生成并保存，但还没通过行为评测的文档 |
| 固定源码 / 冻结材料 | 本次运行选定的源码版本和材料；中途不会悄悄换成另一版 |
| 工件 / Artifact | 保存下来的文档、代码、报告等产物；引用用于找到原文并校验内容摘要 |
| Gate / 发布判定 | 根据真实评测和阻塞条件决定通过、继续或停止的确定性规则 |
| checkpoint / 检查点 | 已保存的执行进度或结果，用于中断后恢复，避免重复提交 |

## 文档阅读顺序

角色页统一采用七节：职责与边界、输入与输出、工作流程、关键约束与失败处理、验收场景、未实现与待定事项、实现及测试索引。

先读前四节理解任务如何执行，再用验收场景核对成功和失败行为。第六节保留未完成设计，第七节集中列出规则编号、Contract、Prompt、实现和测试入口。流程小节按角色实际工作组织，例如 DocGen 分为首次生成、根据意见修订和提出文档拆分。

IO 编号沿用业务决定，AC-AGENT 编号沿用验收要求；同一编号可能涉及多个角色，不表示重复执行。跨角色顺序、轮次及恢复统一见 [Workflow](../workflow/Workflow.md)。文档、Contract 或实现互相矛盾时，应说明并修正差异，不能自行采用更宽松的约束。

“已实现”描述现有代码及回归覆盖；“受控”表示模型回答预设，执行器仍可能真实编译运行。它们不等于真实模型质量或部署隔离已验收。测试索引提供现有验收入口，既往版本与产物见 [报告](../../../reports/AgentSpecRepairAndE2E.md)，不表示每次文档编辑都重新执行这些测试。

尚未实现、暂定或延期的目标继续保留。缺少预算、阈值或算法决定时，要先明确设计与验收条件，不能用当前简化实现替换目标，也不能把静态文档校验当作功能完成证据。

## 已完成和仍保留的目标

七个角色都有实现、输入输出校验、样例和自动化测试。受控端到端已跑过测试修复、两轮文档修订和一次发布；这证明流程接通，不能代替真实模型质量或大型项目验收。具体版本和证据见 [验收报告](../../../reports/AgentSpecRepairAndE2E.md)。

以下决定继续保留，不因当前实现较简单就取消：

- IO-01：保留七种角色身份。“知识生成、检索、飞轮、评测、关联”是五类业务阶段，不新增五个同名 Agent；尚未接入阶段的角色分工不由当前流程推定。
- IO-19：[资料保留与清理](../knowledge/Knowledge.md)。运行期间保留过程材料；达标且最终文档及验收记录保存成功后立即清理可清理的中间材料。停止交接已实现，自动清理还没实现。
- IO-20：[结束与回退](../evaluation/Evaluation.md)。通过后立即结束，轮次耗尽转人工；历史最佳回退、成本及停滞策略仍未完成。
- IO-23：[外部知识关联](../association/Association.md) 本阶段不做，不能自行交给 DocGen。

Worker 的业务分组与预算、DocGen 分批汇总、Check 相似度研究分别保留在角色文档中。2026-09-10 已确认的延期事项仍按原决定处理。未确认的方案不能作为修改代码、输出格式或材料权限的依据。

SearchAgent 也还未实现：目标是由 Application 的 KnowledgeSearchApp 直接调用，只读已发布、当前 VERIFIED 且正文完整的授权知识，不新建 Run、不经 Orchestrator 或 LangGraph。现有多状态管理查询不能直接充当它的读取接口，KF-SYS-043 保持 Planned。

## 共同执行约定

每个角色有入口、Contract、Prompt、测试和样例。`execute(input, context)` 接收该角色的 Payload 与已加载材料；context 提供模型执行接口、effectivePrompt、iteration 和取消信号。

执行顺序为：检查取消及必需材料 → 构建 Prompt/Schema → 调用模型 → 再查取消 → 校验结构和业务规则 → 返回 output/payload/artifacts。缺材料在调用前失败，额外字段、缺字段、角色错配或非法输出被拒绝；取消和失败不能提交半份成功结果。Adapter 默认负责网络/格式重试；Check 禁用适配器嵌套重试，在角色内统一处理两次报告修正；Application 单独发起 TestGen 业务修复。DocGen 汇总前先完成内部 Worker 批次。

Prompt 由角色基础指令、冻结的 promptAddon、适用治理指令、本轮 AgentCommand 和授权工件正文组成；DocGen 另带内部汇总载荷。材料限制同时落实到提示词、工件和工具工作区，不能只写“禁止读取”。应用层保存正文并将 pending 引用换成实际工件引用，Domain 不直接操作 CAS、数据库或发布。

当前执行版本为 `domain-agents-v10-check-evidence-guards`，命令键为 `contract-v10`；不兼容的旧结果不能作为当前成功结果恢复。

独立入口示例：`npm run agent:run -- --role code --input src/domain/agents/codeAgent/examples/CodeAgentSample.json --output /tmp/code-agent-run`。默认样例使用预设回答；`--provider dsh` 需要真实接入配置。独立角色结果不自动评测或发布，操作见 [AgentDevelopment](../../../AgentDevelopment.md)。


## 实现及测试索引

代码位置：[src/domain/agents/AgentRegistry.ts](../../../../src/domain/agents/AgentRegistry.ts)、[src/domain/agents/AgentExecution.ts](../../../../src/domain/agents/AgentExecution.ts)、[src/domain/agents/AgentContracts.ts](../../../../src/domain/agents/AgentContracts.ts)。


领域外调用角色统一经过 `src/domain/workflow/AgentExecutionService.ts`；本目录拥有角色内部实现和共享契约。服务负责选择已注册角色，角色负责生成步骤，Application 负责材料与持久化。association / evaluation 的确定性规则归各自服务，详见 [领域边界](../../totalRules/DomainDrivenDesign.md)。开发时的 subagent 委派遵循 [并行协作规则](../../totalRules/CodeTaste.md#开发过程中的-subagent-并行协作)。

工作台的分阶段生成、事实提取与证据修订使用显式 section-doc-v1、source-facts-v1、workbench-review-v1；默认角色契约和 Check 的 check-report-v2 见各角色页，不能混用。

## 阶段反馈、预算与恢复

`domain-agents-v11-workbench-evidence` 冻结默认及显式工作台模型契约，旧角色结果/知识正文仍可读，但旧执行版本禁止恢复。`StageValidationIssue` 只携带确定性错误码、字段和受信修正建议，不把模型错误文本作为指令。反馈使用原材料、工具和路径授权，不能扩大修订范围。TestGen 的参考行为校验失败仍直接拒绝并保留候选；阶段反馈不读取 oracle 结果去修改测试预期。

Application 的 `RoleExecutionService` 在模型调用前保存 STARTED 次数，返回后保存 PASSED/REJECTED/FAILED 与原始模型输出到 CAS，并关联 `ArtifactCommitted(kind=role-stage-attempt)` 审计事件。失败尝试不进入成功角色信封；历史失败工件不覆盖。恢复重用已通过阶段，失败或中断尝试消耗额度，不因重启获得第三次尝试。阶段首次开始时间亦持久化，恢复不重置阶段截止时间。

DocWorker extract：180 秒、最多 8192 输出 token；DocGen outline：90 秒、2048；body/revision：240 秒、12288。时间上限包含排队、格式重试及语义反馈，两次语义尝试共享同一截止时间，Provider 配置更低时取更低输出上限。取消/超时沿模型 Port 传给真实子进程，等待清理后返回。持久化失败不能触发额外模型调用。

Review 的提示材料由程序提取当前知识的唯一 H2 与完整 knowledgePath 列表；H3/H4 和围栏示例不授权。模型必须选用已有 H2，严格范围校验保持不变，不能通过改写失败输出绕过。


## 工作台知识风险的证据复核

代码：[KnowledgeRisks.ts](../../../../src/domain/knowledge/KnowledgeRisks.ts)。当前执行禁止旧版本检查点恢复；历史输出和失败记录继续可读，不重判旧门禁。`knowledge-risk-v1` 原始记录包含稳定 riskId、来源工件、种类与声明；`knowledge-risk-assessment-v1` 工件绑定 runId、versionId、iteration 和每项证据。报告独立使用 knowledgeRiskBlocking，原因 KNOWLEDGE_RISK_UNRESOLVED，不再混入 CHECK_BLOCKING。

普通 unresolvedRisks 是任意缺证据声明，始终 OPEN，不能靠 Review PASS、字符串分类或测试总分自动关闭。DocWorker 可以另外声明 verificationNeeds 的三个预定义编号；编号不接受自定义描述，由 Domain 生成精确范围声明：MODULE_BEHAVIOR_TESTS 只要求当前版本固定与晋升案例全部通过；SYSTEM_INTEGRATION 与 OUTSIDE_PUBLIC_TYPES 只在冻结 moduleContract 限定独立模块公开类型验收时记 OUT_OF_SCOPE，仍保留未验证限制。不能用预定义事项替换具体源码缺失、未知行为或安全缺陷。

Domain 按 Application 绑定的冻结场景与本轮可信评测逐项形成 OPEN / VERIFIED / OUT_OF_SCOPE。只有完整、非空、无基础设施失败、稳定性为 1 的通过评测能验证 MODULE_BEHAVIOR_TESTS；不声称覆盖所有输入。没有模块契约或证据不足保持 OPEN；未知种类和篡改的声明不能通过。每轮重新评估，不沿用上一版本的通过。原始记录不删除、不修改，处置工件作为门禁 evidenceRefs 保存，可从 Console 评测证据下载；页面独立显示知识风险原因。

本版普通自由文本缺证据风险尚不支持自动解除，需要补充材料后重新提取事实；不提供任意风险的模型自评清除接口。验收覆盖失败后修订通过且保留逐轮风险审计、未解决风险拒绝、缺少范围证据、跨版本评测不复用及旧版本拒绝恢复。

Review evidence-attribution 阶段为 180 秒，PASS 与阻塞/修订/未解决风险矛盾时最多反馈一次，保留两次输出与共享截止时间。反馈要求保留实际风险并选择 ITERATE，不能通过清空风险满足格式；权限与传输失败不重试。DocWorker 在字段 Schema 中明确风险、待验证事项和适用限制的职责，未来版本及未承诺的性能上界不等于当前源码行为未知；具体安全缺陷仍阻止发布。旧风险及失败门禁不重分类、不删除。

工作台使用冻结预算策略，不因恢复重置累计用量；用户取消、额度拒绝、阶段期限或连续无进展时保留已提交证据并停止或暂停。供应商额度未知不能解释为无限额度。


### Review 的证据范围约束

调用方可在 criteriaRef 指向的受信对象中提供 allowedKnowledgePaths。Review 在调用模型前校验每项属于当前卡片唯一现有 H2，并将相同集合用于提示词目标列表、动态输出 Schema 的 knowledgePath/targetHeading 枚举和角色输出校验。未提供此字段时保持原有全文 H2 范围。不得先接受越界角色结果，再依赖应用层拒绝形成无法恢复的成功缓存。工作台与默认项目使用显式不同契约，已有执行不跨版本迁移。

Check 的 check-report-v2 及源码证据组装见角色页。原有命令/结果信封保持兼容，旧运行只读，不复用其 checkpoint 继续新执行。
