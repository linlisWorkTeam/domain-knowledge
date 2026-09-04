# Knowledge Flywheel 文档中心

本页是 domain-knowledge 文档的唯一首页。产品行为、权限、状态机和验收条件以 [`../specs/`](../specs/README.md) 为规范性事实源；这里的工程文档说明如何理解、运行、修改和维护当前实现。

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
| 修改工作流 | [工作流规范](../specs/05-workflows/knowledge-flywheel-workflow.md) | `src/infrastructure/workflow/langgraph/` | `tests/integration/langgraph-infrastructure.test.ts` |
| 修改 Agent | [Agent 规范](../specs/06-agents/README.md) | `src/infrastructure/workflow/langgraph/agent-definitions.ts` | `tests/integration/agent-contracts.test.ts` |
| 增加 API | [HTTP API](../specs/10-interfaces/http-api.md) | `src/interfaces/ui-api/` | `tests/integration/server.test.ts` |
| 修改 Console | [前台设计](../specs/04-product/frontend-product-design.md) | `web/` | `tests/e2e/` |

行为变化必须同步 Spec、实现、测试和追踪矩阵。具体步骤和完成定义见[开发指南](DEVELOPMENT.md)。

## 按需查阅

### 开发指南

- [新开发者快速指南（含 worktree）](guides/development-quickstart.md)
- [单个 Agent 角色定制](guides/agent-customization.md)
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

- [系统总览图](diagrams/system-overview.md)
- [知识生命周期图](diagrams/knowledge-lifecycle.md)
- [开发变更链路图](diagrams/development-change-flow.md)
- [新增 HTTP API](tutorials/add-http-endpoint.md)
- [新增或调整 Agent 能力](tutorials/add-agent-capability.md)

### 状态、报告与交接

- 当前状态只看[开发状态](DEVELOPMENT-STATUS.md)。
- 日期化快照和阶段性测评位于 [`status/reports/`](status/reports/)。
- 跨会话、未完成工作的交接记录位于 [`epitaph/`](epitaph/)。

## 文档维护边界

1. 产品行为属于 `specs/`；项目进度属于 `DEVELOPMENT-STATUS.md`；需求状态属于追踪矩阵。
2. 文档只描述可证明行为；计划、推断、fixture 与 live 证据必须明确区分。
3. 命令必须从仓库根目录可执行，并写明额外前提。
4. 解释性文字以中文为主；关键入口按[I18n 指南](guides/documentation-i18n.md)提供 English summary。
5. 知识正文和研究证据保存到 `wpKnowledge`，不在本仓库建立副本。
