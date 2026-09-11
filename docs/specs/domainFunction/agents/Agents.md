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
| [Check](checkAgent/CheckAgent.md) | 按配置规则比较原始代码和重建代码 | 带双方原文依据的差异报告 |
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

执行顺序为：检查取消及必需材料 → 构建 Prompt/Schema → 调用模型 → 再查取消 → 校验结构和业务规则 → 返回 output/payload/artifacts。缺材料在调用前失败，额外字段、缺字段、角色错配或非法输出被拒绝；取消和失败不能提交半份成功结果。Adapter 负责网络/格式重试；Application 单独发起 TestGen 业务修复。DocGen 汇总前先完成内部 Worker 批次。

Prompt 由角色基础指令、冻结的 promptAddon、适用治理指令、本轮 AgentCommand 和授权工件正文组成；DocGen 另带内部汇总载荷。材料限制同时落实到提示词、工件和工具工作区，不能只写“禁止读取”。应用层保存正文并将 pending 引用换成实际工件引用，Domain 不直接操作 CAS、数据库或发布。

当前执行版本为 `domain-agents-v8-supervised-routing`，命令键为 `contract-v8`；不兼容的旧结果不能作为当前成功结果恢复。

独立入口示例：`npm run agent:run -- --role code --input src/domain/agents/codeAgent/examples/CodeAgentSample.json --output /tmp/code-agent-run`。默认样例使用预设回答；`--provider dsh` 需要真实接入配置。独立角色结果不自动评测或发布，操作见 [AgentDevelopment](../../../AgentDevelopment.md)。


## 实现及测试索引

代码位置：[src/domain/agents/AgentRegistry.ts](../../../../src/domain/agents/AgentRegistry.ts)、[src/domain/agents/AgentExecution.ts](../../../../src/domain/agents/AgentExecution.ts)、[src/domain/agents/AgentContracts.ts](../../../../src/domain/agents/AgentContracts.ts)。
