<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：开发任务、步骤、当前进度与验收证据索引。
-->
# 开发任务与当前进度

更新日期：2026-09-10（北京时间）。代码基线：`96d277b`。四阶段顺序和本会话分工由用户确认；任务验收状态依据现有代码及记录填写，尚未逐项复验。

本文件统一维护当前任务、步骤、依赖、状态和证据索引。实现细节维护在所属模块设计，验收条件引用 [Verification](specs/totalRules/Verification.md)，历史记录见 [HistoryEpitaph](HistoryEpitaph.md)。旧 DEV-019 的 R0～R4 是历史计划，与下面的新四阶段不按编号对应，也不直接继承完成勾选。

## 四阶段总览

当前处于阶段 1、2：DDD 目录重整已有主要实现，继续收尾验收；单个 Agent 进入细化开发。**2026-09-10 本会话由用户负责阶段 2**，具体先开发哪个角色尚未指定，其他阶段负责人未指定。

| 阶段 | 目标 | 状态 | 依赖与完成条件 |
| --- | --- | --- | --- |
| S1 | 按 DDD 架构重新整理代码目录 | 待验收 | 主要迁移已合入 PR #36；核对分层、引用、入口和当前版本回归后完成 |
| S2 | 单个 Agent 的细化开发 | 开发中 | 沿用 S1 已稳定的角色边界，可与 S1 收尾并行；七角色分别完成设计、实现、样例和相关验证 |
| S3 | 在云端（本服务器）运行端到端测试 | 待开发 | 各角色完成 S2 后可逐个进行服务器真实调用检查；全部角色就绪后跑七角色完整工作流，留下端到端证据 |
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

每个角色已有目录、Contract、Prompt、测试和样例，本阶段在其基础上核对业务缺口并细化。下表的“待开发”指细化任务尚未逐项启动记录，不表示角色从零开始。表格行序不是已确定的开发优先级。

| 任务 | 角色 | 细化与验收重点 | 状态 | 当前证据 |
| --- | --- | --- | --- | --- |
| S2-01 | [Orchestrator](specs/domainFunction/agents/orchestratorAgent/OrchestratorAgent.md) | 计划输入、任务输出和失败处理；保持固定业务连接，不能由模型决定 Gate PASS | 待开发 | 已有结构；本阶段验收待补 |
| S2-02 | [DocWorker](specs/domainFunction/agents/docWorkerAgent/DocWorkerAgent.md) | 源码分块、片段覆盖、来源引用及材料不足处理 | 待开发 | 已有结构；本阶段验收待补 |
| S2-03 | [DocGen](specs/domainFunction/agents/docGenAgent/DocGenAgent.md) | 正文与来源、旧版和 Correction 输入、质量反馈及定向修订 | 待开发 | 固定源码样例及历史 live 记录可参考；本阶段验收待补 |
| S2-04 | [TestGen](specs/domainFunction/agents/testGenAgent/TestGenAgent.md) | 确认输入与测试预期依据，再细化测试候选、oracle 声明和门禁接线 | 开发中（设计确认） | S2-04.a 的 IO-02 确认中，见 [TestGen 设计](specs/domainFunction/agents/testGenAgent/TestGenAgent.md)；尚未修改实现，验收待补 |
| S2-05 | [CodeAgent](specs/domainFunction/agents/codeAgent/CodeAgent.md) | 知识卡片包含接口，项目配置提供 C/C++ 必要约束；本轮白名单与隔离限制读取，框架校验源码列表并落盘 | 开发中（设计已确认，待实现） | IO-03～06 已确认，见 [CodeAgent 设计](specs/domainFunction/agents/codeAgent/CodeAgent.md)；KF-SYS-044、045 为 Planned，代码未改，验收待补 |
| S2-06 | [Check](specs/domainFunction/agents/checkAgent/CheckAgent.md) | 检查输入、判据、findings 可追溯性及只读边界 | 待开发 | 已有结构；本阶段验收待补 |
| S2-07 | [Review](specs/domainFunction/agents/reviewAgent/ReviewAgent.md) | 评测证据、Check findings 接入与归因、Correction 及无须修订时的输出 | 待开发 | 当前未单独绑定 Check findings 明细；本阶段验收待补 |

每个角色依次执行下面四步，用任务号加后缀单独跟踪，例如 `S2-03.a`。启动角色任务时在本节追加该角色的步骤状态和证据，不为每个角色另建任务文档。

| 后缀 | 具体步骤 | 交付与验收条件 |
| --- | --- | --- |
| a | 对照已有实现，明确输入、职责、输出、权限和失败行为 | 从 [角色索引](specs/domainFunction/agents/Agents.md) 进入并更新对应独立设计；列出本次缺口与验收场景，涉及业务接线时同步 [Workflow](specs/domainFunction/services/workflow/Workflow.md) |
| b | 实现角色内部步骤，调整 Contract、Prompt 和必要的上下游交接 | 代码与设计一致；公共契约/材料变化同步 Schema、消费者及验收追踪；不能只改提示词代替强制校验 |
| c | 更新独立样例和有行为判定的测试 | 覆盖正常结果、材料不足、非法输出、执行失败和适用权限边界；按 AC-SCHEMA-001 及角色相关验收场景核对 |
| d | 运行独立入口及相关回归，审查业务输出并记录证据 | 使用 [AgentDevelopment](AgentDevelopment.md) 的统一入口，记录版本、命令、结果及工件；区分 Fixture 与真实模型，完成后交给 S3 |

当前正在逐项确认七角色输入输出：保留七个 Agent 已确认，五个业务阶段描述多 Agent 协作效果；S2-04.a 的 TestGen 输入与测试预期依据仍在确认中。S2-05.a 的目标已确认并写入设计，尚未开始实现；不是 CodeAgent 已验收。共享取消、重试、契约测试可复用，不要求七份重复测试。单角色入口结果为 `NOT_EVALUATED`，不自动执行 LangGraph、评测或发布，不能作为 S3 完整端到端通过证据。

### S2-05 当前步骤

| 步骤 | 当前进度 | 交付与后续验收 |
| --- | --- | --- |
| S2-05.a | 设计已确认并落稿 | [CodeAgent](specs/domainFunction/agents/codeAgent/CodeAgent.md)、[Application](specs/application/Application.md)、[Workspace](specs/domainFunction/workspace/Workspace.md) 定义输入、项目配置、读写范围和输出；TestGen 输入不在本次结论内 |
| S2-05.b | 待开发 | 调整角色契约、Prompt、Schema 与材料加载；移除独立接口输入及授权，按项目/场景裁剪配置并冻结，按本轮权限准备工作区和落盘 |
| S2-05.c | 待开发 | 补 C/C++ 样例和配置切换、材料隔离、输出拒绝场景，覆盖 AC-CODE-001、002、AC-CONFIG-001、AC-SEC-001；机器字段与兼容策略随实现明确 |
| S2-05.d | 待开发 | 执行相关回归及受控隔离验证，保存版本、命令、结果和工件；本服务器真实调用交 S3，公司 CLI 真实隔离交 S4，不能用旧 TypeScript 样例替代 |

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

## 当前实现与能力边界

| 范围 | 当前事实 | 未完成或未验证部分 |
| --- | --- | --- |
| 七角色结构 | Domain 独立目录、专属契约、显式注册和公共提交链已实现；固定 DocGen 示例已合入角色样例 | 结构迁移不等于七角色真实效果验收 |
| 跨角色流程 | Domain 定义业务连接，LangGraph 负责执行与 checkpoint | 不开放动态拓扑编辑 |
| 模型接入 | DSH 原生 SDK、受控 Fixture、OpenCode Go 环境配置已实现 | 公司 CLI 真实协议未验收 |
| 评测与发布 | 可信场景执行、确定性 Gate、幂等发布和审计已实现 | TestGen 候选 oracle 晋升、C++ 插件和敌对代码沙箱未实现 |
| 查询与关联 | 现有查询、血缘、Diff、来源和关联领域能力 | SearchAgent 直接检索链仍为 Planned |
| 资源模块 | SourceScan、Workspace、legacyOkf 已归入 Domain | 保留既有文件系统、Git 和 YAML 依赖 |
| 文档组织 | 设计集中 docs/specs，按代码模块重写；4+1 视图集中一份 | 旧规范目录、独立 security 章节与重复任务模板已移除 |

## 历史验证口径

2026-09-08 的目录与文档整理按当时用户要求未重新运行测试，只进行类型、路径、文档结构、Schema 字节一致性与 diff 静态检查。初版七角色提交曾通过 219 项测试和 14 项 Console 测试；结果属于该历史提交，不能作为当前版本的测试结论，也不构成后续任务不运行测试的约束。

DSH 单 DocGen 范例的历史 live 验证见 [历史汇总](HistoryEpitaph.md)；2026-09-10 本次任务只登记计划与分工，没有真实模型调用。SearchAgent、C++ 插件和敌对代码沙箱继续保留为未实现能力，不因本计划自动启动；如果实际业务验收依赖这些能力，应先把依赖和任务明确登记。

<details lang="en">
<summary>English summary</summary>

Track four stages here: DDD layout, individual Agent development, end-to-end verification on this server, and company CodeAgent CLI adaptation with real business scenarios. Work is currently in stages 1 and 2; the user owns stage 2 in the 2026-09-10 session. Each task records steps, dependencies, acceptance references and revision-specific evidence. Existing code, fixtures and historical live runs do not establish current acceptance.

</details>
