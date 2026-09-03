# ADR-010：Application App 与 Domain Service 边界

- 状态：Accepted
- 日期：2026-09-03
- 修订：2026-09-04（DEV-007/008 增加运营与内容治理用例入口）

## 背景

仓库已经按 `domain / application / infrastructure / interfaces` 分层，但应用入口仍以历史的 `*Service` 名称暴露，知识飞轮、评测、搜索、发现与工作流编排的用例边界不够直观。最新架构要求从 `uiApi` 进入 Application，由明确的 App 协调用例，再通过 Port 使用 Domain 与 Infrastructure。

## 决策

Application 固定暴露八个用例入口：

- `Orchestrator`：启动、恢复、取消和查询知识飞轮工作流；
- `FlywheelApp`：管理 Run、候选知识、发布和幂等节点操作；
- `EvalRunnerApp`：提交评测证据并取得确定性 Gate 决策；
- `KnowledgeSearchApp`：查询已登记的知识版本；
- `KnowledgeDiscoveryApp`：发现尚未进入知识库的候选内容；
- `ContentGovernanceApp`：协调知识血缘/差异、评测证据与规则、来源注册和知识健康读写用例；
- `ProviderOperationsApp`：协调模型服务设置的脱敏读取、安全保存、验证和启用；
- `OperationalMetricsApp`：按稳定窗口读取运行速度、调用用量和治理效果指标。

后三个入口同样只能依赖 Domain/Port。它们不把来源访问、Provider SDK、秘密持有、SQLite 聚合或 HTTP 细节带入 Application，也不新增领域状态权威。

Domain 固定暴露三个领域服务边界：

- `FlywheelDomainService`：Run 生命周期和知识飞轮领域规则；
- `EvalRunnerDomainService`：评测报告到 GateDecision 的确定性判断；
- `AssociationDomainService`：外部事实抽取与反向映射的纯领域组合边界。

`DocGenAgent`、`TestGenAgent`、`CodeAgent` 是 Flywheel 领域流程中的生成能力；`EvaluationAgent` 是 EvalRunner 的评测能力名称；`ExternalExtractor` 与 `ReverseMapper` 属于 Association 能力。它们在 Domain 中只表现为角色、值对象或 Port，不得引入模型 SDK。LangGraph 继续在 Infrastructure 中实现七个既有运行节点，`EvaluationAgent` 不增加第八个生成式节点，也不改变现有拓扑。

`src/interfaces/ui-api` 是 UI 与 HTTP 的入站入口。CLI 和兼容 Runner 也只能调用相同的 Application App，不能越过应用层直接实现业务规则。

Infrastructure 继续承载 LangGraph、Agent Provider 和持久化 Adapter。当前本地基线使用 SQLite Registry、SQLite Checkpointer 与 CAS；Redis 预留为 `AgentContextStore` 和 `RunningStateStore` 的可替换实现。Redis 只能保存可重建上下文和运行租约，不得成为 KnowledgeVersion、GateDecision 或 Publication 的第二事实源。

`AgentContextStore` 只接受轮次、attempt、输入/输出 ArtifactRef 和路由结果，拒绝 Prompt、正文及任意扩展字段，并限制单条记录为 64 KiB。`RunningStateStore` 的释放操作同时校验 ownerId 与唯一 leaseId，避免同一 owner 重新获取租约后的 ABA 误删。

## 兼容与迁移

历史名称 `KnowledgeFlywheelService`、`KnowledgeQueryService` 和 `AutomatedProjectWorkflowService` 暂时作为兼容别名保留。新入口和组合根必须优先暴露 App 名称，避免一次性破坏 CLI、测试及外部调用方。

## 后果

- UI/API、应用用例、领域规则和技术实现有可测试的单向依赖；
- 更换 LangGraph、Provider、数据库或 Redis 不需要修改领域服务；
- 七个 Agent 的工作关系保持不变；
- Redis 在一致性规则确定前不会被误写成已经投入运行的能力。
