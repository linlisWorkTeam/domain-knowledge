<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：历史交接与设计演进。
-->
# 历史交接与设计演进

本文件汇总已归档交接、重复里程碑报告和旧设计决策，记录“改了什么”及当时证据边界，不作为当前任务授权。当前设计见 specs，当前能力见 Status。完整旧文档通过固定 Git 提交读取；不保留一整套过期设计副本。

## 历次交接归纳

| 原记录 | 改动与结论 |
| --- | --- |
| [2026-09-04-0223-dev007-dev008-e2e-acceptance.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0223-dev007-dev008-e2e-acceptance.md) | 补齐内容治理、评测与来源交互及端到端验收；当时记录只覆盖该版代码。 |
| [2026-09-04-0710-dev006-dev009-complete.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0710-dev006-dev009-complete.md) | 完成 DEV-006/009 的 API、执行观测和公司 CLI 契约入口，真实公司 CLI 接入未完成。 |
| [2026-09-04-0926-dev010-company-cli-blocked.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0926-dev010-company-cli-blocked.md) | 核实公司 CLI 真实协议与访问条件不足，保留现有 Adapter，未用模拟结果宣称真实验收。 |
| [2026-09-07-1154-dsh-foundation-direction.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-07-1154-dsh-foundation-direction.md) | 确认 LangGraph 跨角色编排、DSH 单角色运行的方向，旧 Pi 运行数据保留只读。 |
| [2026-09-07-1212-dsh-documentation-audit.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-07-1212-dsh-documentation-audit.md) | 审计 DSH 文档与实际实现差异，将真实模型验证和结构机制验证分开。 |
| [2026-09-07-1617-dev019-r1-configuration-review.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-07-1617-dev019-r1-configuration-review.md) | 完成 DSH 配置、依赖迁出和通用场景入口，受控测试验证机制，R2 live 后续另验。 |
| [2026-09-07-1639-dev019-r2-live-configuration.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-07-1639-dev019-r2-live-configuration.md) | 新增固定源码 DocGen prepare/run/check 入口和独立工作树复现，最初因无配置未完成 live。 |
| [2026-09-07-1712-dev019-r2-live-acceptance.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-07-1712-dev019-r2-live-acceptance.md) | 修复 DNS 地址族和输出提取；主 Run 44d4dbdf-c94f-4ee3-a18f-3bddd2f7835b 的 3 个例子、独立 Run 4c1c9f00-241c-4706-aa8b-cfe49d53619c 的 5 个例子通过当时的 live 检查。不是七角色闭环验收。 |
| [2026-09-07-1737-agent-code-development-guide.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-07-1737-agent-code-development-guide.md) | 整理逐角色代码定位、共享边界及开发步骤，后续统一到角色开发指南。 |
| [2026-09-08-0953-main-cleanup-startup-docs.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-08-0953-main-cleanup-startup-docs.md) | 同步 main 并验证本地启动、只读 HTTP 和临时预览；临时进程及隧道不作为当前运行服务。 |
| [2026-09-08-1015-search-agent-design.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0710-dev006-dev009-complete.md0) | 设计 Application 直接调用 SearchAgent，限定已发布 VERIFIED 内容；只交付设计，未实现角色。 |
| [2026-09-08-1019-search-agent-pr-auth.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0710-dev006-dev009-complete.md1) | 拆分 SearchAgent 文档 PR 并核对当时账号限制；后续 PR #31 已创建，旧登录阻塞不再适用。 |
| [2026-09-08-1041-project-decoupling-opencode-go-env.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0710-dev006-dev009-complete.md2) | 移除固定 WorkPanel 验收与部署目录，改用通用场景，保留 OpenCode Go 环境变量和按摘要生成配置补丁。 |
| [2026-09-08-1043-decoupling-pr-and-branch-cleanup.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0710-dev006-dev009-complete.md3) | 提交解耦 PR 和约定合并后清理指定分支；该历史授权不覆盖其他分支。 |
| [2026-09-08-1123-seven-role-domain-refactor.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0710-dev006-dev009-complete.md4) | 将七角色步骤、契约和 Prompt 迁到 Domain，新增共用 CAS 提交与独立入口；记录当时 218 项测试和 Console 14 项，未验真实模型效果。 |

## 架构决策的演进

早期采用 TypeScript 分层和端口适配，以工件引用交接，选择 LangGraph 作为执行引擎，发布由确定性 Gate 控制。随后将 Runner 与知识内容仓库分开，UI 经 Application App 调用业务服务；配置冻结和版本化信封保证同版本恢复与历史可读。

七角色重构把角色步骤收回 Domain，Fixture 改为模型注入，新增独立运行入口。目录审查继续把业务工作流、来源扫描、工作空间与旧 OKF 转换归到 Domain，基础设施按 LangGraph、Agent Adapter、SQLite、Redis、HTTP 和评测实现组织。旧 ADR 中“LangGraph 拥有业务拓扑”和“Domain 完全没有文件访问”的笼统表述已由实际模块边界替代。

当前所有设计直接维护在对应模块；不再创建 ADR 索引和任务模板副本。旧 ADR 及 DEV-019 文档的完整内容可见固定提交下的 [原规范目录](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0710-dev006-dev009-complete.md5)。DSH R1 配置、R2 单 DocGen 范例和公司 CLI 契约证明的是不同范围，不能合并为七角色 live 通过。

## 仓库拆分与阶段报告

旧 Runner 的可保留命令经 fw.mjs 映射到唯一应用服务，旧 OKF 的 verified 标记只作为迁移元数据，不能直接发布。wpKnowledge 只持有知识和外部证据。本轮移除重复教程、拆分说明和阶段报告文件，其历史原件保留在 Git。

- [从 wpKnowledge 拆出运行仓库](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0710-dev006-dev009-complete.md6)：历史阶段快照，当前目录与验证结论由本轮设计覆盖。
- [从旧版 Runner 迁移](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0710-dev006-dev009-complete.md7)：历史阶段快照，当前目录与验证结论由本轮设计覆盖。
- [DSH Agent 公共底座测试报告](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0710-dev006-dev009-complete.md8)：历史阶段快照，当前目录与验证结论由本轮设计覆盖。
- [domain-knowledge 项目进度快照](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0710-dev006-dev009-complete.md9)：历史阶段快照，当前目录与验证结论由本轮设计覆盖。
- [LangGraph 多 Agent 框架阶段性测评](https://github.com/linlisWorkTeam/domain-knowledge/blob/def8dcc/docs/epitaph/2026-09-04-0926-dev010-company-cli-blocked.md0)：历史阶段快照，当前目录与验证结论由本轮设计覆盖。

## 本轮身份与记录规则

当时将 icedblkamericano 误写成项目统一账号；用户后续澄清该约定仅适用于当前 session，不应被后续会话继承，相关项目规则已删除。按用户要求，PR #36 相对 main 的两条既有提交已重写身份；业务文件内容未因身份重写改变。旧哈希 20e28e9、7cda52b 分别对应新哈希 7888848、def8dcc，历史验证时间保持原记录。PR 创建者是 GitHub 不可编辑字段，提交作者修改不改变已有 PR 的创建者。

以后每次交接只保留最近三篇，较早记录先补入本汇总并保留固定提交链接，避免把旧文档直接删除而丢失改动说明。

<details lang="en">
<summary>English summary</summary>

This document summarizes older handoffs, milestones and architectural decisions with links to immutable original records. Historical test and live-model results apply only to their original revisions. Current designs and delivery status are maintained separately.

</details>

## DocGen 专用入口清理

按用户确认取消旧 prepare/run/check CLI、DocgenExampleService 与 LangGraph 兼容导出。固定材料和追加指令归入 docGenAgent 的 JSON 样例，参考检查和原有测试迁入同一角色目录，通过共同 AgentExample 链路验证。历史专用入口的命令与结果格式不再保留。

[2026-09-08-1130 七角色 PR 准备](https://github.com/linlisWorkTeam/domain-knowledge/blob/5833cf5/docs/epitaph/2026-09-08-1130-seven-role-pr-preparation.md)：在独立工作树准备最初七角色 PR，记录当时 219 项测试与 Console 14 项通过；该历史结果不代表后续清理后的回归状态。

## Session 账号约定纠正

删除 AGENTS、贡献指南、开发指南和 CodeTaste 中的固定账号规则，同时移除本次会话写入的仓库级 user.name / user.email。当前会话的 Git 身份通过单次命令配置，GitHub 身份通过单次进程凭据指定；不设跨会话账号约束。历史交接中把账号写成项目规则的表述是当时的误解，不作为后续协作指令。

[2026-09-08-1158 目录审查](https://github.com/linlisWorkTeam/domain-knowledge/blob/260e7f1/docs/epitaph/2026-09-08-1158-agent-directory-review.md)：调整 Domain Workflow、资源模块和 Infrastructure 目录，新增版权与中文说明；当时只做类型与静态检查，未运行测试。

## 设计与命名整理交接归档

[2026-09-08-1216-specs-consolidation.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/1455ba9c6a84797a2ee22e9939f2542cd4dc7ed4/docs/epitaph/2026-09-08-1216-specs-consolidation.md)：设计集中到 docs/specs 并与代码对应，统一目录小驼峰、文件大驼峰，合并 4+1 视图与历史文档。仅做静态验证，未重跑测试。原记录中的项目级账号规则是误解，已纠正为仅当前会话适用。

## MVP 并行实施交接归档

- [2026-09-08-1420-docgen-example-consolidation.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/5190d50170bdbfbd921f6e109dc043ffaa86cc53/docs/epitaph/2026-09-08-1420-docgen-example-consolidation.md)：统一 DocGen 样例和公共角色入口，迁移参考检查；当时只做静态检查，没有七角色 live 验收。
- [2026-09-08-1423-session-identity-scope.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/5190d50170bdbfbd921f6e109dc043ffaa86cc53/docs/epitaph/2026-09-08-1423-session-identity-scope.md)：纠正账号约定只属于当时会话，移除仓库级身份规则；只修改文档与配置。
- [2026-09-08-1442-domain-feature-layout.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/5190d50170bdbfbd921f6e109dc043ffaa86cc53/docs/epitaph/2026-09-08-1442-domain-feature-layout.md)：Domain 按功能平级组织，移除 services 总分组；当时仅静态验证，后由 MVP 全量回归覆盖。
- [2026-09-09-0212-mvp-product-handoff.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/5190d50170bdbfbd921f6e109dc043ffaa86cc53/docs/epitaph/2026-09-09-0212-mvp-product-handoff.md)：实现发布 outbox、目录、Git、Console 和安装脚本；当时仅定向测试，主 Agent 后续完成接线与实际安装验收。
- [2026-09-09-0219-mvp-product-visual-handoff.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/5190d50170bdbfbd921f6e109dc043ffaa86cc53/docs/epitaph/2026-09-09-0219-mvp-product-visual-handoff.md)：补取消按钮、产品浏览器用例和工具链接校验；交接时未执行视觉、安装或真实模型。
- [2026-09-09-1009-mvp-knowledge-roles.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/5190d50170bdbfbd921f6e109dc043ffaa86cc53/docs/epitaph/2026-09-09-1009-mvp-knowledge-roles.md)：实现任务依赖、源码事实、DocGen 两阶段和 H2 修订；27 项角色测试通过，语义正确性仍依赖独立门禁。
- [2026-09-09-1013-mvp-controlled-role-fixtures.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/5190d50170bdbfbd921f6e109dc043ffaa86cc53/docs/epitaph/2026-09-09-1013-mvp-controlled-role-fixtures.md)：适配受控输出、rawOutputRef 和冻结材料；无真实模型调用，模块场景集成由主 Agent 验证。

- [2026-09-09-1020-mvp-validation.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/f30f0c5/docs/epitaph/2026-09-09-1020-mvp-validation.md)：验证组完成声明式测试、隔离模块评测、Code/Check/Review 和共享重进程槽，定向 36/36；主 Agent 后续完成 280 项回归、真实 DSH 进程探针及离线安装，真实模型凭据仍阻塞。

- [2026-09-09-1028-product-route-fixtures.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/3efa1c08ea591a1e71651e69aa95bb6a3e474554/docs/epitaph/2026-09-09-1028-product-route-fixtures.md)：产品组修复 Playwright 路由拦截与安装测试配置，当时仅静态复现，后由主 Agent 完成受控视觉和实际安装验收。

- [2026-09-09-1033-bundled-runtime-libraries.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/186702547abadddf18c2cbeda4af4b2ad859f493/docs/epitaph/2026-09-09-1033-bundled-runtime-libraries.md)：增加经过路径校验的包内运行库传递及只读挂载，4 项定向测试通过；主 Agent 后续完成实际离线安装、评测及 DSH 隔离验证。

- [2026-09-09-1125-seven-role-mvp-candidate.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/cff8fc1/docs/epitaph/2026-09-09-1125-seven-role-mvp-candidate.md)：交接七角色、Linux 离线安装与浏览器候选，当时 280 项回归和 Console 19 项通过，真实模型尚为 0/3 且凭据阻塞；后续 1225 记录已覆盖真实验收 3/3 失败，不能将旧候选记录作为发布授权或最新验收结果。

## 真实验收失败与阶段修复交接归档

- [2026-09-09-1219-mvp-real-acceptance-budget-exhausted.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/cff8fc14a75b556dfce84598842caa7d2f895868/docs/epitaph/2026-09-09-1219-mvp-real-acceptance-budget-exhausted.md)：纠正遗漏历史凭据的判断，记录三次真实启动失败及 3/3 额度耗尽；当时 281 项回归通过，未有完整真实发布。后续仍需新预算，不改写原失败证据。
- [2026-09-09-1225-mvp-live-final-evidence.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/cff8fc14a75b556dfce84598842caa7d2f895868/docs/epitaph/2026-09-09-1225-mvp-live-final-evidence.md)：1867025 安装包、281 项回归和 19 项 Console 通过；实际失败列表误显示 GENERATING 是当时未解决问题，现由阶段修复候选覆盖。真实预算仍耗尽，原取消节点和用量证据保持历史原样。


## 开发并行规范与领域服务整理前的交接归档

- [2026-09-09-1640-provider-generation-probe.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/51c2972e914c81bbeaf3577aa79b27e563f18ca0/docs/epitaph/2026-09-09-1640-provider-generation-probe.md)：将模型连接验证改为列表检查后执行生产 DSH 的一次 64 token 最小生成，30 秒总期限，保留隔离、失败关闭、取消清理与旧配置降级。当时受控探针 15 项、配置安全 7 项、挂起超时 1 项、token 上限 2 项及类型检查通过；不是外网模型或完整 MVP 验收。后续集成结果见保留的阶段修复交接，历史失败与已耗尽真实预算仍有效。

- [2026-09-09-1640-provider-generation-probe.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/27ec9dfb3472f8a07327271470d8767efcebd4c7/docs/epitaph/2026-09-09-1640-provider-generation-probe.md)：生产 DSH 的一次 64 token 生成探针与受控取消/排队/输出限制验证；当时未调用真实提供方。后续第四次授权前已成功完成真实探针，完整飞轮仍受独立门禁约束。

- [2026-09-09-1645-mvp-run-state.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/471dfc5fec5f4d37ce7f176ed3a07fe01c5e90f1/docs/epitaph/2026-09-09-1645-mvp-run-state.md)：新增执行状态投影与两阶段模型验证界面，失败不再伪装为 GENERATING；当时状态/HTTP 7 项、架构 7 项、Console 21 项及类型/Spec 通过，均为受控验证。未重建安装包或增加真实预算，后续集成与第四次真实验收分别见保留交接。合并开发结构分支时归档此记录，保留最近三份墓志铭。

- [2026-09-09-1710-mvp-stage-repair-candidate.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/9e35adfe5523c156dcbd8d0e1dc1a0fe490d4358/docs/epitaph/2026-09-09-1710-mvp-stage-repair-candidate.md)：854ac9c 阶段修复候选的 321 回归、21 Console、离线安装与实际历史数据浏览器验证；当时真实预算为3/3。后续第四次已授权并失败，风险复核代码现为v4；旧安装与真实记录只作历史证据。

- [2026-09-10-1017-domain-services-subagents.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/94d431a86b7656ded4109c3a00ae93b182df2e6c/docs/epitaph/2026-09-10-1017-domain-services-subagents.md)：开发 subagent 协作规范、Domain agents/services 平级迁移及 AgentExecutionService 入口；当时定向架构/类型/Spec 通过，全量唯一官网摘要失败复测通过，没有外网模型验收。后由 MVP 集成与 340 项最终回归覆盖；开发调度能力与产品动态派生 Agent 不混同。

## 前台视觉重构前的历史交接

- [2026-09-10-1020-fourth-real-risk-blocker.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/55661e054edabcb694f84565da41b3f262481171/docs/epitaph/2026-09-10-1020-fourth-real-risk-blocker.md)：第四次真实飞轮在三轮行为门禁通过后仍受未处置知识风险阻塞；当时仅授权四次、PR38 为草稿，传输与 H2 修订修复已有受控验证。后来用户追加额度授权，风险生命周期、真实发布及 v0.2.0 验收已经完成，见保留的 1047、1141 记录；旧失败证据与原账本不改写。此次归档只为保留最新三份交接，不重开已完成的 MVP 验收。

- [2026-09-10-1047-risk-review-verified.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/94d431a86b7656ded4109c3a00ae93b182df2e6c/docs/epitaph/2026-09-10-1047-risk-review-verified.md)：风险生命周期修复与执行版本 v4，330 项本地、331 项整合 CI 和 22 项 Console 等受控验证；当时尚未获得后续真实预算，未正式发布。之后真实验收与 v0.2.0 发布已由 1141 记录覆盖，本次只归档历史交接。

## 五阶段工作台基础接入前的交接

- [2026-09-10-1141-mvp-v020-released.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/26e3b48d427ab5b0c1b98449d101f633bda99969/docs/epitaph/2026-09-10-1141-mvp-v020-released.md)：v0.2.0 发布和安装包来自94d431a，最终真实 Run da8de66a-cce3-4922-a5f5-0b3e62eadcaf 通过270/270并发布；保留模型凭据、固定源码、用户数据及原始失败账本，不因新工作台重复发布。发布当时任意语言/项目及复杂检索回退延期，当前新任务另行扩展 C/C++；旧版本验收不证明新闭环完成。完整记录可从上述固定 Git 对象读取。
- [2026-09-10-1227-taste-console-live.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/26e3b48d427ab5b0c1b98449d101f633bda99969/docs/epitaph/2026-09-10-1227-taste-console-live.md)：独立 taste 工作树的七页导航、正文阅读和真实待办筛选重构，24项浏览器及定向复验；当时为只读预览，后由1433记录改为免登录。线上运行源码和隧道不属于本次工作台已部署证据；本任务不改写 v0.2.0。历史截图位于 domain-knowledge-releases/2026-09-10-taste-ui；ECS 重任务串行。

- [2026-09-10-1433-console-direct-editing.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/0265f608a11026d3bdf7a4dd70b91020559f5447/docs/epitaph/2026-09-10-1433-console-direct-editing.md)：用户明确授权免登录，线上 Console 配置、目录及批次操作无需旧令牌；当时25项Console、19项服务与官网回归通过。后续工作台在独立工作树实现，线上未更新；原发布证据及 v0.2.0 不改写。

- [2026-09-10-1511-five-stage-foundation.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/47ef4c5f043aec14842ecc5f8d7a0dfb51a391d8/docs/epitaph/2026-09-10-1511-five-stage-foundation.md)：稳定卡片身份与历史只读分组、匿名证据下载及未知状态修复；当时45单元、163集成、19既有acceptance和27Console通过。随后阶段/索引及仓库分析由1547/1614交接覆盖，完整C/C++闭环与部署仍未完成。

- [2026-09-10-1547-workbench-stages-index.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/e65140a92d27379923cb856c62e347bccd9956ab/docs/epitaph/2026-09-10-1547-workbench-stages-index.md)：knowledge-workbench-v1持久化阶段、Linux租约/取消/累计预算、独立增量索引与检索接通；当时170集成、29contract及28Console通过。只有INDEX handler，其他四阶段、真实C/C++模型及最终部署未完成。后续仓库/项目输入与原生工具链在保留交接继续推进。

- [2026-09-10-1614-workbench-repository-analysis.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/2479904f1fe3824682e69b155330552e25b2922d/docs/epitaph/2026-09-10-1614-workbench-repository-analysis.md)：接入固定Git源码分析、模块候选和环境观察，类型/Spec/架构、172项integration和29项Console通过；仅分析入口，模型闭环及部署未完成。后续项目输入和原生工具链见1623/1645记录；原知识、线上taste和v0.2.0保留。

- [2026-09-10-1623-workbench-project-inputs.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/7422ca29677cae769a96323a15a96900ac70d207/docs/epitaph/2026-09-10-1623-workbench-project-inputs.md)：固定项目输入与源码CAS、Console构建约束、jsmn/TinyXML2固定提交；当时integration173/173和Console29/29通过，真实模型与原生评测未实现。固定目标和快照位置继续见最新交接及Targets.json。

- [2026-09-10-1645-native-toolchain.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/b290752057f1a841f090887f1e8a1df0bc757d47/docs/epitaph/2026-09-10-1645-native-toolchain.md)：新增C/C++隔离构建和公开声明投影，固定jsmn/TinyXML2参考观察；当时并未接模型重建或可信用例晋升，参考stdout不算行为门禁证据。后续接线见最新交接。

- [2026-09-10-1732-workbench-generation.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/89cb273bc87db3f0d035efad88010f198b8bcd14/docs/epitaph/2026-09-10-1732-workbench-generation.md)：接通C/C++多卡片生成、冻结配置、逐卡恢复与索引；当时integration181和Console29通过，未实现重建/评测或真实模型验收。后续阶段能力见当前交接，原证据仍在releases/generation。

- [2026-09-10-1822-native-trusted-tests.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/42f6e74aebc26c3212aa1bf886303a7cf42f53e2/docs/epitaph/2026-09-10-1822-native-trusted-tests.md)：原生候选用例协议与缓存接线，参考门禁拒绝错误候选，详细验证和未完成边界保留于固定提交；最新真实模型结果见1908交接。

- [2026-09-10-1833-workbench-reconstruction.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/ab46aa5a0f51fc4b23b808a662cf1cf5c45f6f58/docs/epitaph/2026-09-10-1833-workbench-reconstruction.md)：接通原生重建、隔离接口比较与恢复，尚未通过真实模型验收；后续真实jsmn结果见1913交接。

- [2026-09-10-1850-workbench-evaluation.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/bdc8b1dc63aab1706cbb93add422d296e1d58e6c/docs/epitaph/2026-09-10-1850-workbench-evaluation.md)：接通原生评测和失败用例界面，原验证integration189/Console29；完整目标尚缺自动修订、关联、固定门禁和真实双目标验收。后续真实jsmn与关联结果见1913和1931交接。

- [2026-09-10-1908-native-live.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/a9556351702cac6b3f6b2d70e348a85dee19a705/docs/epitaph/2026-09-10-1908-native-live.md)：真实jsmn多卡片/重建及早期TestGen JSON失败，新增验收脚本并修正provider必填字段提示；当时未通过行为门禁。后续真实双目标当前工具链结果与恢复修复见最新交接，发布仍未完成。

- [2026-09-10-1913-jsmn-behavior.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/6e5e6d9bbc46f8bfe27985ead1363ff5270fc3f8/docs/epitaph/2026-09-10-1913-jsmn-behavior.md)：旧引擎jsmn16例真实参考与生成通过，补候选拒绝反馈；当时完整闭环未完成。历史测试套件保留，当前门禁继承规则见最新交接，不将旧报告当新执行器验收。

- [2026-09-10-1931-associations-tinyxml.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/3d82c6a2255531cb3416a9e8b65918cb7b781daf/docs/epitaph/2026-09-10-1931-associations-tinyxml.md)：库内关联与早期 TinyXML2 运行交接；后续编译修复、可信门禁继承和真实结果见当前墓志铭。该时点不代表完整闭环或发布完成。

- [2026-09-11-0143-native-repair-verified.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/525690a2d484a90aeec28edc9f5f9e739e348aa6/docs/epitaph/2026-09-11-0143-native-repair-verified.md)：编译反馈修复与旧引擎真实 TinyXML2 37/37、jsmn15/15。此后可信门禁引擎已更新；当前 jsmn 一键31/31见0233记录，TinyXML2最终引擎仍待重验。真实运行配置、固定仓库与证据位置保存在原记录，不将历史结果当完整发布证明。

- [2026-09-11-0153-trusted-gates.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/192ba38a2e3ff8e6dc3f199a47e5b5f099ee75b9/docs/epitaph/2026-09-11-0153-trusted-gates.md)：跨输入版本保留可信测试并集、冲突暂停、缓存失效规则；当时integration196/Console30通过。此后jsmn当前引擎31/31已验，旧TinyXML2仍待最终重验。原始门禁和历史证据保留，不以候选替换旧可信预期。

- [2026-09-11-0233-persistent-pipeline.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/7c81fd0cdf99ef2012a87d1c05b40a0b0156b042/docs/epitaph/2026-09-11-0233-persistent-pipeline.md)：首版持久化一键流程、崩溃交接恢复及 jsmn 真实 31/31；后续契约已升级，旧流程只读。

- [2026-09-11-0235-material-snapshots.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/a46a2d7b7bf30edd53d588034f8c077fb7569b52/docs/epitaph/2026-09-11-0235-material-snapshots.md)：显式本地/HTTPS外部材料快照、来源修订及CAS原文绑定；后续关联和修订诊断继续复用。

- [2026-09-11-0249-external-relations.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/698d6d51cf3dd2ea4d4cec76493402a55c433634/docs/epitaph/2026-09-11-0249-external-relations.md)：外部材料关联、v2一键选材和真实jsmn45条关系验收，后续执行契约见新交接。

- [2026-09-11-0316-source-comparison.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/73848161ea22574a1c194369db508ab75628201b/docs/epitaph/2026-09-11-0316-source-comparison.md)：规范化公开函数差异及绑定 Code 缓存，jsmn 31/31、TinyXML2 37/37 真实行为通过；后续 v4 复用相同阶段证据，仍未通过最终发布或真实模型知识修订验收。

## 修订依据归档

[2026-09-11-0326-revision-evidence.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/6d3d24098ec2bb4c45ede8e0b78af599db0a1fcf/docs/epitaph/2026-09-11-0326-revision-evidence.md) 将可信失败绑定到固定版本 H2，区分候选归因与已证明知识错误。已通过当时契约和受控测试；真实修订、最终发布门禁尚未通过，不能将归因候选当作纠正事实。

[2026-09-11-0346-knowledge-revision.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/7afb0d9cfa6e99b631e55ebd611f9aeb0bf00223/docs/epitaph/2026-09-11-0346-knowledge-revision.md) 接通独立 Review/DocGen 定点修订、原卡片身份、尾注保护及索引恢复；当时仅受控验证，真实修订与最终发布门禁未完成。自动迭代及修订后源码复核后来另行交付。

## 真实修订阶段判断更正

0509交接把第一次真实超时归于DocGen语义重试，这是错误判断。完整检查点和Provider审计表明：DocGen一次成功（约66秒），随后源码Review在约180秒超时；无证据证明该次DocGen输出被拒绝。恢复后仍是源码Review，它误将旧生成实现pos=1观察用于拒绝pos=0正确草稿。原记录保留供审计，更正证据见真实验收目录source-review-v4/Attempt1StageCorrection.json及SourceReviewSubjectMixing.json。

[2026-09-11-0409-automatic-iterations.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/e3b09c1fd26e94f54a9cdc9e6f57075abe4b8ea9/docs/epitaph/2026-09-11-0409-automatic-iterations.md) 接通多轮协调、原失败绑定重试及累计用量，受控六轮和真实旧产物重放通过；当时没有新真实模型修订，最终发布和完整部署未完成。

[2026-09-11-0450-source-review.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/a0c8f96f39291b0e831c1c14f0106002bb469de6/docs/epitaph/2026-09-11-0450-source-review.md) 记录修订后源码 Review 门禁、独立真实验收中错误 parser 卡片与未完成的全卡验证。随后参考观察对象混淆已修正，完整整卡复核入口本次接通；真实双目标最终验证和发布仍待完成。

[2026-09-11-0509-role-attempt-audit.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/30aa16eadf23176cf831c75125cf98e2eae183b6/docs/epitaph/2026-09-11-0509-role-attempt-audit.md) 交付角色语义尝试审计和下载，类型/Spec/架构/集成208/Console通过。其对旧真实超时的DocGen归因不正确，0521及本文件的更正为准；实际为DocGen成功后独立源码Review超时。原始错误记录在固定提交保留供审计。

[2026-09-11-0521-source-observation-subject.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c3bc39a5352c3bbef488dfbf66fa47423039f344/docs/epitaph/2026-09-11-0521-source-observation-subject.md) 分离固定参考观察与旧生成失败，交付 revision-v5 / pipeline-v9。更正旧超时为 DocGen 成功后的源码 Review 超时；定向类型、Spec、架构和真实 gcc 受控测试通过。全部卡片来源门禁和真实发布当时未完成。

[2026-09-11-0540-whole-card-source-verification.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/07d1c3148e8731d1e4bd4dd13597cd905298e7ed/docs/epitaph/2026-09-11-0540-whole-card-source-verification.md) 接通来源复核v1与Console，并保留行为通过但正文错误的实际gcc受控反例。后续全208集成通过。真实旧Code协议失败和待修坏parser卡片仍是当时限制；没有发布。仅清理npm缓存，未删知识。

[2026-09-11-0554-source-driven-revision.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/ac5c740d5111ae0912875a5360eb2a7a909fded6/docs/epitaph/2026-09-11-0554-source-driven-revision.md) 交付来源修订v1、共享卡片修订和索引恢复；真实v9行为31/31完成但坏parser卡仍未修正。整卡来源v1首次超时，后续恢复再次超时，已由v2替代，不再恢复。没有发布。

[2026-09-11-0624-source-gated-pipeline.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/39f766e9295986913df43d1b72fe0ae955c6a03a/docs/epitaph/2026-09-11-0624-source-gated-pipeline.md) 交付pipeline-v10来源门禁与source-v2逐章恢复，集成212/单元75/架构8/Console31/受控验收19通过。真实旧source-v1两次超时，不再跨版本恢复。固定测试与最终发布当时未完成。

[2026-09-11-0629-fixed-native-acceptance.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/5f9843c61b2a1b629cef94645e765c7f70d1f489/docs/epitaph/2026-09-11-0629-fixed-native-acceptance.md) 固定参考用例完成 C 11/11、C++ 40/40，未把参考通过当作知识发布。后来生成实现和独立工作台固定评测分别通过同一用例；来源复核仍未完成，最终发布门禁未接通。

[2026-09-11-0635-language-case-boundary.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/6cba6d3374cce85a13a0450a46c8484da138d86e/docs/epitaph/2026-09-11-0635-language-case-boundary.md) 共享语言案例端口接通原生和既有 TS 执行，3单元/8架构/17集成通过。来源 v2 后续仍超时，最终发布与双目标完整链路未完成。

[2026-09-11-0645-fixed-generated-acceptance.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c15a9fdd55ba3f1a66bca871b25ba7f5cbdce589/docs/epitaph/2026-09-11-0645-fixed-generated-acceptance.md) 固定生成验收C11/11、C++40/40与错绑定拒绝通过；当时来源v2恢复仍未完成，后续第三次超时，已由v3替代。固定工作台独立阶段随后接通，最终发布未实现。

[2026-09-11-0715-fixed-stage-ui.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/0889101d1c9d2468f5e20e48b1dc75c9da2c0fc7/docs/epitaph/2026-09-11-0715-fixed-stage-ui.md) 独立固定评测API/Console与真实C11/11、C++40/40通过，重复启动复用task/checkpoints/events。来源v2第三次超时，最终一键固定门禁与工作台发布仍未完成。

[2026-09-11-0718-scoped-source-evidence.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/9569d94f6d96c7402cd757d2a61708a0a8dde2c8/docs/epitaph/2026-09-11-0718-scoped-source-evidence.md) 来源v3按精确章节缩减观察，定向测试通过，但真实恢复后漏判已有字段矛盾。v3已取消并只读；v4冻结历史矛盾、恢复相关观察摘要，不能将当时受控通过当作真实语义质量通过。

[2026-09-11-0724-compilation-database.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/a051b44aeb918c6a6956a26613a1d86a540254ae/docs/epitaph/2026-09-11-0724-compilation-database.md) 编译数据库候选解析/Console和2单元/3集成/8架构/类型/Spec/1Console通过。来源v3首次超时，后续恢复漏判已知矛盾而取消；来源v4保留历史矛盾。空候选字段造成旧快照身份变化的问题随后修复，双目标旧快照复用已验证。最终发布未完成。

[2026-09-11-0727-provider-stream-diagnostics.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/9ae594d71337840c625dcee63324e57afdca3253/docs/epitaph/2026-09-11-0727-provider-stream-diagnostics.md) 增加无正文流式诊断，受控取消保留计数；来源v3后续误放行已知矛盾而取消。v4保留历史意见，真实180秒持续推理无最终正文后超时，下一版冻结600秒来源期限。尚未发布。

[2026-09-11-0735-source-finding-history.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/fb3f28b8d2949af64da2303abef9b2bd477992d5/docs/epitaph/2026-09-11-0735-source-finding-history.md) 来源v4冻结同正文历史明确矛盾，修订重新验证原始意见；新600秒策略真实运行仍保留这些矛盾。未完成最终发布。

[2026-09-11-0746-fixed-pipeline.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/f07e4aa74a6d352f9a6ad7a42ec6190acc344924/docs/epitaph/2026-09-11-0746-fixed-pipeline.md) pipeline-v13接通每轮固定suite，旧快照复用验证通过；来源180秒持续推理超时，后续600秒策略已越过旧失败章节，仍未完成发布。

[2026-09-11-0754-source-review-policy.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c29fab2e56910ed885b94c5474acf68d8b1d4b30/docs/epitaph/2026-09-11-0754-source-review-policy.md) 冻结来源600秒策略，旧输入保持180秒与原审计。真实新任务已启动并越过旧失败章节，仍运行，未发布。

[2026-09-11-0758-publication-evidence.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5da7fa0769207304cf69bacf55a0cbb53b3d32b/docs/epitaph/2026-09-11-0758-publication-evidence.md) Domain联合证据规则已实现；随后Application递归验证工件及固定原始观察，尚未提交最终发布事务。来源新策略任务仍在运行。

[2026-09-11-0800-publication-preparation.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/142d83331034b881d284484e14f6dc2f76e1f4e2/docs/epitaph/2026-09-11-0800-publication-preparation.md) 发布准备递归验证CAS，后续增加固定观察与代码/正文/工具链绑定；可信及来源语义和最终发布事务仍未接完。

[2026-09-11-0802-publication-fixed-observations.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/55c21441000209fad5042e1928c5fe3894958b0f/docs/epitaph/2026-09-11-0802-publication-fixed-observations.md) 固定报告原始观察重算已接发布准备，真实C11/CPP40报告通过；后续补代码/正文/工具链绑定。最终发布仍未完成。

[2026-09-11-0804-fixed-publication-binding.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/aa2c1a7827aa3390ca97d79805a66ccf3a9ed223/docs/epitaph/2026-09-11-0804-fixed-publication-binding.md) 固定报告绑定代码/卡片正文/工具链，替换字段反例拒绝。后续可信原始观察与持久化测试集已接准备，最终发布仍未实现。

[2026-09-11-0806-trusted-publication-observations.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/759815ac573e50ead95501d6cf76825079b38e77/docs/epitaph/2026-09-11-0806-trusted-publication-observations.md) 可信原始观察Domain规则及真实C31/CPP37复核通过，后续已接发布准备并核对项目构建。最终发布仍未完成。
