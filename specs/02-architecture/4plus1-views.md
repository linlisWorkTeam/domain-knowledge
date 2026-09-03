# 4+1 架构视图

## 场景视图（+1）

`源码快照 → Doc/Test 两条独立链路 → 知识驱动 Code → Check → 确定性 Eval → Review → iterate/stopped/pass`。关键场景详见 `AC-FLOW-001`、`AC-SEC-001`、`AC-REC-001`；面向知识消费者、治理者、工程师、验收者和旧调用方的交互见[用户用例与交互时序](../05-workflows/user-use-cases.md)。

## 逻辑视图

- **Domain**：Run、Module、Artifact、KnowledgeVersion、EvaluationReport、Correction、GateDecision，以及 Flywheel、EvalRunner、Association 三个纯领域服务。
- **Application**：`Orchestrator`、`FlywheelApp`、`EvalRunnerApp`、`KnowledgeSearchApp`、`KnowledgeDiscoveryApp` 五个用例入口，以及工作流阶段执行器、权限策略、发布策略和幂等协调器。
- **Ports**：Agent、Workflow、Artifact、Knowledge、Sandbox、LanguagePlugin。
- **Infrastructure**：相对独立的 `domain-knowledge` LangGraph 图、并行/循环、SQLite Checkpointer、固定 Agent 定义、数据库 Adapter，以及可选 Redis 运行状态 Adapter。
- **Adapters**：DSH/进程 Provider、GLM、SQLite/CAS、项目评测和 C++ 插件。

依赖方向为 `Infrastructure/Adapters → Ports ← Application → Domain`；Domain 和 Application 不导入 LangGraph SDK 或语言专属类型。LangGraph `GraphState` 只保存执行控制，`FlywheelRun`、KnowledgeVersion、EvaluationReport 和 Publication 仍由 Knowledge Registry 保存。

## 进程视图

V1 为本地单控制进程。LangGraph 在进程内编排节点、fan-out、迭代和恢复；编译和测试在短生命周期受信执行进程树中运行。Artifact 先写临时对象并校验摘要，再原子提交；graph checkpoint 只记录执行控制，业务副作用另由 GenerationKey、Registry 事务和 publication key 去重。取消从 Run 向 worker 和执行器传播。

## 开发视图

实现单元：`src/domain/{services}`、`src/application/{apps,ports,services}`、`src/infrastructure/*`、`src/interfaces/{ui-api,runner,dsh}`、`web`、`tests/{contract,integration,acceptance}`。源码按领域驱动设计分层，依赖只能指向内层。TypeScript 是平台基线；基础设施与插件可调用开发工具包或外部工具链，但只能通过通用契约进入上层。

## 物理视图

V1 部署在个人电脑：domain-knowledge runner + Knowledge Registry + LangGraph SQLite Checkpointer + 本地文件 CAS + 受信项目执行器。两套 SQLite 用同一 `runId` 关联，但只有 Registry 是业务事实源。Redis 是团队部署时承载短期 Agent Context 与 Running State 租约的可选 Adapter；当前本地基线尚未启用。wpKnowledge 是独立 Git 内容仓库，不参与运行事务。网络默认关闭，仅 Agent Provider 可经显式出口访问配置的模型服务。生产扩展可替换 Provider、Artifact/Knowledge Store，但不改变端口或 Agent 节点契约。

## 约束验证

架构测试扫描 `src/domain` 和 `src/application/services`，禁止 LangGraph SDK 穿透，并检查只有 `src/infrastructure/workflow/langgraph` 持有 StateGraph；该模块不得持有 KnowledgeVersion、Publication、HTTP 或 Console 实现。语言插件契约测试使用非 C++ 假插件证明核心无语言假设。
