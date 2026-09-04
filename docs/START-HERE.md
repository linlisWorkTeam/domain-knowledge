# 从这里开始

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

打开 `http://127.0.0.1:4174`。

## 按任务查找

| 任务 | 首先阅读 | 代码入口 | 测试入口 |
|---|---|---|---|
| 修改领域规则 | [领域模型](../specs/03-domain/domain-model.md) | `src/domain/` | `tests/unit/` |
| 修改工作流 | [工作流规范](../specs/05-workflows/knowledge-flywheel-workflow.md) | `src/infrastructure/workflow/langgraph/` | LangGraph integration |
| 修改 Agent | [Agent 规范](../specs/06-agents/README.md) | `agent-definitions.ts` | `tests/integration/agent-contracts.test.ts` |
| 增加 API | [HTTP API](../specs/10-interfaces/http-api.md) | `src/interfaces/ui-api/` | `tests/integration/server.test.ts` |
| 修改 Console | [前台设计](../specs/04-product/frontend-product-design.md) | `web/` | `tests/e2e/` |

## 修改前必须确认

行为变化应同步更新 Spec、实现、测试、追踪矩阵和相关文档。完整原则见[工程治理原则](GOVERNANCE-PRINCIPLES.md)，开发步骤见[开发指南](DEVELOPMENT.md)。

## 系统如何工作

- [系统总览图](diagrams/system-overview.md)
- [知识生命周期图](diagrams/knowledge-lifecycle.md)
- [开发变更图](diagrams/development-change-flow.md)

## 常用入口

- 使用：[`GETTING_STARTED.md`](GETTING_STARTED.md)
- 开发：[`DEVELOPMENT.md`](DEVELOPMENT.md)
- 测试：[`TESTING.md`](TESTING.md)
- 当前状态：[`DEVELOPMENT-STATUS.md`](DEVELOPMENT-STATUS.md)
- 规范总入口：[`../specs/README.md`](../specs/README.md)
