# 用户用例与交互时序

**状态：Accepted｜版本：1.1.1｜基线日期：2026-09-02**

本文把需求、验收场景和用户入口连接成可执行的交互视图。时序图中的“必须 / 不得”具有规范性；具体能力是否已经落地，以[追踪矩阵](../13-verification/traceability-matrix.md)为准。

这些用例的页面信息架构、交互状态、API 需求和产品验收见[前台产品设计](../04-product/frontend-product-design.md)。

## 用例目录

| 用例 ID | 主要用户 | 用户目标 | 需求与验收映射 |
|---|---|---|---|
| UC-KF-001 | 知识消费者 | 只使用已验证知识并提交反馈 | KF-SYS-006、KF-SYS-016；AC-OBS-001、AC-COMPAT-001 |
| UC-KF-002 | 知识治理者 | 将有来源的候选知识经独立评测发布为 `VERIFIED` | KF-SYS-005、KF-SYS-006、KF-SYS-009、KF-SYS-015；AC-EVAL-002、AC-PUB-001 |
| UC-KF-003 | 工程师（启动与异常治理） | 启动由 Workflow Service 自动驱动的失败归因、局部修订与 fresh 再生成 | KF-SYS-001、KF-SYS-007、KF-SYS-008；AC-FLOW-001、AC-FLOW-002、AC-FLOW-003 |
| UC-KF-004 | 发布验收者 | 对固定 commit 完成可复验的真实源码闭环 | KF-SYS-017、NFR-011；AC-E2E-001 |
| UC-KF-005 | 旧 Runner 调用方 | 保持旧命令可用且不产生第二套事实源 | KF-SYS-016；AC-COMPAT-001 |
| UC-KF-006 | 受信操作者 | 查阅全部 Agent 和节点状态，并只追加提示词 | KF-SYS-020、KF-SYS-021；AC-OBS-002、AC-AGENT-003 |
| UC-KF-007 | 本地管理员 | 在设置中配置模型 API 并以 Pi Agent 工具作为默认任务执行方式 | KF-UI-021；AC-UI-024 |

## 参与者与责任

| 参与者 | 责任 |
|---|---|
| 知识消费者 | 查询、读取和反馈；不授予知识发布权限。 |
| 知识治理者 | 提交来源、候选内容、策略和由受信评测器产生的证据；只在 Gate `PASS` 后请求发布。 |
| 工程师 | 启动 Run、选择策略，并处理 `STOPPED`、`LOW_CONFIDENCE` 或需要批准的异常；不得代替 Gate 判定结果。 |
| OrchestratorAgent | 生成节点 DAG、资源声明和委派计划；不写知识、实现或测试，也不决定 Gate 结果。 |
| Workflow Service | 按计划自动推进 Run、调用 Agent、持久化 checkpoint，并根据确定性 Gate 选择下一条状态边。 |
| DocGen / CodeGen / Review | 分别生成知识、实现和 Correction；职责及可见数据受权限矩阵限制。 |
| EvalRunner | 独立执行构建与测试，提交不可变执行证据。 |
| Deterministic Gate | 根据固化策略和证据产生 `PASS / ITERATE / ROLLBACK / STOPPED`。 |
| Knowledge Publisher | 在一个事务中更新知识、Run、事件和 publication receipt。 |
| 受信操作者 | 查看固定 Agent 契约和执行状态；只能追加提示词，不能改职责、Schema、拓扑或工具权限。 |
| 本地管理员 | 配置模型 API URL 和 API Key、验证连通性并启用默认 Pi Agent 工具；不能从界面读回完整密钥。 |

## UC-KF-007：配置模型 API 并启用 Pi Agent

### 前置条件与结果

- 用户已进入治理模式并具有本地管理员权限。
- “设置”允许填写 API URL 与 API Key，并在保存前或保存后执行一次不产生领域副作用的连接测试。
- API Key 只能提交给服务端凭据边界，不得写入 URL、日志、浏览器本地存储、运行快照或普通配置查询响应；后续查询只返回“已配置”和脱敏提示。
- API URL 必须经过协议、主机和重定向策略校验，防止任意内网探测；错误必须区分地址无效、鉴权失败、模型不可用和超时。
- 有效配置启用后，新任务默认由 Pi Agent 工具执行。Pi Agent 仍受既有 Agent 契约、工具权限、工作区隔离、超时、审计和确定性 Gate 约束，不能获得发布权限或绕过评测。
- 未配置、验证失败或凭据失效时，真实任务必须明确禁用或失败关闭；不得静默回退到演示 Provider 并伪装成功。

### 计划接口

| 目的 | 接口 | 最小语义 |
|---|---|---|
| 读取配置状态 | `GET /api/v1/provider-settings` | 返回 Provider 类型、脱敏 API URL、Key 是否已配置、验证状态和最近验证时间，不返回完整 Key。 |
| 保存配置 | `PUT /api/v1/provider-settings` | 接收 `provider=pi-agent`、API URL 和可选的新 API Key；需要管理员鉴权、幂等与审计。 |
| 验证连接 | `POST /api/v1/provider-settings/verify` | 使用服务端持有的待验证或已保存凭据执行无副作用探测，返回分类结果。 |

该用例属于后续交付，本阶段只建立产品与安全契约，不实现页面控件或接口。

## UC-KF-001：查询已验证知识并反馈

### 前置条件与结果

- Registry 已初始化，并且至少存在一个已通过行为门禁的 `VERIFIED` 版本。
- 未显式指定状态时，查询必须只返回 `VERIFIED` 知识。
- 反馈必须形成独立记录，不得直接修改知识正文、状态或 GateDecision。

```mermaid
sequenceDiagram
    autonumber
    actor User as 知识消费者
    participant Client as Dashboard / CLI / DSH
    participant Query as Query Service
    participant Registry as SQLite Registry
    participant CAS as Artifact Store

    User->>Client: 输入查询词
    Client->>Query: query(q, status=VERIFIED)
    Query->>Registry: 检索已发布版本及元数据
    Registry-->>Query: KnowledgeVersion 命中
    Query->>CAS: 读取并校验正文 Artifact
    CAS-->>Query: 完整正文
    Query-->>Client: 排序结果 + provenance + versionId
    Client-->>User: 展示可使用的知识

    opt 用户评价或指出错误
        User->>Client: hit / rate / correct + note
        Client->>Registry: 保存 Feedback(versionId)
        Registry-->>Client: accepted
        Note over Registry: Feedback 不直接改变<br/>VERIFIED 权限或正文
        Client-->>User: 反馈已记录
    end
```

### 用户入口

| 目的 | 入口 |
|---|---|
| 查询 | `npm run knowledge -- query --q <text>` |
| 精确读取 | `npm run knowledge -- get --module <module-id>` 或 `--version <version-id>` |
| 反馈 | `npm run knowledge -- feedback --module <module-id> --action hit\|rate\|correct` |
| 图形界面 | 启动 `npm run knowledge:serve` 后访问本地 Dashboard |
| Agent/DSH | `wp_knowledge_query`、`wp_knowledge_feedback`；不得发布 |

## UC-KF-002：从候选到 VERIFIED

### 前置条件与结果

- 知识治理者必须提供稳定 `moduleId`、非空 Markdown 和至少一个 provenance。
- Quality Gate 的 `ACCEPTED` 只允许候选进入行为评测，不代表知识正确。
- 通用 `evaluate` 入口只接收受信评测报告，不负责启动编译或测试进程。
- 只有与 Run、版本和证据范围一致的 `PASS` 决策可以发布。

```mermaid
sequenceDiagram
    autonumber
    actor Governor as 知识治理者
    participant CLI as CLI / Protected API
    participant Service as Flywheel Service
    participant CAS as Artifact Store
    participant Registry as SQLite Registry
    participant Evaluator as 独立评测器
    participant Gate as Deterministic Gate
    participant Publisher as Knowledge Publisher

    Governor->>CLI: ingest(Markdown, provenance)
    CLI->>Service: ingestCandidate()
    Service->>CAS: 写正文并生成 sha256 ArtifactRef
    Service->>Service: 执行 Quality Gate
    Service->>Registry: 保存 CANDIDATE + parent + quality
    Service-->>Governor: versionId + QualityReport

    alt Quality = REJECTED
        Note over Governor,Registry: 候选可以保留，但不得进入行为 Gate
    else Quality = ACCEPTED
        Governor->>CLI: create-run(moduleId, policyId)
        CLI->>Service: CREATED → PLANNED → GENERATING → EVALUATING
        Service->>Registry: 逐次保存状态和事件

        Governor->>Evaluator: 使用候选执行独立构建与测试
        Evaluator-->>Governor: report + immutable evidence
        Governor->>CLI: evaluate(runId, versionId, evidence, metrics)
        CLI->>CAS: 保存并校验证据
        CLI->>Service: recordEvaluation()
        Service->>Gate: decide(report, policy)
        Gate-->>Service: GateDecision
        Service->>Registry: 原子保存 Report + Decision + REVIEWING + events
        Service-->>Governor: outcome + decisionId

        alt outcome = PASS
            Governor->>CLI: publish(runId, versionId, decisionId)
            CLI->>Publisher: 校验正文、provenance、证据和作用域
            Publisher->>Registry: 原子 supersede + VERIFIED + event + receipt
            Registry-->>Governor: publicationKey
        else outcome = ITERATE
            Service-->>Governor: 创建 Correction 并进入 UC-KF-003
        else outcome = ROLLBACK
            Service-->>Governor: 选择 historical best 并进入 UC-KF-003
        else outcome = STOPPED
            Service-->>Governor: 转 LOW_CONFIDENCE，交由人工治理
        end
    end
```

### 用户操作顺序

```text
init
  → ingest
  → create-run
  → transition PLANNED
  → transition GENERATING
  → transition EVALUATING
  → 在独立环境执行测试
  → evaluate
  → 若 PASS，则 publish
```

Run、version、decision 和 evidence ID 必须由前一步返回值传给下一步，不得按名称猜测或跨 Run 复用。

## UC-KF-003：失败归因与知识迭代

### 前置条件与结果

- 当前 Run 已在 `REVIEWING`，且 Gate 结果为 `ITERATE` 或 `ROLLBACK`。
- 工程师只负责启动 Run、固化策略和处理异常；正常迭代必须由 Workflow Service 自动驱动到终态，不要求工程师逐节点推进。
- OrchestratorAgent 只生成计划和委派关系，不得决定下一状态；状态转换只能接受确定性 GateDecision。
- Review 必须输出包含知识路径、判据、证据和风险的结构化 Correction。
- DocGen 只能修改 Correction 指定的知识范围；人工修订同样只能产生新候选。
- CodeGen 必须在 fresh 工作区根据新知识重新生成，不得读取上一轮实现或参考实现。

```mermaid
sequenceDiagram
    autonumber
    actor Engineer as 工程师
    participant Workflow as Workflow Service
    participant Orchestrator as OrchestratorAgent
    participant Registry as Registry / CAS
    participant Review as ReviewAgent
    participant Doc as DocGen
    participant Code as CodeAgent
    participant Eval as EvalRunner
    participant Gate as Deterministic Gate
    participant Publisher as Knowledge Publisher

    Engineer->>Workflow: 启动 Run + 固化 Policy
    Workflow->>Orchestrator: plan(moduleRefs, policyRef)
    Orchestrator-->>Workflow: 节点 DAG + resourceClaims
    Workflow->>Workflow: 校验 Schema、依赖和资源冲突

    loop Quality 或行为 Gate 非终态且仍有预算
        Workflow->>Registry: 读取当前版本、EvaluationReport 和证据
        alt 前次 Gate = ITERATE
            Workflow->>Review: review(knowledgeRef, evaluationRef, criterion)
            Review-->>Workflow: Correction(path, criterion, evidenceRefs, risk)
            Workflow->>Registry: 保存 Correction；Run → ITERATING → GENERATING
            Workflow->>Doc: revise(baseKnowledgeRef, correctionRef)
            Doc-->>Workflow: Knowledge v+1
            Workflow->>Workflow: 校验指定范围外字节未改变
            Workflow->>Registry: 保存新 CANDIDATE 与 parent lineage
        else 前次 Gate = ROLLBACK
            Workflow->>Registry: Run → ROLLING_BACK；读取 historical best
            Registry-->>Workflow: historical best KnowledgeVersion
            Workflow->>Registry: Run → GENERATING
        end

        Workflow->>Workflow: 执行候选 Quality Gate
        alt Quality Gate 拒绝
            Workflow->>Registry: 保存 score、signals、weakPoints
            Workflow->>Doc: 下一轮携带质量反馈；本轮跳过 CodeAgent
        else Quality Gate 接受
            Workflow->>Code: fresh generate(newKnowledgeRef, publicInterfaceRefs)
            Code-->>Workflow: new implementation Artifact
            Workflow->>Registry: Run → EVALUATING
            Workflow->>Eval: build and test in isolated workspace
            Eval-->>Workflow: EvaluationReport + immutable evidence
            Workflow->>Gate: decide(report, policy)
            Gate-->>Workflow: PASS / ITERATE / ROLLBACK / STOPPED
        end
    end

    alt Gate = PASS
        Workflow->>Publisher: publish(runId, versionId, decisionId)
        Publisher->>Registry: 原子 VERIFIED + event + receipt
        Workflow-->>Engineer: 发布结果与审计引用
    else Gate = STOPPED
        Workflow->>Registry: LOW_CONFIDENCE + 治理证据
        Workflow-->>Engineer: 请求人工治理
    end
```

发布后的人工修改不得原地覆盖 `VERIFIED` 内容，而必须创建新 KnowledgeVersion 和新 Run，重新执行本用例。工程师可以取消 Run 或处理治理请求，但不得在正常迭代中代替 Workflow Service 手工选择下一条状态边。

## UC-KF-004：固定 commit 的真实源码发布验收

### 前置条件与结果

- 用户提供包含场景所固定 commit 的受信 Git 仓库。
- 系统必须通过 `git archive` 在源仓库外创建临时快照，不得 checkout、覆盖或清理用户工作区。
- 可重复测试默认使用 SchemaValidatedScenarioAgent；真实 Agent 演示可切换 DeepSeek Harness Provider。单次 live 结果只能证明接线和一次样例，不代表模型稳定性。
- TrustedProjectEvaluator 不是敌对代码沙箱；来源或生成代码不受信时必须拒绝运行。

```mermaid
sequenceDiagram
    autonumber
    actor Validator as 发布验收者
    participant Runner as Project Acceptance Runner
    participant Git as 受信 Git 仓库
    participant Agent as Scenario Agent
    participant Eval as TrustedProjectEvaluator
    participant Gate as Deterministic Gate
    participant Store as Registry / CAS

    Validator->>Runner: acceptance(repository, runtime)
    Runner->>Git: inspect(exact 40-char commit)
    Git-->>Runner: commit + checkoutHead + dirty
    Runner->>Git: git archive(fixed commit)
    Git-->>Runner: 仓库外临时快照

    Runner->>Eval: 执行 reference commands
    Eval->>Store: 保存 reference evidence
    Eval-->>Runner: reference 通过

    Runner->>Agent: DocGen v1
    Agent-->>Store: CANDIDATE v1
    Runner->>Agent: CodeGen v1
    Agent-->>Runner: implementation v1
    Runner->>Eval: 在临时快照执行 v1
    Eval-->>Gate: 首轮失败证据
    Gate-->>Runner: ITERATE

    Runner->>Agent: Review(failure evidence)
    Agent-->>Store: Correction
    Runner->>Agent: 仅修订指定知识章节
    Agent-->>Store: CANDIDATE v2，parent=v1
    Runner->>Agent: fresh CodeGen v2
    Agent-->>Runner: implementation v2
    Runner->>Eval: 执行最终白名单命令
    Eval-->>Gate: 完整测试证据
    Gate-->>Runner: PASS
    Runner->>Store: 原子发布 v2
    Store-->>Runner: VERIFIED + publication receipt
    Runner->>Store: 重放相同 publish
    Store-->>Runner: 同一 receipt，replayed=true

    Runner->>Git: 再次 inspect
    Git-->>Runner: checkoutHead 和 dirty 未变化
    Runner-->>Validator: runId + evidenceRefs + GateDecision + receipt
```

### 用户入口

```text
npm run acceptance:ohmyworkpanel --
  --repository <受信仓库路径>
  --runtime <仓库外运行目录>
  --output summary
```

固定 commit 来自场景定义；用户不得用任意分支 HEAD 隐式替换。完整流程和证据要求见[真实源码验收工作流](real-source-acceptance.md)。

## UC-KF-005：旧 Runner 兼容调用

### 前置条件与结果

- 旧调用方继续以 `fw.mjs` 作为进程入口。
- 兼容层必须和新 CLI 共用 `WP_FLYWHEEL_HOME` 指向的 SQLite/CAS。
- 兼容层不得实现第二套状态机、评分权威、定时器或发布路径。

```mermaid
sequenceDiagram
    autonumber
    actor Legacy as 旧自动化脚本
    participant Facade as fw.mjs
    participant CLI as TypeScript CLI
    participant Core as Knowledge Flywheel
    participant Store as Shared SQLite / CAS

    Legacy->>Facade: init / ingest / query / get / status / scan / feedback
    Facade->>Facade: 确定性映射旧参数
    Facade->>CLI: 调用同一命令入口
    CLI->>Core: 执行应用服务
    Core->>Store: 读写唯一 Registry
    Store-->>Legacy: 返回新核心结果

    alt score / eval / harvest
        Legacy->>Facade: 调用已退休命令
        Facade-->>Legacy: 明确失败 + 迁移指引
    else 使用 --root 选择平行存储
        Legacy->>Facade: --root <path>
        Facade-->>Legacy: 拒绝参数
    end
```

旧 `verified` 查询状态映射到 `VERIFIED`，旧 `draft` 映射到 `CANDIDATE`；旧 `eval` 不得映射到新发布流程，因为它缺少完整行为证据和 Gate 权威。

## UC-KF-006：查阅 Agent、节点状态和受限提示词定制

### 前置条件与结果

- Console 必须展示 Orchestrator、DocGen、DocWorker、TestGen、Code、Check、Review 七个固定角色。
- 所有人可以查看职责、输入、输出、基础提示词、工具权限和运行节点投影。
- 只有配置写 token 的受信操作者可以维护 `promptAddon`；未知 Agent、额外字段、超长或含空字符的内容必须拒绝。
- 修改只影响后续 Agent 调用，不改变基础提示词、职责、Schema、拓扑、输入输出或工具权限。

```mermaid
sequenceDiagram
    autonumber
    actor User as 使用者
    actor Operator as 受信操作者
    participant Console as Web Console
    participant API as HTTP API
    participant Catalog as AgentCatalogService
    participant Registry as SQLite Registry
    participant Graph as domain-knowledge / LangGraph

    User->>Console: 打开 Agent 设置页面
    Console->>API: GET /api/v1/agents
    API->>Catalog: listAgents()
    Catalog->>Registry: 读取 prompt revisions
    Catalog-->>Console: 固定契约 + promptAddon

    Operator->>Console: 输入追加提示词
    Console->>API: PUT /api/v1/agents/doc-gen/prompt + Bearer token
    API->>Catalog: configurePrompt(promptAddon)
    Catalog->>Registry: 保存 revision + AgentPromptConfigured
    Registry-->>Console: 新 revision

    Operator->>Console: 启动固定 ohMyWorkPanel Run
    Console->>API: POST /api/v1/run-commands/start
    API->>Registry: 保存 RunConfigurationSnapshot + Prompt ArtifactRef
    API->>Graph: start(runId, fixed scenario + frozen configuration)
    loop 每个节点变化
        Graph->>Registry: WorkflowNodeProjection(runId, node, status, attempt)
        Console->>API: GET /api/v1/runs/:id
        API-->>Console: FlywheelRun + workflowNodes
    end
    Note over Console,Graph: Console 不读取 graph checkpoint，<br/>也不能修改节点契约
```

## 接口与权限约束

| 接口 | 适用用户 | 能力边界 |
|---|---|---|
| CLI | 本地知识治理者 | 支持完整候选、Run、评测报告录入和发布操作。 |
| Dashboard / HTTP GET | 知识消费者 | 只读；默认查询 `VERIFIED`。 |
| HTTP POST | 受信本地治理者 | 未配置写 token 时返回 `503`；Bearer token 无效时返回 `401`。 |
| DSH Adapter | Agent 消费者 | 查询、状态、扫描、候选录入和反馈；不能发布。 |
| Legacy facade | 旧自动化 | 只映射保留命令；不能恢复旧评分或发布语义。 |
| Project acceptance | 发布验收者 | 仅用于固定 commit、受信源码和白名单命令。 |
| Agents / workflow commands | 受信操作者 | 公开读取固定 Agent 和节点投影；写 token 只允许追加提示词、启动/恢复/取消固定工作流。 |

所有写入口最终必须经过同一 Application Service、Registry 和 CAS。入口差异不得改变 `CANDIDATE → EvaluationReport → GateDecision → VERIFIED` 的权威链。

## 最终前台入口映射

- UC-KF-001 通过“知识”页面完成 `VERIFIED` 查询、详情、provenance 与 feedback；“添加知识”调用 ingest 时必须描述为创建候选，不得描述为人工发布或直接策展为 `VERIFIED`。
- UC-KF-003 通过“操作中心、飞轮批次、工作流图”呈现。操作中心当前只从批次状态与最新 GateDecision 派生批次级事项，不承诺独立问题实体、严重级别或关闭生命周期。
- UC-KF-006 通过“Agent 设置”和批次工作台呈现，固定契约与可编辑的 `promptAddon` 必须分区，WorkflowNodeProjection 与 FlywheelRun 状态必须分开标注。
- “来源”页面只读取 `GET /api/v1/sources/scan` 的来源候选；它不是持久化来源注册，来源刷新、漂移治理和删除语义等待后续接口。
- 产品 UI 不得调用 `/api/v1/transition`、`/api/v1/evaluate` 或 `/api/v1/publish` 模拟自动工作流。Graph 必须使用 Registry 中的真实节点投影；未实现的 Health、Activity、ETA 和 Action Item 能力必须隐藏或明确标记为尚未接入，不能回退到演示数据。

## 当前实现边界

- UC-KF-001、UC-KF-002 的核心存储、查询、评测录入和发布路径已实现；通用评测的进程执行仍由独立受信评测器负责。
- UC-KF-003 的状态、Correction 薄切片、增量修订、fresh 再生成和 PASS 后发布已由内嵌 LangGraph 在固定场景自动编排；通用候选的 CLI 仍支持人工逐步治理。自动 historical-best `ROLLBACK`、真实 AgentProvider 和生产沙箱仍按追踪矩阵标为 `Partial` 或 `Planned`。
- UC-KF-004 已以确定性 Scenario Agent 和受信 ProjectEvaluator 实现，不得外推为真实 GLM 质量或敌对代码隔离证明。
- UC-KF-005 已实现为兼容门面，且不拥有发布能力。
- UC-KF-006 已实现固定 Agent 目录、提示词 revision/audit、工作流节点投影和 Console 页面；它不允许可变拓扑或替换节点契约。
