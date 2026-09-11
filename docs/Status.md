<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：开发任务、步骤、当前进度与验收证据索引。
-->
# 开发任务与当前进度

更新日期：2026-09-11（北京时间）。本轮开发基线：`c33787b`（已合入 DocGen/DocWorker 和站点失效断言清理）。四阶段顺序和本会话分工由用户确认；任务验收状态依据现有代码及记录填写，具体回归证据见文末。

本文件统一维护当前任务、步骤、依赖、状态和证据索引。实现细节维护在所属模块设计，验收条件引用 [Verification](specs/totalRules/Verification.md)，历史记录见 [HistoryEpitaph](HistoryEpitaph.md)。旧 DEV-019 的 R0～R4 是历史计划，与下面的新四阶段不按编号对应，也不直接继承完成勾选。

## PR #46 独立复审修复

四项问题已按补充 Spec 分别修复并提交：`2ab6f14` / `acfd714` 外部用例监督及断言失败修复、`cb104f6` router 崩溃恢复、`0fb6188` cwd 绑定、`3029d7a` PR 差异格式。原复现已拒绝伪造的 3/3，通过真实 LangGraph 故障注入及 resume 验收。最后一次原生断言修复定向 32/32、全量 314/314、浏览器 14/14、独立完整 SDK 端到端 PASS/VERIFIED。下方旧结果保留为历史，本次完整证据以 [报告首节](reports/AgentSpecRepairAndE2E.md) 为准。

交付检查必须运行 `git diff --check c33787b...HEAD` 覆盖整个 PR；干净工作区的无范围检查不能替代。

## 2026-09-11 文档与实现同步

以 PR base `c33787b` 到文档前 HEAD `e45dff4` 的实际代码差异为范围，核对七角色契约与材料、原生评测监督、cwd 绑定、路由恢复和停止交接。现有模块 Spec、Workflow/4+1 图、运行/开发指南及追踪矩阵已同步；清除 Check 空规则可通过、Review 契约待实现、旧输出计数评测和 C/C++ 配置未支持等失效描述。

本次仅修改文档。Node 24 的 Spec 校验通过（17 schemas / 7 commands / 8 results / 52 p0），文档及架构契约 28/28 通过；本轮差异和整个 PR 格式检查通过。语义按生产代码、定向用例和保留日志核对，未重新运行模型、全量业务或浏览器测试。最后代码 `acfd714` 的 314/314、浏览器 14/14 和受控 SDK PASS 仍是之前的执行证据，不记作本次重跑。

Worker 业务分组/预算/依赖、分批汇总、相似度研究、独立配置管理、资料清理、历史最优回退及 S3/S4 外部验收仍保留原目标和未完成状态。完整记录见 [报告](reports/AgentSpecRepairAndE2E.md)。

## 历史：2026-09-11 第一轮强制约束清单

下列各项先按对应 Spec 编写失败场景，再实现并验收；每项验收通过后单独提交。之前 266 项回归仅为历史证据，不关闭这些新增验收条件。

| 编号 | 功能/缺陷 | 状态 |
| --- | --- | --- |
| AC-AGENT-101 | 测试入口与辅助文件区分 | 已验收：专用 2 项及角色 7 项通过，typecheck 通过 |
| AC-AGENT-102 | 项目原生构建参数绑定 | 已验收：参数保留/不可绑定停止及测试修复复用 11 项通过，typecheck 通过 |
| AC-AGENT-103 | 每个用例的执行及证据完整性 | 已验收：逐项/C/C++/伪记录/旧缓存及相关回归 33 项通过，typecheck、Spec 校验通过 |
| AC-AGENT-104 | Worker 全通道材料授权 | 已验收：并发/重试/复用、CAS/提示词及工作区共 9 项通过，typecheck 通过 |
| AC-AGENT-105 | 统一业务轮次上限 | 已验收：总轮次/质量分支/入口恢复及领域服务 7 项通过，typecheck 通过 |
| AC-AGENT-106 | 所有人工停止分支的有效交接 | 已验收：四种停止交接及轮次回归 8 项通过，typecheck 通过 |

六项均已按 Spec 验收并分别提交；代码 `9f34a85` 全量回归 292/292，独立保留产物 SDK 端到端 PASS/VERIFIED。详细记录见 [报告](reports/AgentSpecRepairAndE2E.md)。

本轮处理六项复现缺陷；原有共享能力待办与用户明确延后事项继续在所属 Spec 保持未完成状态，不以本轮验收替代。

## 历史：2026-09-10 Spec 修复与端到端证据

代码 `4c5c580` 修复上一轮九项审查问题：绑定测试编译执行、完整重建、共享修订定位、比较规则与双侧证据、超时 Gate 引用、测试修复正文、模块选择和历史治理交接。验证为全量 266/266、UI 14/14、TypeScript 和 Spec 校验通过。独立完整 SDK 流程覆盖测试修复及两轮知识修订，最终 PASS/VERIFIED，所有中间产物保留在工作区。详细过程、产物索引和原有共享能力待办见 [修复与端到端报告](reports/AgentSpecRepairAndE2E.md)。模型响应受控，S3 外部模型及 S4 公司 CLI 业务验收状态不因此改变。

## 四阶段总览

当前处于 S2 实现审阅阶段。DocGen/DocWorker 已合入；TestGen、Code、Check、Review、Orchestrator 已按顺序完成本轮契约和生产接线，等待本轮 PR 审阅。S3 外部真实模型和 S4 公司 CLI 业务验收仍单独开展。

| 阶段 | 目标 | 状态 | 依赖与完成条件 |
| --- | --- | --- | --- |
| S1 | 按 DDD 架构重新整理代码目录 | 待验收 | 主要迁移已合入 PR #36、#37；核对分层、引用、入口和当前版本回归后完成 |
| S2 | 单个 Agent 的细化开发 | 开发中 | 沿用 S1 已稳定的角色边界，可与 S1 收尾并行；七角色分别完成设计、实现、样例和相关验证 |
| S3 | 在云端（本服务器）运行端到端测试 | 待开发 | 各角色完成 S2 后可逐个进行服务器真实调用检查；全部角色就绪后跑包含内部 Worker 的完整工作流，留下端到端证据 |
| S4 | 适配公司环境的 CodeAgent CLI，运行实际业务场景 | 待开发 | 以 S3 验收版本为基线，取得真实 CLI 协议、访问条件与业务场景后开展适配及业务验收 |

状态使用：**待开发**（测试任务表示待准备/执行）、**开发中**、**待验收**（实现或材料已就绪，仍缺验收）、**已验收**、**阻塞**（写明具体原因和解除条件）。已有代码或测试文件不等于已验收。实际执行结果另记 `PASS / FAIL / BLOCKED / NOT_RUN`；只有对应版本的必需检查全部通过且证据可查，任务才能改为已验收。

## S1：DDD 目录重整

设计依据：[DDD](specs/totalRules/DomainDrivenDesign.md)、[架构](specs/totalRules/Architecture.md)、[4+1 视图](diagrams/Views4Plus1.md)。

| 步骤 | 工作与交付 | 状态 | 验收与证据 |
| --- | --- | --- | --- |
| S1-01 | 核对 Domain、Application、Infrastructure、Interfaces 的职责、依赖及七角色归属 | 待验收 | AC-ARCH-001、002、004；PR #36 已合入，当前版本分层检查结果待补 |
| S1-02 | 核对迁移后的导入、组合根、运行入口、命名及文档/Schema 路径 | 待验收 | AC-SPEC-001、AC-SCHEMA-001；历史静态检查见交接，当前入口与路径结果待补 |
| S1-03 | 执行受影响测试及主线回归，记录最终代码版本 | 待开发 | 按 [开发指南](Development.md) 执行；当前提交的回归记录待补，历史 219 + 14 项结果不作本项通过证据 |

## S2：单个 Agent 细化开发（本会话）

每个角色已有目录、Contract、Prompt、测试和样例，本阶段在其基础上核对业务缺口并细化。下表记录当前交付范围及仍保留的扩展目标；角色契约和受控验收与 S3 真实模型验收分开，不因本轮通过而取消延期目标。

| 任务 | 角色 | 细化与验收重点 | 状态 | 当前证据 |
| --- | --- | --- | --- | --- |
| S2-01 | [Orchestrator](specs/domainFunction/agents/orchestratorAgent/OrchestratorAgent.md) | 计划输入、任务输出和失败处理；保持固定业务连接，不能由模型决定 Gate PASS | 待审阅（本轮已实现） | IO-17 已实现当前模块五类任务、轮次及材料范围校验；见 Orchestrator 角色测试和完整流程回归 |
| S2-02 | [DocWorker](specs/domainFunction/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.md) | 源码分块、片段覆盖、来源引用及材料不足处理 | 待审阅（当前范围已验收） | 内部 Worker、覆盖/证据路径、未解决问题交接、裁剪 CAS/Prompt/工作区及并发重试复用已有角色与 WorkerMaterialBoundary 回归；业务分组、预算和跨模块依赖继续延期 |
| S2-03 | [DocGen](specs/domainFunction/agents/docGenAgent/DocGenAgent.md) | 单文档汇总、拆分提案、旧版与 Correction 定向修订、描述索引 | 待验收（最小链路开发完成） | 已完成 Worker 汇总交接、单文档与章节范围校验、拆分提案及显式答复、YAML/关键词/版本索引；定向与独立入口证据见本轮开发记录。IO-08 预算分组、IO-10 分批汇总仍按原 Spec 待细化，S3 真实模型验收后续进行 |
| S2-04 | [TestGen](specs/domainFunction/agents/testGenAgent/TestGenAgent.md) | 确认输入与测试预期依据，再细化测试候选、oracle 声明和门禁接线 | 待审阅（本轮已实现） | IO-11～13、21 已实现 C/C++ 测试文件、参考校验、源码内容绑定复用及有限修复；见 TestGenExecution 和完整流程回归 |
| S2-05 | [CodeAgent](specs/domainFunction/agents/codeAgent/CodeAgent.md) | 知识卡片包含接口，项目配置提供 C/C++ 必要约束；本轮白名单与隔离限制读取，框架校验源码列表并落盘 | 待审阅（本轮已实现） | IO-03～06 已实现知识与配置裁剪、空仓库读取视图、C/C++ 输出校验；KF-SYS-044 仍保留独立配置管理的 Partial 范围 |
| S2-06 | [Check](specs/domainFunction/agents/checkAgent/CheckAgent.md) | 检查输入、判据、findings 可追溯性及只读边界 | 待审阅（本轮已实现） | IO-14、15 已实现源码/生成代码/规则输入及结构化差异报告；相似度算法继续延期 |
| S2-07 | [Review](specs/domainFunction/agents/reviewAgent/ReviewAgent.md) | 评测证据、Check findings 接入与归因、Correction 及无须修订时的输出 | 待审阅（本轮已实现） | IO-15、16 已实现两类报告输入、多条修订意见和可信证据绑定；STOPPED 精简 CAS 交接及幂等事件已验收，完整治理展示与资料清理仍待开发 |

每个角色依次执行下面四步，用任务号加后缀单独跟踪，例如 `S2-03.a`。启动角色任务时在本节追加该角色的步骤状态和证据，不为每个角色另建任务文档。

S2-03 / S2-07 补充确认 [Knowledge IO-19](specs/domainFunction/knowledge/Knowledge.md)：运行期间保留单文档飞轮过程资料；达标后保留最终文档与验收记录，替换现用文档时保留上一版；需要人工治理时由 Review 提炼问题、Application 组织精简清单，后台暂存相关证据，治理完成后再按结果清理。用户已明确达标且最终文档及验收记录保存成功后立即清理中间资料，不设置一周或其他额外保留期；治理材料交接已由 AC-AGENT-106 四类停止回归验收；自动清理仍未实现，本次按用户要求完整保留证据，未执行实际资料删除。

飞轮结束条件补充确认 [Evaluation IO-20](specs/domainFunction/evaluation/Evaluation.md)：文档达到验收标准后立即结束本次飞轮，不追加轮次追求更高分。达标自动结束并交付、最大轮次未达标或预算耗尽转人工治理属于既有设计，用户本轮重申后已移除重复待确认标记；历史最佳及关键回归回滚同样已有目标要求。具体评分和阈值细节待细化，自动回退、成本及停滞策略仍有实现缺口；达标后不再派发下一轮和总轮次上限已由受控 SDK 及轮次回归验证。

S2-04 的首次候选有限修复、源码不变复用和环境故障不修复已实现；默认一次修复，最多可配三次，验证证据见文末。

S2-03 补充确认 [DocGen IO-22](specs/domainFunction/agents/docGenAgent/DocGenAgent.md)：DocGen 生成标题、摘要和关键词，框架写入 YAML 头并建立渐进式加载索引，不新增 Agent。本分支已实现 body、title、description、keywords，YAML 写入、版本描述索引及按授权列表渐进加载；见下方本轮开发证据。

范围调整 [Association IO-23](specs/domainFunction/association/Association.md)：用户明确外部知识关联当前阶段不实现，不作为 S2 开发及当前飞轮验收的前置条件。由用户提供文档或指定知识库的来源约定仅供后续参考，关联判断角色、材料契约及关联索引接线延期；DocGen 承担关联判断的建议未确认，不纳入当前职责。IO-22 的知识文档描述、YAML 头与渐进加载索引保持当前范围。

| 后缀 | 具体步骤 | 交付与验收条件 |
| --- | --- | --- |
| a | 对照已有实现，明确输入、职责、输出、权限和失败行为 | 从 [角色索引](specs/domainFunction/agents/Agents.md) 进入并更新对应独立设计；列出本次缺口与验收场景，涉及业务接线时同步 [Workflow](specs/domainFunction/workflow/Workflow.md) |
| b | 实现角色内部步骤，调整 Contract、Prompt 和必要的上下游交接 | 代码与设计一致；公共契约/材料变化同步 Schema、消费者及验收追踪；不能只改提示词代替强制校验 |
| c | 更新独立样例和有行为判定的测试 | 覆盖正常结果、材料不足、非法输出、执行失败和适用权限边界；按 AC-SCHEMA-001 及角色相关验收场景核对 |
| d | 运行独立入口及相关回归，审查业务输出并记录证据 | 使用 [AgentDevelopment](AgentDevelopment.md) 的统一入口，记录版本、命令、结果及工件；区分 Fixture 与真实模型，完成后交给 S3 |

七角色本轮输入输出与生产接线已实现，具体边界见各角色设计和文末验证。单角色入口继续返回 NOT_EVALUATED；外部真实模型质量验收属于 S3，不能用受控输出代替。

### S2-05 当前步骤

| 步骤 | 当前进度 | 交付与后续验收 |
| --- | --- | --- |
| S2-05.a | 设计已确认并落稿 | [CodeAgent](specs/domainFunction/agents/codeAgent/CodeAgent.md)、[Application](specs/application/Application.md)、[Workspace](specs/domainFunction/workspace/Workspace.md) 定义输入、项目配置、读写范围和输出；TestGen 输入不在本次结论内 |
| S2-05.b | 已实现 | Code 仅获得 knowledgeRef 和 projectConfigurationRef，原始接口/源码不进入 Prompt 或角色工作区 |
| S2-05.c | 已实现 | C/C++ 配置、路径与材料隔离回归，真实 g++ / gcc 执行覆盖，见文末 |
| S2-05.d | 本地回归完成，待真实业务验收 | DSH SDK 受控请求与完整 C++ 飞轮回归；外部真实模型、公司 CLI 分别交 S3 / S4 |

## S3：本服务器端到端测试

| 步骤 | 工作与依赖 | 状态 | 验收与证据 |
| --- | --- | --- | --- |
| S3-01 | 固定代码与场景源码版本，准备本服务器 DSH 配置、可信参考测试、输入和输出目录 | 待开发 | 参考测试先通过；记录环境、非秘密配置摘要及场景版本，按 [Runtime](Runtime.md) 配置 |
| S3-02 | 每个角色完成 S2 后，在本服务器检查真实调用、输出与上下游材料交接 | 待开发 | 七角色分别留下 Run、结果与工件证据，核对 AC-SCHEMA-001；可逐个推进，历史 DocGen live 不能替代新版本检查 |
| S3-03 | 全部角色就绪后，在本服务器跑完整业务工作流 | 待开发 | AC-E2E-002、003：七角色真实执行、工件交接、独立评测、Gate 和唯一发布回执；保存完整 Run 证据 |
| S3-04 | 验证失败归因与修订、取消/恢复、重复提交和发布，并完成适用回归 | 待开发 | AC-E2E-001、AC-REC-001、002 及实际适用场景；自然失败与受控注入分别记录，未覆盖项保留未验收 |

本阶段不预填环境阻塞。实际缺少配置或失败时，在对应行记录原因和结果；完整闭环依赖的 oracle、归因等缺口必须在 S2 或联调中明确处理，不以已有 Fixture 用例替代真实验收。

## S4：公司环境适配与实际业务场景

| 步骤 | 工作与依赖 | 状态 | 验收与证据 |
| --- | --- | --- | --- |
| S4-01 | 核对真实 CodeAgent CLI 的版本、认证、协议、会话、工具权限及公司运行约束 | 待开发 | 获得实际协议与访问验证记录；现有自建协议夹具只作为参考 |
| S4-02 | 在现有 Adapter 上完成协议和配置适配，保留业务契约 | 待开发 | 按 [AgentAdapters](specs/infrastructure/agentAdapters/AgentAdapters.md) 补充公司环境验收条件，验证真实调用、错误、取消和材料权限；不把 DSH 的证明直接套用到 CLI |
| S4-03 | 选择并固定公司真实业务场景，执行生成、评测、修订及发布流程 | 待开发 | 明确业务预期和可信测试，按 AC-E2E-001、002 的适用行为核对；DSH 专属 AC-E2E-003 不能直接算作 CLI 验收 |
| S4-04 | 整理复现方式和业务验收结果 | 待开发 | 代码/CLI/场景版本、命令、Run、产物和业务判定可追溯；未满足项保持待验收或阻塞 |

## 证据与更新方式

每次推进步骤，更新对应任务状态，并在下表追加简要记录。记录至少包含任务/子步骤编号、日期、代码 commit（有未提交改动须说明）、执行环境、命令与退出码/测试计数、实际结果和证据位置；真实调用另记 Provider/模型或 CLI 版本、场景版本、Run ID 与工件引用。长日志放运行产物，交接或 PR 记录摘要并从这里链接，公开文档不写凭据或完整 Prompt。

| 日期 | 任务/步骤 | 版本与执行记录 | 结果 | 证据或未解决项 |
| --- | --- | --- | --- | --- |
| 2026-09-10 | S1～S4 计划登记 | 基线 `96d277b` 加本次未提交文档改动；链接、验收编号、文件清单和 diff 静态检查通过，未执行角色或端到端测试 | NOT_RUN（开发任务验收） | 用户确认四阶段与本会话负责 S2；具体角色和逐项验收待推进 |
| 2026-09-10 | S2-05.a | 基线 `96d277b` 加未提交设计改动；用户确认知识卡片、项目配置、隔离及框架落盘方案 | NOT_RUN（实现验收） | IO-03～06 已确认，新增 KF-SYS-044、045 与验收场景，实现和 C/C++ 运行证据待补；TestGen IO-02 保持确认中 |
| 2026-09-10 | S2-04.a | 基线 `6dd595f` 加未提交文档改动；用户明确 TestGen 输入源代码，不要知识卡片 | NOT_RUN（实现验收） | IO-02 输入方向已确认，替代早期卡片输入方案；测试输出、预期结果与复用仍待细化 |

## 当前实现与能力边界

### CI 文档改动触发范围（当前规则与历史验证）

基于 `f11362f` 在 `chore/ci-trigger-policy` 调整 CI：只修改根目录 Markdown 或 `docs/` 下 Markdown 的 PR 跳过自动运行；代码、配置、Schema 和混合改动继续触发，保留手动运行入口。Node 24.13.0 工作树 bootstrap 为 READY；YAML 解析与路径场景检查通过（3 个纯文档场景跳过，6 个代码/配置/Schema/混合场景保留），相关文档契约测试 5 项通过，`npm run validate:specs` 与 `git diff --check` 通过。未重跑完整业务及浏览器测试，GitHub 事件过滤的线上验证待配置合入后的新 PR；该段记录当时验证；旧 Site 基线问题随后已处理，当前检查结果以本文首节为准。

### 历史：DocGen 最小链路验证与暂定方案

2026-09-10，用户要求 DocGen 汇总的上下文控制先保留暂定设计、保证最小链路可运行，待论文调研后再定。[IO-10](specs/domainFunction/agents/docGenAgent/DocGenAgent.md) 保留分批汇总和按需补充方向，不标记最终确认；IO-07～09 已确认归属、拆分原则及 Worker 输出内容，目标实现仍待推进。

在 `docs/agent-contract-confirmation`、代码基线 `6dd595f` 加未提交文档改动、Node 24 环境执行：

```bash
npm run agent:run -- --role doc-gen --input src/domain/agents/docGenAgent/examples/DocGenWithWorkersSample.json --output /tmp/docgen-minimal-loop-20260910
```

退出码 0。Run `b339070f-f122-4eca-9513-c7d373481608`，Provider 为 Fixture，DocGen 和两个 Worker 均为 SUCCEEDED；核对两份子任务结果及片段、322 字节正文的保存内容和摘要通过。结果与审计分别位于服务器 `/tmp/docgen-minimal-loop-20260910/doc-gen-PUpHs7/result.json` 和同目录 `audit.json`，属于临时运行证据。publication=NOT_EVALUATED；模型输出为样例预设，只证明现有角色执行、汇总交接和工件保存链路，不证明真实源码分析质量、分批汇总、上下文预算或完整飞轮验收。

### 能力清单

| 范围 | 当前事实 | 未完成或未验证部分 |
| --- | --- | --- |
| Agent 结构 | 六个外层 Agent；DocWorker 位于 DocGen/subAgents，保留独立执行身份、契约、提示词与提交记录；DocGen 组织源码拆分与汇总 | 本次结构与流程回归不代表真实模型生成质量验收 |
| 跨角色流程 | Domain 定义业务连接，LangGraph 只调度外层角色；DocGen 内部 Worker 使用独立 Registry 提交与有界并发 | 旧 roleExecutionVersion 拒绝恢复；不开放动态拓扑编辑 |
| Domain 组织 | 按领域功能平级组织，已移除 services 目录和总导出 | 共享实体仍位于 Domain.ts |
| 模型接入 | DSH 原生 SDK、受控 Fixture、OpenCode Go 环境配置已实现 | 公司 CLI 真实协议未验收 |
| 评测与发布 | 候选参考校验、同源固定测试、外部逐入口监督、确定性 Gate、幂等发布和审计已实现 | 通用 oracle 质量扩展、C++ 插件、完整敌对代码沙箱和自动历史最优回退未实现 |
| 查询与关联 | 现有查询、血缘、Diff、来源和关联领域能力 | SearchAgent 直接检索链仍为 Planned |
| 资源模块 | SourceScan、Workspace、legacyOkf 已归入 Domain | 保留既有文件系统、Git 和 YAML 依赖 |
| 文档组织 | 设计集中 docs/specs，按代码模块重写；4+1 视图集中一份 | 旧规范目录、独立 security 章节与重复任务模板已移除 |

## PR #41 合并验证

2026-09-10，docs/codeagent-contract-sop 合入 main@a79b385；相对 main 仅文档改动。typecheck、validate:specs（17 schemas / 7 commands / 8 results / 52 p0）、test:architecture（1 项）及文档本地链接检查通过。未重跑全量测试或真实模型；不改变各 Agent 业务验收状态。具体合并范围与未决事项见 [合并交接](epitaph/2026-09-10-1424-pr41-docs-merge.md)。

## 历史验证口径

### DocGen 内部 Worker 重构的历史证据

2026-09-10，feat/knowledge-generation-agent 基于 main@96d277b 完成 DocGen 内部 Worker 重构。Node 24.13.0 下 typecheck、validate:specs、git diff --check 通过；定向验证 35 项通过。全量 npm test 为 229 项，227 通过、2 失败。

两项失败均已在未修改的 96d277b 独立源码快照中复现：Site 发布资产测试仍要求小写文件名，但资产为 ConsoleDev007Dev008.gif；主题测试要求 UiuxDesign.md 包含 #080b10 等颜色值，现有文档缺失。它们不是本次重构引入的问题，本分支未修改站点资源、主题规范或对应测试。

新增 DocGenWithWorkersSample CLI 组合样例通过：fixture 模式下两个 Worker 提交片段后 DocGen 汇总成功，publication=NOT_EVALUATED。本轮未调用真实模型、未做浏览器验收。验证细节与后续边界见 [本次交接](epitaph/2026-09-10-1046-docgen-internal-workers.md)。

### 更早记录与本会话范围

2026-09-08 的目录与文档整理按当时用户要求未重新运行测试，只进行类型、路径、文档结构、Schema 字节一致性与 diff 静态检查。初版七角色提交曾通过 219 项测试和 14 项 Console 测试；结果属于该历史提交，不能作为当前版本的测试结论，也不构成后续任务不运行测试的约束。

DSH 单 DocGen 范例的历史 live 验证见 [历史汇总](HistoryEpitaph.md)；2026-09-10 本次任务只登记计划与分工，没有真实模型调用。SearchAgent、C++ 插件和敌对代码沙箱继续保留为未实现能力，不因本计划自动启动；如果实际业务验收依赖这些能力，应先把依赖和任务明确登记。

<details lang="en">
<summary>English summary</summary>

Track four stages here: DDD layout, individual Agent development, end-to-end verification on this server, and company CodeAgent CLI adaptation with real business scenarios. Work is currently in stages 1 and 2; the user owns stage 2 in the 2026-09-10 session. Each task records steps, dependencies, acceptance references and revision-specific evidence. Existing code, fixtures and historical live runs do not establish current acceptance.

</details>

### S2-02 / S2-03 本轮开发（2026-09-10）

- 功能 1：DocWorker 的 IO-09 结构契约、覆盖与证据路径校验、JSON 片段和未解决问题传递已实现。DocGen 保留子任务风险；更新执行版本以阻止旧 checkpoint 混用。
- 验证：Node 24.13.0，typecheck、validate:specs 通过；DocGen/DocWorker 角色与组合测试 21 项通过。路径和结构验证不等于真实源码语义验收；未运行真实模型。

- 功能 2：DocGen 必需关键词契约、框架 YAML 头、生产候选同文档入库与版本描述索引已实现；KnowledgeSearchApp 提供显式授权的描述/正文两阶段读取。Node 24 下 typecheck、validate:specs 通过，角色、DSH 受控传输、组合、索引及飞轮 Fixture 回归共 21 项通过；不代表真实供应商业务质量验收。

- 功能 3（DocGen 收尾）：强制绑定本轮单文档修订，拒绝模块/文档错配及缺失旧版；章节纠正保护范围外正文，结果携带基础引用和纠正编号，并保留汇总风险。Node 24 下 typecheck、validate:specs 通过，角色/内部 Worker/两轮飞轮修订定向测试 16 项通过。拆分提案为下一分项，暂定汇总算法继续按 Spec 保留。

- 功能 4：DocGen 拆分建议使用 userDecisionRequired/proposalRef 保存，candidate_knowledge 不创建候选并沿既有 STOPPED 路由停止；独立入口展示原因与建议。显式 keep-single 答复绑定原模块与源码工件，后续任务只接受一份文档。角色与两轮飞轮原有测试 18 项通过，新增待决生产交接/独立入口测试 2 项通过；完整回归正在核对。

- 功能 5：统一候选入库与路由反馈使用带 YAML 的同一正文，避免描述头引起两处结构评分不一致；新增生产阶段回归覆盖，并通过 3 项相关集成测试。

### S2-03 最小链路收尾证据（2026-09-10）

本轮功能提交：`d53c008` 单文档/章节修订；`c205e89` 拆分提案与显式答复；`005c470` 入库/反馈正文一致性。承接此前 `22995a2` 的描述及索引、`7388997` 的 Worker 结构化证据交接。

- 环境：Node 24.13.0；typecheck、validate:specs（17 schemas / 7 commands / 8 results / 52 p0）、架构测试 7 项及 git diff --check 通过。
- 最终完整回归：`npm test` 共 241 项，239 PASS、2 FAIL。失败为 Site.test.ts 的发布资产小写命名断言与 UiuxDesign 缺失 #080b10 色值，与上述历史已知问题一致；本分支相对起点 42736e6 未改动这些测试、站点资产或 UI 主题规范。首次回归发现的旧执行版本断言已同步为 v4，15 项独立入口/运行配置测试复验通过；最终回归不再出现这些失败。
- agent:run 的 DocGenAgentSample（修订）、DocGenWithWorkersSample（2 个 Worker）、DocGenFixedSourceSample（固定源码）均 PASS；另以相同固定材料验证 splitProposal → 显式 keep-single → 单文档输出。已核对正文仅一份、YAML 描述可解析、修订血缘及 Worker 结果引用完整，待决场景没有 bodyRef。
- 本机输出目录：`/tmp/docgen-final-revision`、`/tmp/docgen-final-workers`、`/tmp/docgen-final-source`、`/tmp/docgen-final-split`、`/tmp/docgen-final-resume`；最终测试日志 `/tmp/docgen-final-regression.log`。这些均为 fixture 或受控模型传输验证，S3 真实供应商调用尚未执行。

S2-03 当前最小链路开发完成。IO-08 的分组预算、IO-10 的分批汇总仍按原 Spec 待细化；后续不将文件均分称为上下文预算方案。专用 Console 决策按钮、知识清理与历史最佳回退不计入本轮 DocGen 角色交付。

2026-09-10 PR 范围确认：用户同意将业务分组、上下文预算、跨模块依赖及分批汇总等未定项留待下个版本确定，本次提交已完成的 DocGen/DocWorker 最小链路供审阅。

### 站点失效断言清理（2026-09-10）

按用户要求移除 Site.test.ts 中资源文件名必须全小写、设计文档必须包含全部主题十六进制色值的断言。继续保留资源存在性/摘要/格式、实际主题色、切换行为、可读性及其他站点检查。CI 工作流未关闭。Node 24.13.0 下 site:check 12 项通过、validate:specs 通过，完整 npm test 241 项全部通过，消除了此前记录的两项站点失败。

### 后续五角色开发

用户授权按顺序完成 TestGen、Code、Check、Review、Orchestrator，每个独立功能验证后提交，全部完成统一 PR。实现范围为已确认契约和生产交接；DocGen/DocWorker 分组预算、Check 相似度算法等既有调研项不在本轮确定。


本轮功能提交：85f5b82（TestGen）、727f420（Code）、8961290（Check）、f18811e（Review）、e954652（Orchestrator）。集成收尾补充 C++ 两轮飞轮、原生 DSH SDK 受控 HTTP 接线、编译失败/崩溃的零计数失败记录、跨 Run 固定测试集与中断恢复。

新增回归覆盖：源码测试首次通过不修复、断言或编译失败有限修复、耗尽停止、环境故障与缺失执行文件不修复、配置/测试路径变化复用、同 Run 重入、gcc C 与 g++ C++ 实际执行。零测试且没有失败证据的结果不能进入通过判定。Check 原始报告和测评报告同时交给 Review，多条意见绑定可信输入并进入 DocGen 单文档修订。

外部模型的真实业务质量、公司 CLI 访问、DocWorker 语义分组/预算、Check 相似度算法、完整治理与资料清理仍未在本轮验收。

本轮最终本地证据（Node 24.13.0，代码提交 40742d6）：`npm test` 256/256 通过；`npm run test:ui` 最终整轮 14/14 通过；`npm run typecheck`、`npm run validate:specs`（17 schemas / 7 commands / 8 results / 52 P0）、`git diff --check` 通过。最后补充的契约/架构检查 13/13 通过，原生编译及计数检查 11/11 通过。浏览器首轮 Sources 刷新按钮可点击等待超时，单项重跑与最终完整重跑均通过，未修改或删除该测试。远端 CI 以本轮 PR checks 为准。
