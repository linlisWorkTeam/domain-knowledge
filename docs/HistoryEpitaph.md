<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：历史交接与设计演进。
-->
# 历史交接与设计演进

## 2026-09-11 归档：CodeAgent 输入输出确认

[2026-09-10-1038 原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/50aad21312a60bb8a866ebd1a4d9bcf0d5180ee9/docs/epitaph/2026-09-10-1038-codeagent-input-output.md)：当时仅确认 CodeAgent IO-03～06 的知识、C/C++、项目配置与读取隔离设计，修改设计和追踪，Spec 校验通过，未运行真实模型；项目配置及隔离实现、TestGen 测试依据仍待推进。其当时的 Planned 和“C/C++ 评测尚未实现”是历史快照，当前实现及真实模型结果以最新验收报告为准；测试依据在固定版本兼容与标准差异上的未决边界仍须明确。为保留最新三篇交接归档此文，不删除原始 Git 证据。

本文件汇总已归档交接、重复里程碑报告和旧设计决策，记录“改了什么”及当时证据边界，不作为当前任务授权。当前设计见 specs，当前能力见 Status。完整旧文档通过固定 Git 提交读取；不保留一整套过期设计副本。

## 历次交接归纳

| 原记录 | 改动与结论 |
| --- | --- |
| [2026-09-08-1216-specs-consolidation.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/96d277b937c0400c8b6cdc978315f9f98f2fc044/docs/epitaph/2026-09-08-1216-specs-consolidation.md) | 按代码模块重写 23 篇设计，迁移 17 个 Schema 并统一目录/文件命名，合并操作指南、4+1 视图和历史任务记录；当时只做类型、路径、Schema 字节和追踪静态检查，未跑回归或真实模型，旧测试结果不能证明迁移后的版本。该记录中的项目级账号规则已由后续会话范围纠正撤销。 |
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

[2026-09-08-1420 DocGen 样例统一入口交接](https://github.com/linlisWorkTeam/domain-knowledge/blob/96d277b937c0400c8b6cdc978315f9f98f2fc044/docs/epitaph/2026-09-08-1420-docgen-example-consolidation.md)：删除专用 runner/application 入口与命令，固定材料和参考检查移入 DocGen 角色；迁移四项集成测试，保留错误、覆盖、引用、Prompt 冻结、DSH 调用审计、CAS、失败与取消断言。当时仅做类型、导入/链接、样例源码摘要和清单静态检查，未运行测试或真实模型；普通 agent:run 不隐式执行参考检查。该交接中的账号偏好只属于原会话。

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

[2026-09-11-0808-trusted-publication-preparation.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/8baa5f2bd53050c8b708aed12fc4846c9b3256cc/docs/epitaph/2026-09-11-0808-trusted-publication-preparation.md) 可信集持久化及原始观察接发布准备，后续项目构建与来源原始章节也逐步接入；最终发布事务尚未完成。

[2026-09-11-0810-project-publication-binding.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/041b7dbe8ec43db3ec3439e381cdc44fc6900e0a/docs/epitaph/2026-09-11-0810-project-publication-binding.md) 项目/参考源文件/构建约束接发布准备，真实两目标报告匹配。后续真实来源材料发现知识单元与源码模块身份不可混用并修复，最终发布未完成。

[2026-09-11-0812-source-publication-sections.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/9cc96b63da45b3c1deaf0598f4b6d4b13ee1b58f/docs/epitaph/2026-09-11-0812-source-publication-sections.md) 原始来源章节Domain核验与15真实章节验证；后续已接完整H2和材料投影，修复知识/源码模块身份混用。最终发布事务未完成。

[2026-09-11-0815-source-publication-preparation.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/1e1faa166c7d27649bb38b59e418884c36b2cae8/docs/epitaph/2026-09-11-0815-source-publication-preparation.md) 完整H2和原始来源Review接准备，后续材料/模块身份及接口策略校验完成。准备仍非最终发布，下一步提交事务。

[2026-09-11-0818-source-materials-binding.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/e8f626c98c77da49c88c7ee1fb7a28dd9e0d60be/docs/epitaph/2026-09-11-0818-source-materials-binding.md) 来源原始源码/观察投影匹配，修复知识单元和源码moduleId混用；之后全部准备门禁接齐，真实来源仍未整体结束。

[2026-09-11-0821-publication-test-policy.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/7b6f67631b79c47b0425b9143b289b81a359b07a/docs/epitaph/2026-09-11-0821-publication-test-policy.md) 接口/策略/固定与可信用例门禁及真实报告只读校验通过，随后完成发布事务和HTTP入口。真实来源仍未全卡通过，一键最终发布和部署未完成。

[2026-09-11-0824-publication-project-identity.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/462eb061ba3bc103f2da2ee48626c28c2691146c/docs/epitaph/2026-09-11-0824-publication-project-identity.md) 项目身份/manifest门禁和真实报告校验通过，后续已实现独立事务、HTTP/Console及一键发布。真实全卡来源与发布验收仍未完成。

[2026-09-11-0829-publication-transaction.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/e00c4509842485bd5f0190094cc11f2e6e42e24a/docs/epitaph/2026-09-11-0829-publication-transaction.md) 可恢复SQLite/文件发布事务落地，后续HTTP/Console和v15一键发布已接。该旧记录源码任务状态矛盾已经0838记录更正；原attempt1终止，attempt2仍运行。真实验收未完成。

[2026-09-11-0838-publication-http-panel.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/d442a10a0140bddf8af6e58e68592cd89e851ff6/docs/epitaph/2026-09-11-0838-publication-http-panel.md) 发布HTTP/独立面板接通，生命周期/受限匿名下载测试通过。后续v15最终发布与模块构建配置/历史选择已接。原source attempt1非JSON失败，同task恢复attempt2；无真实最终发布。

[2026-09-11-0841-pipeline-publication.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/8567275ce76d10fc51c51f095f4f84ae22fdbacf/docs/epitaph/2026-09-11-0841-pipeline-publication.md) v15最终发布及受控响应丢失恢复通过，后续模块参数/历史选择/缺依赖诊断已接；真实来源和发布验收仍未完成。旧交接将任意TS多卡片和动态Make执行误列必交范围，0855已按用户原计划纠正。

[2026-09-11-0845-module-builds.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/4fd7aab105c2427e557c5cc7de87056decb9472d/docs/epitaph/2026-09-11-0845-module-builds.md) 模块配置贯穿执行/发布并验证双C指纹，后续补受控固定执行及显式native模式但尚未实际运行；历史选择与诊断已接。原TS/动态Make额外范围已0855纠正，按原用户计划验收。

[2026-09-11-0850-project-history.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/d3da9c199cfac09fbcc7a4a75b06d3743a368418/docs/epitaph/2026-09-11-0850-project-history.md) 保存项目与精确版本历史选择已接；随后完整Console发布浏览器验证保存输入、匿名发布/下载、刷新及390px布局通过。真实来源任务已结束UNRESOLVED，待修订与最终真实发布。

[2026-09-11-0855-diagnostics-scope.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/4b48c14789e970955afa1fdbc1d6bcfaa6428aad/docs/epitaph/2026-09-11-0855-diagnostics-scope.md) 缺依赖诊断/匿名证据下载与原范围澄清完成；后续真实gcc、发布浏览器及480自动化通过。新增语言仍C/C++，TS保留markdownLite回归，Make/CMake识别与模块参数不等于执行任意原构建脚本。最终真实修订和部署未完成。

[2026-09-11-0859-browser-preparation.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/283a89397ffdb747d9b33d066ee0d5ac942603ad/docs/epitaph/2026-09-11-0859-browser-preparation.md) 发布浏览器测试准备后已实测通过，下载白名单与分析反馈DOM问题均修复。当前480自动化及32Console全部通过；真实来源仍有风险，已启动明确错误修订，最终部署未完成。

[2026-09-11-0908-source-bindings-browser.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/d842f1511dcf8c0207276d0a54e6cee5ac67a0be/docs/epitaph/2026-09-11-0908-source-bindings-browser.md) 摘要绑定和匿名发布下载修复完成，随后480自动化与32Console均通过。真实来源修订2卡成功并刷新索引，仍有风险，当前新重建运行，未真实发布或部署。

[2026-09-11-0916-console-regression.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/8e7c2c93114b35ecf432be9f7c11ee95362e3a92/docs/epitaph/2026-09-11-0916-console-regression.md) 480自动化通过，Console初次反馈错位与布局基线问题随后修复并32/32通过。真实两卡修订和新代码可信31/31、固定11/11通过，来源仍在复核，未部署。

[2026-09-11-0918-live-source-correction.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/f82208072ae7a620739f16bcd34951bd76b37fcb/docs/epitaph/2026-09-11-0918-live-source-correction.md) 完整Console通过后真实两卡修订完成，新重建可信31/31固定11/11通过。新来源复核仍运行；独立混合风险章节修订已补，自动流程与最终发布部署未完成。

[2026-09-11-0921-revised-reconstruction.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/504ac15890a03be8e416a74385f5ae564184735e/docs/epitaph/2026-09-11-0921-revised-reconstruction.md) 两卡真实修订后重建可信31/31、固定11/11完成，新来源仍运行。随后独立及一键混合风险修订路径已接，风险保留，最终真实发布部署未完成。

[2026-09-11-0924-revised-behavior-passed.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/ef4b3d58ab68e7e16bd30a058e3f4674e416bf18/docs/epitaph/2026-09-11-0924-revised-behavior-passed.md) 真实jsmn新重建可信31/31固定11/11通过，新来源复核持续执行。后续独立及一键混合风险修订规则已接，原生新场景测试已准备但待执行；双目标最终发布部署未完成。

[2026-09-11-0928-mixed-source-corrections.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/595ad4bb64f204d43b6e2a4fb59f37376bd0333b/docs/epitaph/2026-09-11-0928-mixed-source-corrections.md) 独立混合风险章节选择完成，后续v16一键推进已接并定向通过；新原生混合风险测试准备完成但排队。真实来源仍运行，最终验收部署未完成。

[2026-09-11-0932-mixed-pipeline.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/d324b7adc78da01782dc63a7b779b96be1769943/docs/epitaph/2026-09-11-0932-mixed-pipeline.md) v16混合风险推进通过定向验证，随后原生三场景和相关浏览器两项通过。来源826fed已结束仍有矛盾/未知，新修订c32f运行；发现可信库无法增补新例，设计已写Spec待实现。最终发布部署未完成。

- 2026-09-11-0934：新增第三项原生混合风险应用场景，当时仅类型检查；后来实际3/3通过见0944记录。旧source826fed当时运行，随后已完成。原记录：[固定提交](https://github.com/linlisWorkTeam/domain-knowledge/blob/227a4414cbf87862bed2261245dd16ee0cf3ca3d/docs/epitaph/2026-09-11-0934-mixed-application-test.md)。

- 2026-09-11-0936：真实CAS审计证明两卡仅授权H2改变且索引精确更新；31个可信用例输入/预期跨版本不变。非发布验收，后续状态见0944。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/8b8a7f3834aeb328559434feaa148e7b9f7197d9/docs/epitaph/2026-09-11-0936-live-artifact-audits.md)。

- 2026-09-11-0944：原生混合应用3/3、Console筛选2/2通过；source826fed完成但UNRESOLVED，发现有可信库后永不新增测试缺口并先写Spec。后续实现见1508/1515。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/d58b044bca9f8affd09babd3139d347b81ceec26/docs/epitaph/2026-09-11-0944-source-supplement-gap.md)。

- 2026-09-11-1432：227a441补充测试领域合并规则，4单测/类型/Spec通过；当时尚未接服务，并确认旧修订宿主PID退出但数据库RUNNING。后续租约恢复与配置重验见1508。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/dc3dbf8d68b7e2a108706f001ea526a1c5caad53/docs/epitaph/2026-09-11-1432-supplement-domain.md)。

- 2026-09-11-1508：8b8a7f3补充评测服务与真实SQLite/CAS测试；原评测3/3、架构8/8。真实修订孤儿租约回收后发现供应商验证过期，原配置重验后恢复成功。后续来源/一键及部署见1515/1521/本次。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/3b83ac6c7921d4c522e9ab7bfcd1f881050ea792/docs/epitaph/2026-09-11-1508-native-supplement-service.md)。

- 2026-09-11-1515：来源未知需求经Domain/App/HTTP/Console交接补充评测，受控三场景通过；随后v17一键与部署见1521/1535。目标引用覆盖缺口在真实补证中发现，9月14日继续处理。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/3b83ac6c7921d4c522e9ab7bfcd1f881050ea792/docs/epitaph/2026-09-11-1515-source-supplement-entry.md)。

- 2026-09-11-1521：v17一键补证与部分修订推进，104单测通过；jsmn新版31可信/11固定通过但来源当时运行。后续source51992终态UNRESOLVED及部署见1535；9月14日全回归494通过已确认。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/ce81da2ca0837bb216a25812af86ae58101277f3/docs/epitaph/2026-09-11-1521-pipeline-supplement-v17.md)。

- 2026-09-11-1535：网站部署dc3dbf8，保留原runtime与回退、免登录；公开站点桌面/窄屏通过。source51992最终SUCCEEDED/UNRESOLVED，后续补证f1未晋升。部署完整路径、恢复命令与证据见[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/53e7c51618527fa49ed7aa1758262d6409cfe815/docs/epitaph/2026-09-11-1535-workbench-deployed.md)。

- 2026-09-14-0052：ce81da2新增补证目标Domain和原生服务可选检查，零命中候选不执行且原可信不变；6定向/类型/Spec通过，之后53e7已接阶段与页面。基线494回归确认，完整真实验收仍未完成。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/036a864ea3aa0ad8ba9b284ec9f7944831356417/docs/epitaph/2026-09-14-0052-supplement-target-check.md)。

- 2026-09-14-0100：53e7接入补证目标冻结、拒绝恢复反馈及页面。最终3应用/16架构流程页面/浏览器1通过，早期偶发暂停和浏览器总时限失败保留日志。后续真实修订/构建见0103。原scope尚未交接。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/d41c8c1dba36c822272e0ffcb67b6690b049ccb8/docs/epitaph/2026-09-14-0100-supplement-target-handoff.md)。

- 2026-09-14-0103：真实修订21cf两卡各一段变更并索引，重建d86fa成功；随后可信685ee 31/31及固定4112 11/11通过。供应商原配置重验revision6，未更换模型/密钥，旧可信保留。完整运行编号与driver见[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/a027c64decb7a40ac79c5732054274933f10ab23/docs/epitaph/2026-09-14-0103-live-native-revision.md)。

- 2026-09-14-0110：固定4112 11/11与可信685ee 31/31确认，旧输入预期CAS比较不变。新增SourceExecutionScope领域校验10检查通过并用真实CAS确认gcc/c11/x64单配置。后续App/发布和UI已在a027/112ba接通，当前真实source仍旧冻结策略。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/112ba4c804e34303483f4884842bb0ecc637ac2e/docs/epitaph/2026-09-14-0110-source-execution-scope.md)。

- 2026-09-14-0118：a027接入sourceExecutionPolicy/冻结scope、Review材料及发布逐章重验。26检查通过，原生回归排队；后续112ba页面与b5d运行中下载修复，均保留旧任务与风险。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/b5d05aa5e77073b9b1f8f1869c03a5c8b0bf4aee/docs/epitaph/2026-09-14-0118-source-scope-application.md)。

- 2026-09-14-0122：Console 展示冻结构建配置与原始材料下载，旧任务不伪造范围；随后 b5d 修复运行中证据绑定。页面单测通过，当时尚未部署。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/ec72c43893d8b929e29484e4368e54c9ebded511/docs/epitaph/2026-09-14-0122-source-scope-panel.md)。

- 2026-09-14-0126：来源执行范围在 Review 前保存检查点，免登录下载依然验证工件归属，等待状态避免提前404；5检查通过，后续已部署ec72。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/058bd421e5e7d3af96243eaa5613d98cbe6c0cc9/docs/epitaph/2026-09-14-0126-scope-download-checkpoint.md)。

- 2026-09-14-0134：审计C++旧6c904/537782与fb5/0c881绑定不同，provider参数摘要也与当前不同，要求同9卡新配置重建。后续17d6已完成，可信9ea26通过，详见0215。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/0ae56fe9a620efbebf8cb34c058a8d797fe7c657/docs/epitaph/2026-09-14-0134-cpp-acceptance-bindings.md)。

- 2026-09-14-0157：ec72网站通过独立发布目录部署，免登录原数据保留与完整备份；首页/health/API/两JS HTTP200并比对文件，26定向检查通过。最新浏览器和完整原生验收尚缺。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/40e8077a6cd47301556e14bb90b6a18b20ca7393/docs/epitaph/2026-09-14-0157-website-deployment.md)。

- 2026-09-14-0210：C来源54a完成53段、5差异/5未知；原生测试发现新scope任务错误早复用，0ae56fe限定旧策略分支后原断言6/6通过。启动C++新Code17d6，后续可信/固定均通过。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/e89be2e6ff80554131cea9164759bb62d5366f84/docs/epitaph/2026-09-14-0210-source-history-recovery.md)。

- 2026-09-14-0215：C++当前17d6重建成功、9ea26可信37/37且整套旧suite一致，随后同Code固定4db04启动并已40/40通过，见0216。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/572c78bfb54d02946c815cb154148de224c9885b/docs/epitaph/2026-09-14-0215-cpp-trusted-current.md)。

- 2026-09-14-0216：C++同17d6生成代码可信37/37、固定4db04 40/40通过，来源508961启动，scope/fingerprint/reference CAS及检查点绑定已核验，单构建不是全宏验证。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/3ded0a172ff46849b54278e30ef5416551954067/docs/epitaph/2026-09-14-0216-cpp-source-started.md)。

- 2026-09-14-0243：C++来源508961首次非JSON失败14调用后同任务恢复，保留13完成段落和累计用量；随后持续推进，最新handle见0332。[原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/49f8a6f28dadfbf5aff2533af407239e5c066fcb/docs/epitaph/2026-09-14-0243-cpp-source-resume.md)。

- [2026-09-14-0258-cpp-source-second-resume.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/3e1c73880dc5d4600c46e0649e01268a2c2b338e/docs/epitaph/2026-09-14-0258-cpp-source-second-resume.md)：C++ source508在32调用后第二次恢复，同输入保留用量；当时仅32段中间结果，未发布。后续最终63段结果见0646交接。

- [2026-09-14-0313-cpp-source-third-resume.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/906b84ed0f6d9c9387e7801786fbc2f2ff20d1d3/docs/epitaph/2026-09-14-0313-cpp-source-third-resume.md)：C++ source508在50调用后第三次恢复，保留旧输入与用量，47段为中间证据；最终63段及后续四卡修订见0646/0654交接，未发布。

- [2026-09-14-0332-cpp-source-fourth-resume.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/1157cd2ee945447a787efbeadf498c69337105ed/docs/epitaph/2026-09-14-0332-cpp-source-fourth-resume.md)：C++ source508在62调用后第四次恢复；当时58段为中间态，最终63段、四卡修订与新重建门禁结果见后续0646/0654/0703记录。

- [2026-09-14-0646-cpp-source-footer-revision.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c0d2888d339343ea5e34d788b377a02b095cbd88/docs/epitaph/2026-09-14-0646-cpp-source-footer-revision.md)：审计C++ source508终态，定位来源尾注分隔线误判并修复e66ec50，18项测试通过；四卡修订和新重建/门禁后续已完成，仍不能替代整链验收。

- [2026-09-14-0654-cpp-revised-reconstruction.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/8d9ae7c0bf383faa05b8762d74ed6829637a9f19/docs/epitaph/2026-09-14-0654-cpp-revised-reconstruction.md)：四卡修订83b3完成并增量索引，新Code6281从INT_MAX/isspace编译失败恢复；后续同代码37+40门禁已通过，见0703，仍待新来源及整链验收。

## PR #41 合并交接归档

- [2026-09-08-1423-session-identity-scope.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/9e66776cfbadbb1ec56f60991ef01e7e43139cbd/docs/epitaph/2026-09-08-1423-session-identity-scope.md)：删除固定账号的项目规则，明确账号选择只属于原会话；当时只做文档、清单及 diff 检查，未改业务逻辑或运行测试，不得继承旧身份约束。
- [2026-09-08-1442-domain-feature-layout.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/a79b385e16284ba8b4e76751f54c196b8fa7b33e/docs/epitaph/2026-09-08-1442-domain-feature-layout.md)：去掉 Domain services 分组与总导出，按 workflow、evaluation、association、knowledge 等功能组织，同步引用和设计；当时仅做类型、路径、Schema 与固定样例静态检查，未运行测试或模型。
- [2026-09-10-1001-development-progress.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/9e66776cfbadbb1ec56f60991ef01e7e43139cbd/docs/epitaph/2026-09-10-1001-development-progress.md)：在 Status 登记四阶段、S2 子步骤、依赖及证据索引；当时通过文档链接、清单及 diff 静态核对，未运行角色或业务验收。CodeAgent 后续确认由 1038 交接补充，其他输入输出继续逐项确认。
- [2026-09-10-1032-knowledge-generation-agent-baseline.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/a79b385e16284ba8b4e76751f54c196b8fa7b33e/docs/epitaph/2026-09-10-1032-knowledge-generation-agent-baseline.md)：记录知识生成分支的基线和数据流调研，独立 worktree bootstrap READY；当时未修改业务实现、未运行真实模型或端到端。全仓模块发现、TestGen oracle 晋升、Review findings 接入及业务质量仍待细化；Worker 归属随后由 1046 交接更新。

## 2026-09-14 状态文档合并

保留 main 的持久路线图，工作台当前未完成范围另列于 Status。合并前 feature 的逐轮发行与验收记录见[固定版本 Status](https://github.com/linlisWorkTeam/domain-knowledge/blob/39092ce/docs/Status.md)，包含 v0.2.0 的 markdownLite 发行结果及后续工作台历史。历史通过只适用于各自固定版本；当前 C/C++ 来源、关联、发布与浏览器验收仍未完成。

## 2026-09-14 合并交接归档

以下原文全部固定于本地合并提交 c5211c53034cfcb68b8b4983b5f73a0de0714684，随分支推送后可在链接查看。各条是历史执行状态；当前状态见最新交接和 Status。

| 原记录 | 已验证与未完成范围 |
| --- | --- |
| [2026-09-10-1046-docgen-internal-workers.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5211c53034cfcb68b8b4983b5f73a0de0714684/docs/epitaph/2026-09-10-1046-docgen-internal-workers.md) | DocGen内部Worker迁移、冻结材料与子任务复用；当时定向35项通过、全量227/229，结构验证不等于真实质量。 |
| [2026-09-10-1424-pr41-docs-merge.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5211c53034cfcb68b8b4983b5f73a0de0714684/docs/epitaph/2026-09-10-1424-pr41-docs-merge.md) | PR41文档合并保留Domain布局和内部Worker；Code/TestGen输入边界当时仍待实现或确认。 |
| [2026-09-11-1817-cjson-real-acceptance.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5211c53034cfcb68b8b4983b5f73a0de0714684/docs/epitaph/2026-09-11-1817-cjson-real-acceptance.md) | 独立cJSON真实验收整体失败；四批次已终止，参考48/49、Check失败及生成编译错误保留，不属于本次TinyXML2验收。 |
| [2026-09-14-0703-cpp-gates-current-regression.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5211c53034cfcb68b8b4983b5f73a0de0714684/docs/epitaph/2026-09-14-0703-cpp-gates-current-regression.md) | C++修订后可信37/37、固定40/40；source质量仍未闭环，前台与部署待完成。 |
| [2026-09-14-0712-draft-pr-frontend-followup.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5211c53034cfcb68b8b4983b5f73a0de0714684/docs/epitaph/2026-09-14-0712-draft-pr-frontend-followup.md) | PR50已建草稿；优先前台、完整验收后才按包含关系处理PR38/50。 |
| [2026-09-14-0722-frontend-entry-and-pr-conditions.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5211c53034cfcb68b8b4983b5f73a0de0714684/docs/epitaph/2026-09-14-0722-frontend-entry-and-pr-conditions.md) | 工作台入口与桌面窄屏截图已交付，受控入口通过；长Console流程尚待回归，未部署最新UI。 |
| [2026-09-14-0734-main-merge-role-evidence.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5211c53034cfcb68b8b4983b5f73a0de0714684/docs/epitaph/2026-09-14-0734-main-merge-role-evidence.md) | main合并保留Domain角色执行入口与证据审计，合并和真实验收均未完成。 |
| [2026-09-14-0738-code-contract-merge.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5211c53034cfcb68b8b4983b5f73a0de0714684/docs/epitaph/2026-09-14-0738-code-contract-merge.md) | Code显式工作台契约与main原生默认协议并存；角色测试不证明完整闭环。 |
| [2026-09-14-0742-docgen-contract-merge.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5211c53034cfcb68b8b4983b5f73a0de0714684/docs/epitaph/2026-09-14-0742-docgen-contract-merge.md) | DocGen分阶段生成和H2修订保留为显式模式，内部Worker与默认完整输出共用入口。 |
| [2026-09-14-0745-review-contract-merge.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5211c53034cfcb68b8b4983b5f73a0de0714684/docs/epitaph/2026-09-14-0745-review-contract-merge.md) | Review工作台证据修订与main默认列表协议分离，范围和风险校验保留。 |
| [2026-09-14-0753-worker-testgen-registry-merge.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5211c53034cfcb68b8b4983b5f73a0de0714684/docs/epitaph/2026-09-14-0753-worker-testgen-registry-merge.md) | Worker事实模式、TestGen声明式模式与真实Registry集成；角色116/116，原生cache仍未通过。 |
| [2026-09-14-1604-source-types-example-merge.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5211c53034cfcb68b8b4983b5f73a0de0714684/docs/epitaph/2026-09-14-1604-source-types-example-merge.md) | 生产类型、独立运行17/17及DocGen受控SDK5/5通过；固定历史路径修复，整图尚未验证。 |
| [2026-09-14-1607-flow-regression-merge.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/c5211c53034cfcb68b8b4983b5f73a0de0714684/docs/epitaph/2026-09-14-1607-flow-regression-merge.md) | C++受控图及全树类型通过；TS回归发现内部Worker缺失，未放宽原断言。 |

## 2026-09-14 TypeScript回归交接归档

[1610原文](https://github.com/linlisWorkTeam/domain-knowledge/blob/84c98b3c9310d3a9c84087a0403b5af33432f586/docs/epitaph/2026-09-14-1610-typescript-flow-restored.md)：内部Worker、显式DocGen/Review协议与H2/风险门禁接通，TS完整7/7和C++/停止组合3/3通过；当时仅定向验证，真实目标与部署未完成。后续完整回归结果见最新记录。

## 2026-09-14 CI与Spec合并交接归档

[1613原文](https://github.com/linlisWorkTeam/domain-knowledge/blob/26b001956bbcc43cc4dd5a6ad04597f03ed0440a/docs/epitaph/2026-09-14-1613-spec-ci-merge.md)：合并main的验证路由、显式角色契约和当前Domain目录，保留Bubblewrap与安全约束；当时仍有两份文档冲突及搬迁链接待修，尚无远程CI或真实验收结论。后续合并和回归结果见保留记录。

## 2026-09-14 17:30 归档

[1616 main集成交接](https://github.com/linlisWorkTeam/domain-knowledge/blob/f543c59f922a522a8998506553788619778da1c1/docs/epitaph/2026-09-14-1616-main-integration-checkpoint.md)：合并main并联合Spec和历史，静态检查通过，保留v0.2.0；当时尚未全量回归、部署或合入PR。当前推进仍不能以静态检查代替C/C++真实验收。

## 2026-09-14 18:01 归档

[1626 回归与资源限制](https://github.com/linlisWorkTeam/domain-knowledge/blob/3c0b31070167c5334c05b8ddfc8a8140b4a76eae/docs/epitaph/2026-09-14-1626-regression-fixes-and-resource-limit.md)：当时完整回归600项577通过，修复契约样例及Code编译诊断交接；原生专项仍受512+64MiB资源预检限制，未降门槛。后来f543c59的CI代码601/601、Console39/39、acceptance25/25已通过；当前新增容量修复尚待CI及新引擎真实验收。

## 2026-09-14 模块批次交接归档

[2026-09-14-1658-browser-and-native-ci.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/5c72fa527bec86d7b6a254abd9f68e210b5dea47/docs/epitaph/2026-09-14-1658-browser-and-native-ci.md)：记录旧前台回归、C++ v11 重建和 CI cgroup 委派修复；当时 CI 与真实固定/来源验收尚未完成，网站仍 ec72c43。后续结果见最新交接；保留原隔离要求及原始证据。

[2026-09-14-1730-deployed-and-native-acceptance.md](https://github.com/linlisWorkTeam/domain-knowledge/blob/8492076d787bbfa759232337d59c621685016771/docs/epitaph/2026-09-14-1730-deployed-and-native-acceptance.md)：记录f543c59切换、保留符号链接备份、当时C++固定内存暂停及来源运行状态；后续固定和部署结果由最新交接取代，真实来源及最终发布仍未完成。

[1801 容量恢复与原生门禁](https://github.com/linlisWorkTeam/domain-knowledge/blob/77f8ab6bde0bc78cdfb8107f15397937241911f9/docs/epitaph/2026-09-14-1801-capacity-recovery-and-native-gates.md)：记录C++固定40/40、来源24匹配39未知、补证77条超过64条及恢复修复。旧网站和未获停止服务授权的状态已经过时；后续部署、C门禁、明确获准停止三套旧服务以及新来源复核见1857、1904和1923交接。原用例与未知风险不得删除。

[1857 模块批次部署](https://github.com/linlisWorkTeam/domain-knowledge/blob/c2c2b830718df9359b67c23921ec5b224b66a7db/docs/epitaph/2026-09-14-1857-module-batches-deployed.md)：记录5c72fa5部署、代码612/Console41/验收25通过、保留8运行和1卡，以及C/C++关联。项目目录和批次配置缺项此后已有实现，但新前台尚未部署，真实来源门禁仍未通过；部署脚本中的旧PID和发行路径不可直接复用。

[1904 C可信与固定门禁](https://github.com/linlisWorkTeam/domain-knowledge/blob/9117c441445ef60aa78ecd327bc137b659653755/docs/epitaph/2026-09-14-1904-c-gates-after-deployment.md)：C原7卡可信31/31、固定11/11、库内关联40条，工件分别69和29个校验通过；来源和最终发布未完成。这些结果不能覆盖随后修订的卡片版本。网站5c72fa5；运行控制进程临时降堆以满足预检，编译隔离未降低。

[1923 来源判断与历史证据](https://github.com/linlisWorkTeam/domain-knowledge/blob/dab50a5f9b2304caab6423a366b2575a5944ec3c/docs/epitaph/2026-09-14-1923-source-assessment-and-legacy-evidence.md)：来源判断策略版本化并保留旧Review证据只读兼容，三套旧cjson服务已获准停止且完成。该记录的C来源运行中状态已被后续终态取代，来源与最终发布门禁仍未全部通过。

[1954 中文原因及入口缺失](https://github.com/linlisWorkTeam/domain-knowledge/blob/bf7aa3f/docs/epitaph/2026-09-14-1954-frontend-reasons-and-remaining-work.md)：补充中文处理原因和发布截图；当时阶段入口未挂载、C修订UNRESOLVED。阶段入口后来恢复并以dab50a5部署，删除机制与真实最终验收尚未完成。

[2000 阶段操作恢复](https://github.com/linlisWorkTeam/domain-knowledge/blob/d869e1a680a3777fd55650fa8e95c24035166b07/docs/epitaph/2026-09-14-2000-stage-operations-restored.md)：恢复阶段子页并修复授权后的项目恢复；本地39+2定向通过，后续dab及d869远端Console41/41通过并部署。C修订3张成功、1张未知，335工件已审计，完整真实发布仍待完成。

[2012 前台首次部署](https://github.com/linlisWorkTeam/domain-knowledge/blob/f90d0b7/docs/epitaph/2026-09-14-2012-frontend-deployed-dab.md)：dab50a5完成代码619、Console41、验收25并部署，保留原数据。该记录的视口修复未上线状态已由后续d869部署取代；真实来源门禁与历史删除仍未完成。

[2018 发布折叠与删除契约](https://github.com/linlisWorkTeam/domain-knowledge/blob/3f8147e/docs/epitaph/2026-09-14-2018-publication-fold-and-deletion-contract.md)：875实现发布折叠和导航新名称，之后d869部署。删除领域/应用单库回执当时仍待真实投影；C来源修订3卡、1未知，335工件校验，但新版本未完成后续门禁。

[2034 新名称与发布折叠上线](https://github.com/linlisWorkTeam/domain-knowledge/blob/2ef007d/docs/epitaph/2026-09-14-2034-renamed-ui-deployed.md)：d869e1a完成代码627、Console41、验收25并部署；原8run/1card保留。该记录的运行PID只作历史定位，操作前仍须核实；真实最终来源验收和历史删除未完。

[2045 删除引用扫描](https://github.com/linlisWorkTeam/domain-knowledge/blob/9e19e00/docs/epitaph/2026-09-14-2045-deletion-reference-inventory.md)：新增966条记录归属扫描和递归CAS图。该记录将指纹误判为缺失工件，结论已被2053复核否定；当前336个真实工件全部校验通过、0缺失。不要据此修补或删除备份。

[2053 恢复与指纹修复](https://github.com/linlisWorkTeam/domain-knowledge/blob/4f51c8b/docs/epitaph/2026-09-14-2053-deletion-recovery-and-fingerprint-fix.md)：校验336个真实CAS工件、0缺失，纠正指纹误报；跨库意图和逐库回执支持中断恢复。生产删除、完整文件清理及真实C/C++最终验收尚未完成，后续契约已升级，不能恢复旧版测试意图。

[2100 HTTP维护与调度屏障](https://github.com/linlisWorkTeam/domain-knowledge/blob/6c09e43/docs/epitaph/2026-09-14-2100-maintenance-http-and-scheduler.md)：持久删除未恢复时阻止HTTP数据访问、SSE轮询与批次调度，启动不恢复阶段/流程队列，相关回归20项通过。该记录中旧运行按业务阶段判断空闲的限制由2130执行核验改善，跨进程写排他、完整删除和恢复后队列重启仍未完成。

[2108 冻结行与执行墓碑](https://github.com/linlisWorkTeam/domain-knowledge/blob/a166a6a/docs/epitaph/2026-09-14-2108-frozen-deletion-rows-and-tombstones.md)：引入跨库恢复v2冻结见证及工作台执行墓碑，19项存储/架构测试通过。旧runs后续已扩展为v2行见证并接入真实执行核验；当时生产文件清理及HTTP删除尚未开放，该限制仍需最终串联解决。

[2126 旧运行审计与异步维护](https://github.com/linlisWorkTeam/domain-knowledge/blob/ec67776/docs/epitaph/2026-09-14-2126-legacy-deletion-audit-and-maintenance.md)：旧runs支持审计墓碑和配置/用量保留，维护屏障增加锁内异步状态检查；37项旧删除回归与4项维护单测通过。实际执行核验和图库清理后续已补适配器，生产删除及完整真实C/C++验收仍未完成。

[2130 实际执行删除核验](https://github.com/linlisWorkTeam/domain-knowledge/blob/292ff0f/docs/epitaph/2026-09-14-2130-live-deletion-execution-check.md)：维护锁内读取原始工作流状态并结合检查点执行者，避免混淆业务阶段与执行存活，30项相关回归通过。该核验仍不能替代跨进程写入排他，最终删除UI/发布文件清理及真实C/C++验收未完成。

[2136 图检查点清理](https://github.com/linlisWorkTeam/domain-knowledge/blob/e2c0936/docs/epitaph/2026-09-14-2136-graph-checkpoint-deletion.md)：新增Graph库存与整线程清理适配器，26项相关回归通过。备份中的1141图记录和274工件种子后来已合入完整数据库/CAS审计，唯一工件仍336个，全部通过；生产其他派生文件和删除界面仍未完成。

[2142 合并库存及CAS清理](https://github.com/linlisWorkTeam/domain-knowledge/blob/22d254a/docs/epitaph/2026-09-14-2142-combined-inventory-and-cas-cleanup.md)：数据库/图/CAS库存合并并补双向引用，2107记录/336CAS审核通过；CAS清理支持冻结见证及恢复。文件见证之后已纳入持久协调器、应用入口也已统一；当时发布文件未覆盖，后续2202新增适配，生产目录范围和UI仍待完成。

## 2026-09-14 归档：持久文件恢复

[2146 原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/a00d9018cd944f022490e3e3e1a5d074d58f8ebf/docs/epitaph/2026-09-14-2146-persisted-file-recovery.md)：文件参与者与首次冻结见证进入恢复协调器；27项及最终11项测试通过，目录身份变化拒绝恢复。其v3现已由统一应用v4替代，生产删除接口、完整执行目录覆盖和真实C/C++最终验收仍未完成。

## 2026-09-14 归档：统一删除应用

[2151 原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/c735a701a63a321dd78b8c08704d53bd97e1150c/docs/epitaph/2026-09-14-2151-unified-deletion-application.md)：BatchDeletions统一到跨库恢复v4与receipt-v2，保存准备、记录提交、完成时间；28项测试和类型检查通过，旧单库删除引擎移除。其全写入排他与发布适配缺口已推进，生产接口、完整执行目录覆盖、前台及C/C++最终验收仍未完成。

## 2026-09-14 归档：发布文件清理

[2202 原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/352ca0d7a61073949f78b56fe0511bd66dd32573/docs/epitaph/2026-09-14-2202-published-file-deletion.md)：三类发布/索引文件进入摘要清单及持久清理，41项测试通过；备份只读审计2107记录、336CAS、4发布文件，无缺失与未知表。其生产接线和全部执行目录覆盖仍未完成，进程锁和存储组合已在后续提交推进。

## 2026-09-14 归档：运行目录进程锁

[2215 原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/51abbf5158f14d99f20b52e7d418d44905fd9a03/docs/epitaph/2026-09-14-2215-runtime-file-lock.md)：公共Composition采用Linux生命周期共享锁、维护升级独占，19项测试和类型/Spec校验通过。锁覆盖当前入口，不覆盖旧进程或外部SQLite工具；生产删除接口、全部执行文件覆盖及C/C++最终验收仍未完成。

## 2026-09-14 归档：删除存储组合

[2224 原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/e619924fcea34d82067ba655d74c560491c8c9af/docs/epitaph/2026-09-14-2224-runtime-deletion-assembly.md)：业务库、图、CAS、发布文件统一组装，33项测试与类型/Spec通过；目录授权与源码双向重叠检查。后续已加入工作区、会话及DSH home参与者，生产接线、前台和C/C++最终验收仍待完成。

## 2026-09-14 归档：工作区删除清单

[2235 原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/14da3c19d0ed6da2e8fe2745b1ee336f7f56fa25/docs/epitaph/2026-09-14-2235-workspace-deletion-manifest.md)：审计归属与角色工作区清单进入文件恢复协议，未知/共享保护；29项测试和类型/Spec通过。后续会话与DSH home清理已推进，公共入口与前台在新记录中交付；无审计归属目录不自动删除，C/C++最终验收仍未完成。

## 2026-09-14 归档：会话清理与DSH审计

[2245 原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/84d738bdef5e880efb0d0ee98be9175540715a38/docs/epitaph/2026-09-14-2245-session-deletion-manifest.md)：CodeAgent会话纳入清理，25项测试通过；只读备份初步识别75个DSH home和36375链接。后续已实现链接见证清理与HTTP/UI，未知归属不自动删除；全目标验收仍未完成。

## 2026-09-14 归档：DSH home删除

[2257 原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/2c55117b693fcab4bf94081cdd2a2504819e796d/docs/epitaph/2026-09-14-2257-dsh-home-deletion.md)：审计归属的DSH home文件和符号链接进入冻结见证清理，链接目标保留。后续HTTP/UI、多根恢复和CI已通过并部署；生产旧检查点缺少owner阻挡删除，C/C++最终发布仍待完成。

## 2026-09-14 归档：删除HTTP与Console

[2315 原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/aef905965b9f8f60e4e7a342b983a49321b5d83d/docs/epitaph/2026-09-14-2315-deletion-http-console.md)：真实删除预览、二次确认与恢复入口及窄屏验证完成；后续多DSH根、CI和部署完成，线上旧owner缺失仍阻挡删除，未删用户历史。

## 2026-09-14 归档：多DSH根删除

[2330 原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/887c79b/docs/epitaph/2026-09-14-2330-multiple-dsh-roots.md)：多根独立见证与故障恢复20项通过，后续已部署2c55117；旧owner缺失仍阻挡删除，C/C++最终验收未完成。

## 2026-09-14 归档：网站更新与旧owner阻挡

[2335 原记录](https://github.com/linlisWorkTeam/domain-knowledge/blob/21d1e1f/docs/epitaph/2026-09-14-2335-deployed-legacy-owner-block.md)：2c55117网站切换、完整备份、公网资源及数据核对完成；旧无owner检查点阻挡删除，未绕过。后续诊断修复已提交未部署，C++来源复核出现独立格式反馈缺陷，后续记录继续处理。
