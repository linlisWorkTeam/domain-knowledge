# 系统上下文

```mermaid
flowchart LR
  U[工程师/知识治理者] -->|提交仓库、策略、审批| F[知识飞轮系统]
  F -->|状态、证据、治理包| U
  R[参考源码仓库] -->|只读快照| F
  F -->|模型请求| M[内部 GLM / Agent Runtime]
  F -->|执行命令/节点投影| W[内嵌 domain-knowledge / LangGraph]
  F -->|不可变内容| A[Artifact Store]
  F -->|构建/测试作业| S[隔离沙箱]
  F -->|候选/已验证知识| K[Knowledge Store]
```

## 边界与端口

系统内部按以下 DDD 依赖方向组织：

```mermaid
flowchart TB
  UI[uiApi / CLI] --> APP[Application]
  APP --> ORC[Orchestrator]
  APP --> FAPP[FlywheelApp]
  APP --> EAPP[EvalRunnerApp]
  APP --> SAPP[KnowledgeSearchApp]
  APP --> DAPP[KnowledgeDiscoveryApp]
  APP --> CAPP[ContentGovernanceApp]
  APP --> PAPP[ProviderOperationsApp]
  APP --> MAPP[OperationalMetricsApp]
  ORC --> DOMAIN[Domain Services]
  FAPP --> DOMAIN
  EAPP --> DOMAIN
  SAPP --> DOMAIN
  DAPP --> DOMAIN
  CAPP --> DOMAIN
  PAPP --> PORTS
  MAPP --> PORTS
  INFRA[Infrastructure: LangGraph / DB / Redis Adapters] --> PORTS[Application Ports]
  APP --> PORTS
  DOMAIN --> PORTS
```

Domain Service 包含 `FlywheelDomainService`、`EvalRunnerDomainService` 和 `AssociationDomainService`。具体 Agent Runtime、数据库驱动和 Redis 客户端均为 Infrastructure 实现，不进入 Domain。

| 端口 ID | 外部系统 | 核心看到的类型 | 责任 |
|---|---|---|---|
| PORT-001 | Agent Runtime / GLM | `AgentRequest`, `AgentResult` | 结构化生成、取消、超时、用量；由 Provider 适配。 |
| PORT-002 | Artifact Store | `ArtifactRef` | 内容寻址、原子写、摘要校验。 |
| PORT-003 | Sandbox | `ExecutionRequest`, `ExecutionResult` | 隔离执行和资源计量。 |
| PORT-004 | Knowledge Store | `KnowledgeVersion` | 候选、血缘、状态、发布事务。 |
| PORT-005 | 内嵌 Workflow Engine | `WorkflowCommand`, `WorkflowHandle`, `WorkflowNodeProjection` | LangGraph 节点、边、并行、循环、checkpoint、恢复与状态投影。 |
| PORT-006 | Language Plugin | `LanguageCapability` | 发现、构建、执行与标准化诊断。 |
| PORT-007 | Runtime State Store | `AgentContextStore`, `RunningStateStore` | 保存可重建 Agent 上下文与运行租约；不得持有知识和发布事实。 |

DSH、LangGraph、GLM SDK、数据库驱动和 C++ 工具链均位于领域与应用核心外侧；其 SDK 类型不得跨越端口。当前 `domain-knowledge` 以内嵌基础设施模块实现 PORT-005，不是独立服务，也不拥有 Run、知识、评测或发布事实。
