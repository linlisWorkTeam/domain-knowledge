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
| `doc-worker` | [DocWorkerAgent](docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.md) | 知识片段提取 |
| `doc-gen` | [DocGenAgent](docGenAgent/DocGenAgent.md) | 知识正文生成与修订 |
| `test-gen` | [TestGenAgent](testGenAgent/TestGenAgent.md) | 测试生成 |
| `code` | [CodeAgent](codeAgent/CodeAgent.md) | 代码生成 |
| `check` | [CheckAgent](checkAgent/CheckAgent.md) | 只读检查 |
| `review` | [ReviewAgent](reviewAgent/ReviewAgent.md) | 评测复核与纠正 |

## 角色划分确认

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-01 | Agent 划分与业务阶段 | 已确认 | 保留原有 Orchestrator、DocWorker、DocGen、TestGen、Code、Check、Review 七种执行身份；当前 main 已将 DocWorker 收入 DocGen 内部，六个外层 Agent 由 LangGraph 调度。知识生成、知识检索、知识飞轮、知识评测、知识关联是多 Agent 协作的五个业务阶段，不分别改为五个独立 Agent。各阶段到角色的具体分工仍待逐项明确。 |

输入输出确认记录随角色维护：[TestGen IO-02](testGenAgent/TestGenAgent.md)、[CodeAgent IO-03～06](codeAgent/CodeAgent.md)。未确认项不能作为修改代码、Schema 或材料权限的依据。

TestGen 的业务输入已明确为源代码，不接收或读取知识卡片；[IO-11～13、IO-21](testGenAgent/TestGenAgent.md) 中输出 C/C++ 测试源码和用例清单已确认，由后续执行器运行；先在原始源码上校验测试的流程暂时保留。已有用例在输入源代码不变时保持不变，不因知识卡片、生成代码或配置变化重新生成。首次候选校验失败时交 TestGen 有限修复，仍失败转人工，仅作为异常兜底；具体重试配置与源码变化识别待落实。

[DocWorker IO-07～09](docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.md) 已确认内部子 Agent 归属、上下文控制目的、任务拆分原则及片段输出内容；DocGen 负责汇总、去重、处理矛盾并组织知识卡片。具体预算、跨模块依赖、机器字段和汇总机制继续确认。

[DocGen IO-10](docGenAgent/DocGenAgent.md) 的分批汇总与按需补充方案暂定保留，先保持最小知识生成链路可运行，待用户论文调研后再确认；不作为最终设计或已实现能力。

[CheckAgent IO-14～15](checkAgent/CheckAgent.md) 已确认输入原始源码、CodeAgent 生成的临时代码和比较规则，输出比较结果及差异依据。评测输出测试结果后，Review 同时读取两者分析知识问题；具体比较规则与相似度算法待论文调研，证据交接尚未完整实现。

[ReviewAgent IO-16](reviewAgent/ReviewAgent.md) 已确认输出包含位置、问题、依据和建议的知识卡片修订意见列表，交 DocGen 修改；没有修订意见时返回空列表，机器契约待实现。

[Orchestrator IO-17](orchestratorAgent/OrchestratorAgent.md) 已确认输入业务目标、模块概况、项目配置及任务进度，输出本轮模块、承接 Agent 和输入材料的任务计划；执行顺序、内部 Worker 拆分及测试复用由各自既定规则负责。

[DocGen IO-18](docGenAgent/DocGenAgent.md) 已修正为：DocWorker 产出默认由 DocGen 合成一份知识文档；内容过大而建议拆分时先与用户沟通，以用户意见为准。每次飞轮只输入并修订一份文档，不自动批量修改多份文档；用户沟通机制与边界验收待落实。版本保留与清理按 IO-19，结束行为按 IO-20；历史最佳与关键回归回滚已有目标要求，具体实现待落实。

[Knowledge IO-19](../knowledge/Knowledge.md) 补充确认过程资料保留与治理范围：运行期间保留，达标后保留最终文档与简短验收记录，需要人工治理时提供精简问题清单并暂存相关证据。达标且最终文档及验收记录保存成功后立即清理中间资料，不设额外保留期，规则尚未实现；达标自动结束并交付、轮次或预算耗尽转人工治理沿用 [Evaluation IO-20](../evaluation/Evaluation.md)，不新增人工确认。

[DocGen IO-22](docGenAgent/DocGenAgent.md) 已确认知识索引分工：DocGen 生成标题、摘要和关键词，框架写入 YAML 头并建立支持渐进式加载的索引，不新增 Agent。相关机器契约及索引链路待实现，不改变单文档飞轮及各角色读取边界。

[Association IO-23](../association/Association.md) 已明确外部知识关联当前阶段不实现，来源约定仅保留供后续参考，角色分工不再作为当前待确认项。此前建议由 DocGen 判断关联未获确认，不扩展其当前职责；IO-22 的文档描述与渐进加载索引仍在当前范围内。

## DocGen 与 DocWorker 的归属

当前为六个外层 Agent 加 DocGen 内部的 DocWorker，共保留七种执行身份。具体拆分、汇总和复用规则见 [DocGenAgent](docGenAgent/DocGenAgent.md)，Worker 契约见 [DocWorkerAgent](docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.md)。

## 共同协议

每个 XxxAgent 目录有入口、Contract、Prompt、测试和显式样例；DocWorker 目录嵌套在 DocGen 内。`execute(input, context)` 的 input 使用角色专属 Payload 与已加载材料；context 注入模型 Port、promptAddon 与取消信号。入口依次检查取消和材料、构建 Prompt / Schema、调用一次模型、再次检查取消、校验输出、返回 output / payload / artifacts。格式及网络重试由 Adapter 负责，DocGen 在汇总模型调用前先完成内部 Worker 批次；其他角色仍为一次业务调用。

`RoleResult` 中 pending 引用由 Application 保存正文后绑定，Domain 不操作 CAS 路径或信封事务。材料的可见范围由角色 Prompt 定义与载荷引用共同限制，不能把完整工作流上下文交给所有角色。

## 输出与失败

闭合 Schema 拒绝缺失字段、额外字段或角色错配；Code 额外检查路径语义。缺材料在模型前失败；取消在模型前后检查。失败由 Application / Adapter 记录，不能伪造正常业务结果。角色只有授权工具，发布、Registry 和图调度不属于角色能力。

## 开发入口

使用 `npm run agent:run -- --role code --input src/domain/agents/codeAgent/examples/CodeAgentSample.json --output /tmp/code-agent-run`，其他角色替换角色 ID 和样例。Fixture 与 DSH 都经过同一入口和提交链路；默认样例使用可控模型，`--provider dsh` 需要明确接入配置。结果为独立开发 Run，不自动评测或发布。步骤详见 [角色开发](../../../AgentDevelopment.md)。

## 独立检索方向（未实现）

SearchAgent 不属于七角色枚举。目标是 KnowledgeSearchApp 直接调用，只读已发布、当前 VERIFIED 且正文摘要有效的知识，不创建 FlywheelRun、不经 Orchestrator 或 LangGraph。当前 KnowledgeSearchApp 仍是普通查询服务，治理目录允许多状态，不能直接充作该角色的合格材料读取工具。KF-SYS-043 保持 Planned。

文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
