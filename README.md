# domain-knowledge

`domain-knowledge` 是 Knowledge Flywheel 的运行仓库。它负责 Agent 编排、知识摄取、来源追踪、独立评测、确定性 Gate、版本发布、反馈和查询服务。原来放在 `wpKnowledge/endlessWpKnowledgeRunner/` 的 TypeScript 实现已经迁到这里；`wpKnowledge` 从此只保存可评审的知识、研究材料和运行证据。

<details lang="en">
<summary>English summary</summary>

domain-knowledge is the executable Knowledge Flywheel repository. It owns orchestration, runtime state, evaluation, gates, APIs and the Console. The separate wpKnowledge repository stores reviewed knowledge content and evidence; it no longer contains application code.

</details>

## 仓库分工

| 仓库 | 负责 | 不负责 |
| --- | --- | --- |
| `domain-knowledge` | LangGraph 工作流、七类 Agent、Registry/CAS、评测、Gate、CLI、HTTP、Console、Spec 和测试 | 长期保存跨项目知识材料 |
| [`wpKnowledge`](https://github.com/linlisWorkTeam/wpKnowledge) | 知识正文、研究、设计材料、治理证据和知识索引 | 运行服务、Agent 编排、数据库、前台代码 |

SQLite Registry 与 CAS 是运行时事实源，默认写到本仓库 `.workpanel/`。需要扫描 `wpKnowledge` 时，通过 `WP_KNOWLEDGE_REPOSITORY` 指向它的本地检出。当前发布事务不会自动提交或推送 Git；知识文件进入 `wpKnowledge` 仍要走普通 PR 评审。

## 已实现

- 七类 Agent 通过 LangGraph 执行，支持并行、循环、取消和 Checkpoint 恢复；
- uiApi 统一进入 Orchestrator、Flywheel、EvalRunner、KnowledgeSearch、KnowledgeDiscovery、ContentGovernance、ProviderOperations、OperationalMetrics Application App；
- Flywheel、EvalRunner、Association Domain Service 与 Agent/工作流/持久化 Adapter 保持单向依赖；
- 候选知识绑定来源，工件使用 SHA-256 内容寻址；
- 质量 Gate 与行为发布 Gate 分开，只有完整证据和 `PASS` 能产生 `VERIFIED`；
- DeepSeek Harness 官方 SDK、可在 Console 配置并验证的 Pi Agent Provider、公司 CodeAgent CLI Adapter、角色工作区和 Linux Bubblewrap 隔离；
- 知识血缘与差异、评测证据与规则、来源注册与漂移、知识健康度和生成/治理观测；
- CLI、资源化 HTTP API、DSH Adapter、双主题 Console 和项目网站；
- 固定 ohMyWorkPanel 场景、真实评测与脱敏演示证据。

## 五分钟启动

第一次阅读或参与开发，请从[文档中心](docs/README.md)按任务进入；工程治理边界已收敛到[开发指南](docs/DEVELOPMENT.md)和[贡献指南](CONTRIBUTING.md)。

需要 Node.js 24 或更高版本。

```bash
git clone https://github.com/linlisWorkTeam/domain-knowledge.git
git clone https://github.com/linlisWorkTeam/wpKnowledge.git
cd domain-knowledge
npm ci
export WP_KNOWLEDGE_REPOSITORY="$(cd ../wpKnowledge && pwd)"
npm run knowledge -- init
npm run knowledge -- status
npm run knowledge:serve
```

打开 <http://127.0.0.1:4174>。不需要扫描知识仓库时，可以不设置 `WP_KNOWLEDGE_REPOSITORY`。

固定 ohMyWorkPanel 工作流：

```bash
npm run knowledge -- workflow-run --repository /path/to/ohMyWorkPanel
```

当前阶段、下一开发任务和后续队列见[开发状态](docs/DEVELOPMENT-STATUS.md)。详细配置见[快速上手](docs/GETTING_STARTED.md)和[运维手册](docs/OPERATIONS.md)。真实运行记录与方案 PPT 保存在 [`wpKnowledge/knowledge`](https://github.com/linlisWorkTeam/wpKnowledge/tree/main/knowledge)。

## 目录

```text
domain-knowledge/
├── src/
│   ├── domain/               # 领域模型与确定性规则
│   │   └── services/         # Flywheel、EvalRunner、Association
│   ├── application/          # Apps、Port 与用例协调服务
│   ├── infrastructure/       # LangGraph、Agent、DB/Redis Adapter 和评测
│   └── interfaces/           # uiApi、CLI、Runner 与 DSH 接口
├── acceptance/               # 固定项目验收夹具
├── docs/                     # 上手、架构、开发和运维说明
├── specs/                    # 规范性事实源、ADR 与 Schema
├── tests/                    # 单元、契约、集成、验收和安全测试
├── web/                      # 本地 Console
├── site/                     # GitHub Pages 静态网站
├── deploy/                   # DeepSeek Harness 部署配置
└── runner.config.json        # 默认本地配置
```

旧仓库实现和原开放 PR 的承接关系见[仓库拆分历史](docs/migration/repository-split.md)。

## 开发门禁

```bash
npm run typecheck
npm run validate:specs
npm test
```

产品行为以 [Spec 总入口](specs/README.md)为准，项目级开发进度以[开发状态](docs/DEVELOPMENT-STATUS.md)为唯一入口。调整 Agent 提示词前请阅读[Agent 定制指南](docs/guides/agent-customization.md)；职责、输入输出、拓扑、工具权限和发布权不能从前台替换。

固定项目评测只面向受信源码。它有临时工作区、环境净化和超时限制，但不是敌对代码沙箱，不应执行陌生仓库代码。
