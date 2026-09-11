<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：维护持久路线图、能力边界与关键验收索引。
-->
# 开发任务与当前进度

本文件只在 roadmap、能力边界或验收状态发生持久变化时更新。普通任务的命令、临时分工和验证流水记录在 PR、commit 或必要交接中，不要求每次同步 Status。实施方法与 CI 范围见 [Development](Development.md)，设计见 [规范目录](specs/README.md)。

## 四阶段总览

当前处于 S2 实现审阅阶段。DocGen/DocWorker 已合入；TestGen、Code、Check、Review、Orchestrator 已按顺序完成已确认契约和生产接线，业务验收边界见下表。S3 外部真实模型和 S4 公司 CLI 业务验收仍单独开展。

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

## S2：单个 Agent 细化开发

每个角色已有目录、Contract、Prompt、测试和样例，本阶段在其基础上核对业务缺口并细化。下表记录当前交付范围及仍保留的扩展目标；角色契约和受控验收与 S3 真实模型验收分开，不因受控测试通过而取消延期目标。

| 任务 | 角色 | 细化与验收重点 | 状态 | 当前证据 |
| --- | --- | --- | --- | --- |
| S2-01 | [Orchestrator](specs/domainFunction/agents/orchestratorAgent/OrchestratorAgent.md) | 计划输入、任务输出和失败处理；保持固定业务连接，不能由模型决定 Gate PASS | 待审阅（已实现） | IO-17 已实现当前模块五类任务、轮次及材料范围校验；见 Orchestrator 角色测试和完整流程回归 |
| S2-02 | [DocWorker](specs/domainFunction/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.md) | 源码分块、片段覆盖、来源引用及材料不足处理 | 待审阅（当前范围已验收） | 内部 Worker、覆盖/证据路径、未解决问题交接、裁剪 CAS/Prompt/工作区及并发重试复用已有角色与 WorkerMaterialBoundary 回归；业务分组、预算和跨模块依赖继续延期 |
| S2-03 | [DocGen](specs/domainFunction/agents/docGenAgent/DocGenAgent.md) | 单文档汇总、拆分提案、旧版与 Correction 定向修订、描述索引 | 待验收（最小链路开发完成） | 已完成 Worker 汇总交接、单文档与章节范围校验、拆分提案及显式答复、YAML/关键词/版本索引；定向与独立入口证据见历史版本索引。IO-08 预算分组、IO-10 分批汇总仍按原 Spec 待细化，S3 真实模型验收后续进行 |
| S2-04 | [TestGen](specs/domainFunction/agents/testGenAgent/TestGenAgent.md) | 确认输入与测试预期依据，再细化测试候选、oracle 声明和门禁接线 | 待审阅（已实现） | IO-11～13、21 已实现 C/C++ 测试文件、参考校验、源码内容绑定复用及有限修复；见 TestGenExecution 和完整流程回归 |
| S2-05 | [CodeAgent](specs/domainFunction/agents/codeAgent/CodeAgent.md) | 知识卡片包含接口，项目配置提供 C/C++ 必要约束；任务白名单与隔离限制读取，框架校验源码列表并落盘 | 待审阅（已实现） | IO-03～06 已实现知识与配置裁剪、空仓库读取视图、C/C++ 输出校验；KF-SYS-044 仍保留独立配置管理的 Partial 范围 |
| S2-06 | [Check](specs/domainFunction/agents/checkAgent/CheckAgent.md) | 检查输入、判据、findings 可追溯性及只读边界 | 待审阅（已实现） | IO-14、15 已实现源码/生成代码/规则输入及结构化差异报告；相似度算法继续延期 |
| S2-07 | [Review](specs/domainFunction/agents/reviewAgent/ReviewAgent.md) | 评测证据、Check findings 接入与归因、Correction 及无须修订时的输出 | 待审阅（已实现） | IO-15、16 已实现两类报告输入、多条修订意见和可信证据绑定；STOPPED 精简 CAS 交接及幂等事件已验收，完整治理展示与资料清理仍待开发 |

未完成目标保持在各模块 Spec：DocWorker 业务分组/上下文预算/跨模块依赖、DocGen 分批汇总、Check 相似度研究、独立项目配置管理、治理展示、资料自动清理及历史最佳回退。外部知识关联按 [Association IO-23](specs/domainFunction/association/Association.md) 延期，不作为当前 S2 的前置条件。

资料生命周期按 [Knowledge IO-19](specs/domainFunction/knowledge/Knowledge.md)：运行期间保留过程资料，达标且最终文档与验收记录保存后清理中间资料，替换现用文档时保留上一版；需人工治理时暂存必要证据至治理结束。自动清理尚未实现。停止条件按 [Evaluation IO-20](specs/domainFunction/evaluation/Evaluation.md)：达标立即结束，预算/轮次耗尽转治理；自动历史最优回退仍未实现。

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


## 当前能力边界

| 范围 | 当前事实 | 未完成或未验证部分 |
| --- | --- | --- |
| Agent 结构 | 六个外层 Agent；DocWorker 位于 DocGen/subAgents，保留独立执行身份、契约、提示词与提交记录；DocGen 组织源码拆分与汇总 | 结构与流程回归不代表真实模型生成质量验收 |
| 跨角色流程 | Domain 定义业务连接，LangGraph 只调度外层角色；DocGen 内部 Worker 使用独立 Registry 提交与有界并发 | 旧 roleExecutionVersion 拒绝恢复；不开放动态拓扑编辑 |
| Domain 组织 | 按领域功能平级组织，已移除 services 目录和总导出 | 共享实体仍位于 Domain.ts |
| 模型接入 | DSH 原生 SDK、受控 Fixture、OpenCode Go 环境配置已实现 | 公司 CLI 真实协议未验收 |
| 评测与发布 | 候选参考校验、同源固定测试、外部逐入口监督、确定性 Gate、幂等发布和审计已实现 | 通用 oracle 质量扩展、C++ 插件、完整敌对代码沙箱和自动历史最优回退未实现 |
| 查询与关联 | 现有查询、血缘、Diff、来源和关联领域能力 | SearchAgent 直接检索链仍为 Planned |
| 资源模块 | SourceScan、Workspace、legacyOkf 已归入 Domain | 保留既有文件系统、Git 和 YAML 依赖 |
| 文档组织 | 设计集中 docs/specs，按代码模块重写；4+1 视图集中一份 | 旧规范目录、独立 security 章节与重复任务模板已移除 |


## 关键证据与历史索引

PR #46 修复覆盖原生用例监督、路由崩溃恢复、cwd 绑定与停止交接。代码 `acfd714` 的历史结果为全量 314/314、浏览器 14/14、独立受控 SDK PASS/VERIFIED；具体产物与边界见 [修复与端到端报告](reports/AgentSpecRepairAndE2E.md)。这些结果不代表真实外部模型、敌对代码隔离或本次治理重构的执行结果。

2026-09-10～11 的逐次确认、提交和回归流水保存在 [治理整理前的 Status](https://github.com/linlisWorkTeam/domain-knowledge/blob/75d22094ad8e946a6118d441bb7a7c8258140639/docs/Status.md)；更早设计演进见 [HistoryEpitaph](HistoryEpitaph.md)。未改变原有 S1～S4 验收状态，不以文档整理关闭延期项。

<details lang="en">
<summary>English summary</summary>

Track durable roadmap, capability boundaries and revision-specific acceptance references here. Session activity belongs in PRs, commits or necessary handoffs. Controlled tests and historical evidence do not establish live model quality or current acceptance.

</details>
