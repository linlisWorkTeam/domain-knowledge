# Knowledge Flywheel 架构

> 文档语言：中文是规范说明的默认语言。类名、接口名和状态值保留英文，方便与代码互查。

<details lang="en">
<summary>English summary</summary>

domain-knowledge owns knowledge governance and execution. Its Domain/Application layers own `FlywheelRun`, evidence, `KnowledgeVersion`, the deterministic publication Gate and atomic publication. The isolated LangGraph infrastructure module owns fan-out, loops, cancellation and graph checkpoints. Both layers share `runId`, but LangGraph state never becomes a second business registry. wpKnowledge is the separate Git repository for reviewed knowledge content and evidence.

</details>

## 架构边界

运行时采用 DDD 与六边形依赖方向：

```text
uiApi / CLI
     │
     ▼
Application
├── Orchestrator
├── FlywheelApp
├── EvalRunnerApp
├── KnowledgeSearchApp
└── KnowledgeDiscoveryApp
     │
     ▼
Domain
├── FlywheelDomainService
│   ├── DocGenAgent
│   ├── TestGenAgent
│   └── CodeAgent
├── EvalRunnerDomainService
│   └── EvaluationAgent（确定性评测能力，不新增图节点）
└── AssociationDomainService
    ├── ExternalExtractor
    └── ReverseMapper
     │ Ports
     ▼
Infrastructure
├── Agent Runtime / LangGraph
├── DB：Knowledge / Workflow State / Agent Settings
└── Redis：Agent Context / Running State（目标 Adapter，当前未启用）
```

源码目录按同一依赖方向分层：

```text
src/
├── domain/
│   └── services/           # Flywheel / EvalRunner / Association 纯领域服务
├── application/
│   ├── apps/               # 五个用例入口
│   ├── ports/              # 入站和出站端口
│   └── services/           # 用例编排
├── infrastructure/         # 持久化、评测、智能体与工作流实现
└── interfaces/
    ├── ui-api/             # UI/HTTP 入站入口
    ├── runner/             # CLI、组合根与兼容入口
    └── dsh/                # DSH 查询接口
```

交互层和基础设施层可以依赖应用层，应用层可以依赖领域层，反向依赖一律禁止。目录收敛及旧源码根的处置见 [ADR-007](../specs/adr/ADR-007-ddd-layered-source-layout.md)。

`src/domain` 不引入工作流 SDK、数据库、模型 Provider、编译器或特定语言类型。`src/application/apps` 与 `src/application/services` 只依赖领域层和 Port。`src/infrastructure/workflow/langgraph` 用 LangGraph 实现工作流 Port，并保持独立模块形态。这样，图运行时可以继续演进，知识治理规则仍留在上层。架构契约测试会检查这些边界。详细决策见 [ADR-010](../specs/adr/ADR-010-application-domain-service-boundaries.md)。

`fw.mjs` 是 CLI 边缘的兼容门面。组件内统一维护产品 Spec、浏览器资源、HTTP Adapter、Console 只读投影、共享核心包、测试和验收 fixture。`src/interfaces/runner/server.ts` 是唯一 HTTP 实现。所有写路径都委派给共享 Application Service，不能另建 Registry、生命周期、评分、工作流或发布权威。

## 两类状态

系统有意保留两套状态模型，因为它们回答的问题不同：

- `FlywheelRun`、`KnowledgeVersion`、`EvaluationReport` 和 `PublicationReceipt` 是 domain-knowledge 持有的业务事实，持久化在 Registry。
- LangGraph `GraphState` 用于执行控制，记录当前节点、fan-out worker、路由、尝试次数和可恢复上下文。它由图 Checkpointer 保存，不能成为第二个知识库或发布库。

两层共享同一个 `runId`，在 LangGraph 中对应 `thread_id`。节点状态通过 `WorkflowObserver` 写入 `WorkflowNodeProjection`；Console 读取稳定投影，不直接打开图的 checkpoint 数据库。图 checkpoint 负责恢复执行，`GenerationKey`、CAS、Registry Event 和 publication key 负责保护业务副作用与审计记录。

图中有一个工作流路由 Gate，处理 `ITERATE`、`ROLLBACK`、`PASS` 和 `STOPPED`。`PASS` 只表示向上层请求发布；真正有权决定发布的仍是 Domain/Application 层的确定性知识 Gate。

## Agent 定制边界

七个图角色是 Orchestrator、DocGen、DocWorker、TestGen、Code、Check 和 Review。它们的标识、职责、输入输出契约、拓扑和工具权限固定在 `src/infrastructure/workflow/langgraph/agent-definitions.ts`。

操作员可以在 Console 查看所有角色，但只能维护 `promptAddon`。运行时把追加提示词拼在有版本的基础提示词后面，不替换基础提示词，也不改变节点契约。`AgentCatalogService` 会记录提示词修订和审计信息。

## 知识生命周期

1. 摄取流程把 Markdown 原始字节写入 CAS，并在 SQLite 创建 `CANDIDATE` 版本。
2. 确定性 Quality Gate 检查结构、来源、验证锚点和内容是否充实。`ACCEPTED` 只表示候选可以进入行为评测，不表示内容正确。
3. Run 按显式且单调的状态机前进。`EvaluationReport` 绑定测试总数、关键失败、稳定性、工具链指纹和不可变证据。评测报告、Gate 决定、Review 状态迁移及对应 Event 在同一事务提交。完全相同的重试会重放既有结果，输入冲突的重试会被拒绝。
4. 确定性 Gate 返回 `PASS`、`ITERATE`、`ROLLBACK` 或 `STOPPED`。
5. 发布流程先验证 CAS 完整性，再用一个 SQLite 事务更新 Run、将旧版本标为 superseded、把新版本标为 verified、追加 Event 并创建发布回执。

真实源码验收还定义了 `ProjectEvaluator` Port。本地受信 Adapter 会解析并归档指定 Git commit，在临时目录执行，不改变源码仓库当前 checkout。生成文件只写入临时目录；工具必须在白名单中，且不得经过 shell。完整进程证据最终写入 CAS。

Orchestrator、DocWorker、DocGen、TestGen、Code、Check 和 Review 的输出都会经过角色专属 JSON Schema 校验。默认 Scenario Provider 是确定性测试设施；设置 `WP_FLYWHEEL_AGENT_PROVIDER=deepseek-harness` 后，组合根会通过官方 stdio JSON-RPC SDK 启动短生命周期 DSH runtime。Prompt 不进入 argv，Code 输出路径还会被动态 Schema 收紧到场景白名单。一次成功 live Run 可以证明接线与样例结果，不能替代重复稳定性试验。

候选正文先过 Quality Gate。结构、验证锚点或可读性不足时，图会跳过本轮 CodeAgent，将 score、signals 和 weak points 放回下一轮 DocGen 上下文。行为评测仍在候选质量合格后执行，两个 Gate 不能合并。

## 持久化

- Artifact ID 使用 `sha256:<digest>`，并且必须与内容摘要一致。
- CAS 先写临时对象，flush 后重命名，再校验提交后的字节。
- SQLite 使用 WAL 和 `synchronous=FULL`。
- 状态、Event、GateDecision 和发布指针按事务提交。
- LangGraph 把执行 checkpoint 写入 `workflow/checkpoints.sqlite`；Registry 仍是业务事实和 Console 投影的唯一存储。
- `GenerationKey` 标识一次节点副作用。重复执行会返回已提交输出；首个执行尚在运行时，并发重复请求会 fail closed；失败记录可以重试，尝试次数和 Event 历史不会丢失。
- LangGraph 执行错误保持可恢复：`workflow-resume` 从最近一个带 task error 的 checkpoint 分支继续。它不会自动把 FlywheelRun 写成同名业务终态。
- publication key 为 `moduleId:versionId:policyId`；重复发布返回既有回执。

<a id="security-boundary"></a>

## 安全边界

- `/api/v1` 下的 HTTP GET 操作只读。
- 只有配置 `WP_KNOWLEDGE_WRITE_TOKEN` 且请求携带 Bearer token 时，HTTP 写接口才会启用。
- token 只是本地受信操作员边界，不是完整的用户、资源和动作授权矩阵。当前评测接口负责记录并校验提交的证据元数据，不自行编译或执行代码。
- 查询侧 DSH Adapter 只访问带版本的 HTTP API，不启动 Python 或 shell。Agent 执行侧的默认 live Adapter 是 `DeepSeekHarnessSdkAgent`；它通过官方 stdin JSON-RPC SDK 传递 Prompt，限制工作目录、时长和输出。旧 `DeepSeekHarnessHeadlessAgent` 仅作显式迁移兼容，两者都不是查询 Adapter。
- `LocalAgentWorkspace` 为每个节点复制显式允许的文件，拒绝路径穿越和源码符号链接。Linux live 模式再由 Bubblewrap 只读挂载角色视图、运行依赖和 patch，并给该节点单独挂载可写 DSH_HOME；参考仓库不进入该 mount namespace。
- Bubblewrap 仍保留模型 API 所需的网络。它证明代码生成角色的模型会话看不到参考源码，不证明生成代码可以安全执行。`CodeAgent` 在旧设计文档里是角色名，不代表当前运行时调用了独立的 CodeAgent CLI。
- 受信项目评测器会净化环境、拒绝路径穿越和符号链接目标、限制时间与输出，并终止进程树。这些措施用于避免验收任务误伤宿主机；子进程仍共享宿主机内核，不能用来运行敌对代码。
- 核心层另外定义了 Sandbox Port。真实 OS 隔离 Adapter 在通过逃逸、网络、文件系统和资源测试前，不受信的 C++ 执行必须 fail closed。

## 运行要求

本地 Adapter 使用内置 `node:sqlite` API，因此要求 Node.js 24 或更高版本。运行依赖包括内嵌 LangGraph/checkpointer 包，以及一次性迁移旧 OKF 所需的 `yaml`。正常知识存储使用 JSON 列和 CAS，不依赖 YAML 解析。
