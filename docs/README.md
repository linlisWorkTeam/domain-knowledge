<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明Knowledge Flywheel 文档中心。
-->
# Knowledge Flywheel 文档中心

本页是 domain-knowledge 文档的唯一首页。产品行为、权限、状态机和验收条件以 [`../specs/`](../specs/README.md) 为规范性事实源；这里的工程文档说明如何理解、运行、修改和维护当前实现。

## 目录树与用途

以下按当前仓库结构列出目录与文件，行尾注释说明用途；新增、移动或删除文档时同步更新。历史报告和交接记录保留当时背景，当前进度以 `DEVELOPMENT-STATUS.md` 为准。

```text
docs/                                                                       # 工程文档：理解、运行、开发与维护当前实现
├── README.md                                                               # 文档首页、阅读入口与维护边界
├── ARCHITECTURE.md                                                         # 目标架构、当前实现与模块边界
├── DEVELOPMENT-STATUS.md                                                   # 当前进度、验证基线与后续任务
├── DEVELOPMENT.md                                                          # 开发流程、工程约束与完成定义
├── GETTING_STARTED.md                                                      # 快速启动、环境配置与首次运行
├── OPERATIONS.md                                                           # 运行、评测、发布、配置与排障
├── diagrams/                                                               # 系统结构与流程图
│   ├── development-change-flow.md                                          # 规范、实现、测试与验收的变更链路图
│   ├── knowledge-lifecycle.md                                              # 知识从摄取到发布的生命周期图
│   └── system-overview.md                                                  # 系统组件与依赖关系图
├── epitaph/                                                                # 跨会话交接记录；按文件名时间戳读取最新记录
│   ├── 2026-09-04-0223-dev007-dev008-e2e-acceptance.md                     # 交接：DEV-007 / DEV-008 端到端验收与交接
│   ├── 2026-09-04-0710-dev006-dev009-complete.md                           # 交接：DEV-006～DEV-009 完成交接
│   ├── 2026-09-04-0926-dev010-company-cli-blocked.md                       # 交接：DEV-010 公司 CLI 环境阻塞交接
│   ├── 2026-09-07-1154-dsh-foundation-direction.md                         # 交接：DSH 底座方向与开发指导交接
│   ├── 2026-09-07-1212-dsh-documentation-audit.md                          # 交接：DSH 方向文档同步复核交接
│   ├── 2026-09-07-1617-dev019-r1-configuration-review.md                   # 交接：DEV-019 R1 配置迁移待审查
│   ├── 2026-09-07-1639-dev019-r2-live-configuration.md                     # 交接：DEV-019 R2 入口已实现，live 配置待补
│   ├── 2026-09-07-1712-dev019-r2-live-acceptance.md                        # 交接：DEV-019 R2 live 通过，等待 PR 审查
│   ├── 2026-09-07-1737-agent-code-development-guide.md                     # 交接：七角色代码开发指南待审查
│   ├── 2026-09-08-0953-main-cleanup-startup-docs.md                        # 交接：主目录清理与启动文档补充
│   ├── 2026-09-08-1015-search-agent-design.md                              # 交接：SearchAgent 文档设计交接
│   ├── 2026-09-08-1019-search-agent-pr-auth.md                             # 交接：SearchAgent PR 交付与账号边界
│   ├── 2026-09-08-1041-project-decoupling-opencode-go-env.md               # 交接：项目验收解耦与 OpenCode Go 环境配置
│   └── 2026-09-08-1043-decoupling-pr-and-branch-cleanup.md                 # 交接：解耦 PR 与合并后的分支清理
├── guides/                                                                 # 专题开发与配置指南
│   ├── agent-customization.md                                              # Agent 开发 SOP、角色定位与定制步骤
│   ├── ai-development-guide.md                                             # AI 协作开发流程与代码修改指南
│   ├── documentation-i18n.md                                               # 文档语言约定与英文摘要要求
│   ├── dsh-runtime.md                                                      # DSH 与 OpenCode Go 环境变量配置
│   └── testing.md                                                          # 测试分层、执行方式与验证策略
├── migration/                                                              # 历史迁移背景与操作说明
│   ├── repository-split.md                                                 # 运行仓库与知识仓库拆分说明
│   └── runner.md                                                           # 旧版 Runner 的迁移与兼容说明
├── reference/                                                              # 仓库结构等参考资料
│   └── repository-layout.md                                                # 全仓库目录布局与职责说明
├── status/                                                                 # 日期化状态快照与测试、测评报告
│   ├── report/                                                             # DSH Agent 底座测试报告存放处
│   │   └── 2026-09-07-DSH-Agent底座测试报告.md                             # DSH Agent 公共底座测试报告
│   └── reports/                                                            # 项目进度快照与框架阶段性测评
│       ├── 2026-09-04-当前项目进度报告.md                                  # domain-knowledge 项目进度快照
│       └── 框架阶段性测评.md                                               # LangGraph 多 Agent 框架阶段性测评
└── tutorials/                                                              # 按步骤完成开发任务的教程
    ├── add-agent-capability.md                                             # 新增或调整 Agent 能力的操作步骤
    └── add-http-endpoint.md                                                # 新增 HTTP 接口的操作步骤
```

## 这个项目是什么

`domain-knowledge` 是 Knowledge Flywheel 的运行仓库，负责 Agent 编排、知识摄取、评测、发布 Gate、Registry/CAS、HTTP API、CLI 和 Console。知识正文、研究材料和运行证据保存在 `wpKnowledge`。

## 5 分钟运行

```bash
npm ci
npm run typecheck
npm run validate:specs
npm test
npm run knowledge -- init
npm run knowledge:serve
```

打开 `http://127.0.0.1:4174`。完整配置和操作步骤见[快速上手](GETTING_STARTED.md)。

## 五个主要入口

后续开发按[已确认的 DSH 目标架构](ARCHITECTURE.md#target-architecture)和[公共开发 SOP](guides/agent-customization.md#agent-development-sop)推进：先底座与范例，再七角色开发。R1/R2 已合入；现有[角色开发指南](guides/agent-customization.md#目录与类)提供七角色的代码定位与分工步骤，后续按 T200/T210/T211 推进。可运行配置见快速上手，任务顺序见开发状态。

| 我想做什么 | 阅读 |
| --- | --- |
| 第一次运行项目 | [快速上手](GETTING_STARTED.md) |
| 理解系统为什么这样设计 | [架构说明](ARCHITECTURE.md) |
| 修改代码或产品行为 | [开发指南](DEVELOPMENT.md) |
| 运行、评测、发布或排障 | [运维手册](OPERATIONS.md) |
| 查看当前进度和下一任务 | [开发状态](DEVELOPMENT-STATUS.md) |

## 按开发任务定位

| 任务 | 规范入口 | 代码入口 | 测试入口 |
| --- | --- | --- | --- |
| 修改领域规则 | [领域模型](../specs/03-domain/domain-model.md) | `src/domain/` | `tests/unit/` |
| 修改工作流 | [工作流规范](../specs/05-workflows/knowledge-flywheel-workflow.md) | `src/infrastructure/langgraph/` | `tests/integration/LanggraphInfrastructure.test.ts` |
| 开发一个 Agent 角色 | [Agent 规范](../specs/06-agents/README.md)与[开发步骤](guides/agent-customization.md#agent-development-sop) | [目录、类与逐角色定位](guides/agent-customization.md#角色定位表) | `tests/integration/AgentContracts.test.ts`；逐角色测试见指南 |
| 增加 API | [HTTP API](../specs/10-interfaces/http-api.md) | `src/interfaces/ui-api/` | `tests/integration/Server.test.ts` |
| 修改 Console | [前台设计](../specs/04-product/frontend-product-design.md) | `web/` | `tests/e2e/` |

行为变化必须同步 Spec、实现、测试和追踪矩阵。具体步骤和完成定义见[开发指南](DEVELOPMENT.md)。

## 按需查阅

### 开发指南

- [AI 协作开发指南（Vibe Coding）](guides/ai-development-guide.md)
- [Agent 开发 SOP 与现有角色定制](guides/agent-customization.md)
- [DSH 与 OpenCode Go 环境变量配置](guides/dsh-runtime.md)
- [CodeAgent CLI 接入架构](ARCHITECTURE.md#codeagent-cli-integration)与[协议核验、配置及验收步骤](OPERATIONS.md#codeagent-cli)
- [测试策略](guides/testing.md)
- [文档语言与 I18n](guides/documentation-i18n.md)

### 参考资料

- [仓库目录参考](reference/repository-layout.md)
- [安全策略](../SECURITY.md)
- [贡献指南](../CONTRIBUTING.md)

### 迁移历史

- [从旧版 Runner 迁移](migration/runner.md)
- [从 wpKnowledge 拆出运行仓库](migration/repository-split.md)

### 图示与教程

- [SearchAgent 规范：Application 直接调度已发布知识检索](../specs/06-agents/search-agent.md)（设计已确认，待实现）
- [Agent 治理与检索流程图](../specs/05-workflows/knowledge-flywheel-workflow.md#agent-治理与检索关系)
- [系统总览图](diagrams/system-overview.md)
- [知识生命周期图](diagrams/knowledge-lifecycle.md)
- [开发变更链路图](diagrams/development-change-flow.md)
- [新增 HTTP API](tutorials/add-http-endpoint.md)
- [新增或调整 Agent 能力](tutorials/add-agent-capability.md)

### 状态、报告与交接

- 当前状态只看[开发状态](DEVELOPMENT-STATUS.md)。
- 日期化快照和阶段性测评位于 [`status/reports/`](status/reports/)。
- 跨会话、未完成工作的交接记录位于 [`epitaph/`](epitaph/)。

历史报告、ADR 和交接保留当时事实；其中的“下一步”或待评审方案不覆盖当前 DSH 方向，也不是继续旧 DFX/Pi 路线的授权。具体顺序以开发状态与 DEV-019 为准。

## 文档维护边界

1. 产品行为属于 `specs/`；项目进度属于 `DEVELOPMENT-STATUS.md`；需求状态属于追踪矩阵。
2. 文档只描述可证明行为；计划、推断、fixture 与 live 证据必须明确区分。
3. 命令必须从仓库根目录可执行，并写明额外前提。
4. 解释性文字以中文为主；关键入口按[I18n 指南](guides/documentation-i18n.md)提供 English summary。
5. 知识正文和研究证据保存到 `wpKnowledge`，不在本仓库建立副本。
