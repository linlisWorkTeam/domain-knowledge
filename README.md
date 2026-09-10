<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明domain-knowledge。
-->
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

## 当前已实现

- 七类 Agent 通过 LangGraph 执行，支持并行、循环、取消和 Checkpoint 恢复；
- uiApi 统一进入 Orchestrator、Flywheel、EvalRunner、KnowledgeSearch、KnowledgeDiscovery、ContentGovernance、ProviderOperations、OperationalMetrics Application App；
- Flywheel、EvalRunner、Association Domain Service 与 Agent/工作流/持久化 Adapter 保持单向依赖；
- 候选知识绑定来源，工件使用 SHA-256 内容寻址；
- 质量 Gate 与行为发布 Gate 分开，只有完整证据和 `PASS` 能产生 `VERIFIED`；
- DeepSeek Harness 官方 SDK、Console 的 DSH 模型配置、角色工作区和 DSH Linux Bubblewrap 隔离；公司 CodeAgent CLI Adapter 仅通过自建协议夹具，真实参数与兼容性仍待核对；
- 知识血缘与差异、评测证据与规则、来源注册与漂移、知识健康度和生成/治理观测；
- CLI、资源化 HTTP API、DSH Adapter、双主题 Console 和项目网站；
- 项目无关的场景输入、真实评测与脱敏演示证据。

## 五分钟启动

第一次阅读或参与开发，请从[文档中心](docs/README.md)按任务进入；工程治理边界已收敛到[开发指南](docs/Development.md)和[贡献指南](CONTRIBUTING.md)。

需要 Node.js 24 或更高版本。以下命令启动只读 Console；浏览页面不需要模型凭据或额外的知识仓库。

```bash
git clone --branch main https://github.com/linlisWorkTeam/domain-knowledge.git
cd domain-knowledge
node --version
npm ci
npm run knowledge -- init
npm run knowledge -- status
npm run knowledge:serve
```

在运行服务的同一台电脑上打开 <http://127.0.0.1:4174>，保持启动终端运行，按 `Ctrl+C` 停止服务。新运行目录没有知识和批次数据是正常现象。

如果服务运行在远程服务器、容器或云开发环境，浏览器中的 `127.0.0.1` 指向你自己的电脑，需要先转发 4174 端口。已有检出如何更新、SSH 转发、临时 HTTPS 预览和启动排错见[快速上手](docs/GettingStarted.md)。需要扫描知识仓库时，再按该指南配置 `WP_KNOWLEDGE_REPOSITORY`。

执行项目工作流还需要有效的 DSH 配置和场景文件；它不属于只读页面预览步骤：

```bash
npm run knowledge -- workflow-run --scenario /path/to/scenario.json --repository /path/to/project
```

当前阶段、下一开发任务和后续队列见[开发状态](docs/Status.md)。详细配置见[快速上手](docs/GettingStarted.md)和[运维手册](docs/Operations.md)。真实运行记录与方案 PPT 保存在 [`wpKnowledge/knowledge`](https://github.com/linlisWorkTeam/wpKnowledge/tree/main/knowledge)。

## 目录

```text
domain-knowledge/
├── src/
│   ├── domain/               # 领域模型与确定性规则
│   │   ├── agents/           # 七角色步骤、契约、提示词
│   │   ├── workflow/         # 业务流程与生命周期
│   │   ├── evaluation/       # 评测判定
│   │   ├── association/      # 事实关联
│   │   ├── knowledge/        # 知识正文差异
│   │   ├── sourceScan/       # 来源扫描
│   │   ├── workspace/        # 工作空间
│   │   └── migration/        # 历史数据迁移
│   ├── application/          # Apps、Port 与用例协调服务
│   ├── infrastructure/       # LangGraph、Agent、DB/Redis Adapter 和评测
│   └── interfaces/           # uiApi、CLI、Runner 与 DSH 接口
├── docs/                     # 操作指南及按代码模块组织的 specs/ 设计
├── tests/                    # 单元、契约、集成、验收和安全测试
├── web/                      # 本地 Console
├── site/                     # GitHub Pages 静态网站
└── Runner.config.json        # 默认本地配置
```

旧仓库实现和原开放 PR 的承接关系见[仓库拆分历史](docs/HistoryEpitaph.md)。

## 开发门禁

```bash
npm run typecheck
npm run validate:specs
npm test
```

产品行为以 [Spec 总入口](docs/specs/README.md)为准，项目级开发进度以[开发状态](docs/Status.md)为唯一入口。调整 Agent 提示词前请阅读[Agent 定制指南](docs/AgentDevelopment.md)；职责、输入输出、拓扑、工具权限和发布权不能从前台替换。

固定项目评测只面向受信源码。它有临时工作区、环境净化和超时限制，但不是敌对代码沙箱，不应执行陌生仓库代码。
