<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：开发与交付指南。
-->
# 开发与交付指南

## 从代码定位设计

先读 [开发任务与进度](Status.md) 确认阶段、任务和依赖，再读 [规范目录](specs/README.md)，选择与改动代码相同的模块。Status 记录持久的 roadmap、能力状态和关键证据索引；模块设计写输入输出、业务步骤、不变量、失败与验证；本文件写实际开发操作。不要为每个任务创建六份 proposal/plan/tasks/evidence 模板文档，普通任务在所属设计和 PR 中完成说明。

| 改动 | 设计 | 实现 |
| --- | --- | --- |
| 角色内部步骤 | domainFunction/agents/xxxAgent/XxxAgent.md（[索引](specs/domainFunction/agents/Agents.md)） | src/domain/agents/xxxAgent |
| 跨角色流程 | domainFunction/workflow | src/domain/workflow |
| 生命周期与业务流转 | domainFunction/workflow | src/domain/workflow、Domain.ts |
| 评测判定 | domainFunction/evaluation | src/domain/evaluation |
| 事实关联与正文差异 | domainFunction/association、knowledge | src/domain/association、knowledge |
| 用例、材料加载和事务协调 | application | src/application/apps、services、ports |
| SDK、图、存储、评测接入 | infrastructure 的同名模块 | src/infrastructure 的同名目录 |
| HTTP / Console | interfaces、totalRules/UiuxDesign | src/interfaces、web |

## 本地准备

静态文档编辑与 `npm run spec:lint` 只需 Node 24，不要求安装依赖或 READY。执行依赖代码、类型检查或测试前，先用 `npm run bootstrap:worktree:check` 核对已有环境；缺失或失效才运行 `npm run bootstrap:worktree` 至 READY。依赖任务必须核对 lockfile SHA 与 node_modules 一致，node_modules 不跨工作树共享或软链接。

开始任务前按 AGENTS.md 阅读最新交接、核对 Git 状态并保留已有工作。角色修改示例和独立命令见 [AgentDevelopment](AgentDevelopment.md)，模型配置见 [Runtime](Runtime.md)。

## 实施步骤

1. 明确触发场景、期望结果和失败行为，在现有模块设计中更新对应段落。
2. 修改所属代码；增加共享能力才修改 Port、显式注册和 Composition。
3. 行为或协议变化同步 Schema、消费者和验收追踪；纯目录调整只改变路径，不改变 Schema 字节或测试判定。
4. 更新相应操作指南和有变化的 4+1 视图，避免复制设计全文。
5. 完成受影响检查，在 PR 或 commit 记录结果和未验证项。只有 roadmap、能力或验收状态发生持久变化才更新 Status；适用验收通过前不标记已验收。

新增 HTTP 能力先在 Application App 确认用例和端口，随后接 Server 路由和 Console；不要让接口绕过 App 调用数据库。新增角色必须显式更新 AgentContracts、AgentRegistry、Domain Workflow、可信输入加载和版本化契约。

## 修改代码后同步现有文档

以本次 PR 的实际 base 到 HEAD 差异定位受影响模块；未提交修改也纳入核对。先对照模块 Spec 更新行为、输入输出、不变量、失败与恢复，按实际影响同步跨模块 Workflow、4+1 视图和使用指南；验收条件或持久状态未变时不机械更新追踪矩阵或 Status。删除的是已经失效的当前状态描述；尚未实现的目标、用户延期事项和历史证据保留并明确标记，不能按代码现状缩减目标。

在 PR 里写明更新了哪些对应文档；无需更新的部分说明理由。`spec:lint`（兼容入口 `validate:specs`）静态检查 JSON、链接和追踪关系，不能证明描述与实现语义一致，需按实际代码和验收证据 review。当前没有保存代码后自动回写 Spec 的命令，也没有按代码差异强制匹配文档的 CI 门禁；PR 模板的同步项仍依赖开发者落实。

本仓库工程 Spec 的同步与 DocGen 生成业务知识是两项工作。业务源码更新后，先提交需要分析的源码，更新场景 expectedCommit（如已固定）、路径和构建配置，再用 `workflow-run` 发起新 Run；新源码身份产生新测试集合，未变的选定模块仍复用原集合。新知识必须重新评测并经 Gate PASS 后发布。`workflow-resume` 恢复旧快照，不会切换源码或覆盖本仓库的设计文档；入口与配置见 [Runtime](Runtime.md)。

## 验证清单

永久验证的批准和判断标准统一见 [AGENTS.md](../AGENTS.md#verification-governance)。本次治理重构按用户明确授权替换原全局 CI；以下为已有检查的范围和维护依据，不是给后续 Agent 自动增加检查的授权。

[VerificationRouter](../scripts/VerificationRouter.ts) 对 PR merge commit 与第一父提交做差异；main push 使用整个 push 的 before → HEAD。删除和重命名按删除+新增分类，混合修改取并集，未知代码/配置路径保守归为 dependency。普通 checkout 深度为 2；文档在任何位置的 `.md` 和 `docs/FileCatalog.json` 都属于 docs。所有 PR 都产生 `verify` 结果，避免整个 workflow 被 paths-ignore 跳过。

| change type | checks |
| --- | --- |
| docs | spec:lint + SpecValidator；Node 内置能力，无 npm ci / typecheck / runtime / browser |
| domain | 静态检查、typecheck、unit/角色测试、Agent machine contract、架构依赖与工作区安全 |
| application | 静态检查、typecheck、unit/角色测试、Agent contract、架构、后端 integration/security |
| infrastructure | 静态检查、typecheck、Agent contract、架构、后端 integration/security |
| web | 静态检查、typecheck、站点资源/CSP、Playwright；HTTP Server/uiApi 同时属于 application + web |
| schema | 静态检查、typecheck、Schema 正反例、真实 Agent contract 与架构 |
| dependency/CI | 上述范围并集，另含 lockfile、bootstrap 和路由测试；PR 不默认 acceptance |

Application 和 Infrastructure 当前集成用例共享生产组合根，先保留一个后端 integration 范围（不包含 bootstrap），不维护脆弱的逐函数测试映射。Domain 小修改不会进入该范围。路径分类是执行选择，不要求模块永远位于当前文件布局。

`npm test` 执行上述非 acceptance 回归，不安装或执行浏览器；`npm run test:ui` 单独执行浏览器。`npm run contract:test` 校验机器 Schema 正反例和实际 AgentCommand/AgentResult 边界；`spec:lint` 不 import Domain/Application，不编译运行时 Schema，也不加载 AJV。后端 integration 验证 Provider、CAS、事务、取消与恢复。受控 Provider 不等于真实模型质量证明。

完整 acceptance 在 main 的运行时变更合入后、manual dispatch，或 PR 明确修改 Domain workflow、AutomatedProjectWorkflow、固定参考样例、acceptance 测试时运行。纯 Markdown main push 仍只做静态检查。DocGen 历史样例已归入 acceptance，只在该独立 job 获取固定源码与参考测试的两个 commit，禁止因此扩大普通 checkout 历史；参考测试也从固定提交读取，不再以 SHA 冻结活跃单元测试的内容。

### 已有检查的去留与成本

以下时间是预算量级，受 runner 和缓存影响；安装依赖通常另需数十秒，浏览器安装可能数分钟。检查文件存在不代表执行通过。

| 原检查 | 分类与处理 | 保护对象 / 真实失败 | 触发与预计成本 |
| --- | --- | --- | --- |
| Architecture | HARD_INVARIANT：保留依赖方向与 SDK 隔离；IMPLEMENTATION_SHAPE：删除固定角色数量、文件清单、方法签名、源码关键字 | 反向依赖让核心绑定 Adapter，普通行为用例无法发现依赖倒置；层内重写仍可通过 | Domain/Application/Infrastructure/schema/依赖；约 1 秒内 |
| ComponentLayout | IMPLEMENTATION_SHAPE / STALE：删除目录快照、迁移禁用目录、中文计数、固定摘要和源码配置正则；SCOPED_CONTRACT：链接检查合入 spec:lint | 文档链接失效阻断定位；不强迫开发者保留旧目录 | 文档静态检查；约 1 秒内 |
| Site | SCOPED_CONTRACT：保留资源存在、离线资源、发布摘要与 CSP；删除历史发布身份、固定色值、文案、CSS hooks、捕获脚本和 workflow 实现正则 | 缺失/篡改发布字节、安全策略或部署路径错误；交互由浏览器和 HTTP 测试覆盖，主题标题以实际渲染对比度代替颜色清单 | web/依赖；静态约 1 秒内，浏览器约 1–3 分钟 |
| DependencyLock | SCOPED_CONTRACT：保留 HTTPS 与不可变来源；bootstrap 保留 SHA 过期检查 | 移动依赖来源或过期 node_modules 破坏复现；普通业务测试不能判断安装状态 | dependency/CI；锁检查 <1 秒，bootstrap 用例约数秒 |
| SpecValidator | SCOPED_CONTRACT：保留链接/追踪状态的正反例；删除重复加载仓库矩阵 | 引用丢失或 Planned 误报实现；普通 runtime 测试不消费这些文档 | docs 静态检查；约 1 秒内 |
| ValidateSpecs | SCOPED_CONTRACT：拆为静态 lint 和 ValidateContracts | 文档 ID/链接与机器信封是两个不同契约；运行时正反例不再随纯文档启动 | lint 约 1 秒内，机器契约约数秒 |
| VerificationRouter | SCOPED_CONTRACT：验证范围并集、docs/Domain 不带浏览器、显式验收 | 路由漏选会跳过必要检查，误选会把小 PR 送入全量测试；业务单测不执行 CI 分类，测试不固定 job/step 布局 | router/CI/依赖；约 1 秒内 |

后台 integration 和 acceptance 通常为几十秒至数分钟；没有外部模型调用。默认不新增 nightly，以免另造无人维护的定时成本。需要新增永久检查时，在 PR 中给出 AGENTS 要求的理由与批准；普通 task-local 验证完成后删除临时脚本/日志，保留结果摘要。失效检查应移除，不能改生产行为迎合它，也不能掩盖真正的安全或业务回归。

## Git 与交接

PR 围绕最终行为写动机、实现和验证，不自动合并。已存在 PR 的创建作者不可修改，重写 commit 需使用带预期远程值的 force-with-lease。

仅未完成的跨会话任务、复杂交接或重要未决问题新增时间戳文件；`docs/epitaph/` 保留最近三次，较早记录先总结到 [historyEpitaph](HistoryEpitaph.md)，包含改动、当时验证边界与原记录的 Git 链接，再移除旧文件。当前状态只在 Status 维护，不把旧报告当作新任务授权。

<details lang="en">
<summary>English summary</summary>

Locate the module design under docs/specs before editing code. Keep contracts, implementation and verification aligned. Bootstrap only for dependency-backed execution, document scoped checks, and distinguish controlled providers from live model evidence. Keep the latest three handoffs and summarize older records in HistoryEpitaph.md.

CI routes changes to static docs, domain, backend integration, schema, UI or dependency checks. Acceptance runs explicitly or after relevant main merges. Task-local verification does not become permanent CI without an approved stable invariant.

</details>
