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
