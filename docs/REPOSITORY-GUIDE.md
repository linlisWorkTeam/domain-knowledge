# 仓库目录规则

目录直接表达依赖方向。domain-knowledge 是运行仓库，wpKnowledge 是内容仓库，两边不能再各放一套 Runner。

## 顶层结构

```text
domain-knowledge/
├── src/                     # 生产代码
├── acceptance/              # 固定场景夹具
├── deploy/                  # 部署配置
├── docs/                    # 工程说明
├── specs/                   # 规范性事实源
├── tests/                   # 自动化验证
├── web/                     # 本地 Console
├── site/                    # 项目网站
├── package.json             # 工作区命令与依赖
└── runner.config.json       # 默认配置
```

`src/` 使用四层结构：

- `domain/` 保存实体、状态与 Flywheel、EvalRunner、Association 领域服务，不依赖数据库或工作流 SDK；
- `application/apps/` 保存 Orchestrator、Flywheel、EvalRunner、KnowledgeSearch、KnowledgeDiscovery 五个用例入口；`application/ports/` 和 `application/services/` 保存契约与内部协调服务；
- `infrastructure/` 实现 LangGraph、Agent、评测、CAS、SQLite、Redis 运行状态 Adapter 与来源扫描；
- `interfaces/ui-api/` 是 UI/HTTP 正式入口，`interfaces/runner/` 和 `interfaces/dsh/` 提供 CLI、兼容入口与 DSH 接口。

旧的 `endlessWpKnowledgeRunner/` 包装目录已经取消。不要恢复根级 `apps/`、`packages/`，也不要把旧 `src/graph` 框架作为第二套实现搬回来；需要追溯时查看迁移前提交 `68b0fde`。

## 和 wpKnowledge 的边界

[`wpKnowledge`](https://github.com/linlisWorkTeam/wpKnowledge) 只保存知识正文、研究材料、设计文档、运行证据与索引。它不接收 TypeScript/Python 运行时、Agent Provider、数据库、测试或前台代码。

domain-knowledge 的 SQLite Registry 与 CAS 仍是一次运行中的业务事实源。它们是可重建的运行数据，不等于 Git 知识仓库。将通过验证的知识整理进 wpKnowledge 时，要创建普通 PR，让知识内容继续可读、可评审、可追溯。

## 新文件决策表

| 新内容 | 放置位置 |
| --- | --- |
| 领域实体、Domain Service、Gate 或状态规则 | `src/domain/`、`src/domain/services/` |
| 对外用例入口 | `src/application/apps/` |
| 用例协调或 Port | `src/application/services/`、`src/application/ports/` |
| Agent、评测器、持久化或来源扫描 | `src/infrastructure/` |
| LangGraph 图和 Checkpoint | `src/infrastructure/workflow/langgraph/` |
| Agent Context、Running State 的 Redis Adapter | `src/infrastructure/persistence/redis/` |
| UI/HTTP API | `src/interfaces/ui-api/` |
| CLI、兼容 Runner 或 DSH 接口 | `src/interfaces/runner/`、`src/interfaces/dsh/` |
| 产品或架构契约 | `specs/` |
| 测试 | `tests/` 对应层级 |
| 使用和维护说明 | `docs/` |
| 研究、知识卡、运行证据 | wpKnowledge 的 `knowledge/` |

## 一致性要求

1. Spec、实现、测试和文档必须描述同一行为。
2. 移动文件时同步修改 import、npm script、TypeScript include 和相对链接。
3. `.workpanel/`、数据库、外部源码检出和模型输出不得进入 Git。
4. 中文是解释性文档的默认语言；稳定的跨语言入口补简短 English summary。
5. `tests/contract/component-layout.test.ts` 会阻止旧包装目录和过时分层回流。

<details lang="en">
<summary>English summary</summary>

domain-knowledge owns executable code, specs, tests and product surfaces at the repository root. wpKnowledge is a separate content repository for reviewed knowledge and evidence. Do not reintroduce the retired endlessWpKnowledgeRunner wrapper or a second workflow implementation.

</details>
