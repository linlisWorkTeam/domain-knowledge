# domain-knowledge 基础设施层

本目录保存 Knowledge Flywheel 内嵌的 LangGraph 执行层。它与 `src/domain`、`src/application/services` 分开维护，使图运行时、AgentRunner Provider、工作区策略和 checkpoint 实现能够独立演进，同时避免 LangGraph 变成知识治理依赖。

<details lang="en">
<summary>English summary</summary>

This module owns LangGraph execution: topology, parallel workers, loops, routing and graph checkpoints. domain-knowledge owns business facts, evidence, publication decisions and public APIs. The Console reads projected node status through `WorkflowObserver`; it never reads LangGraph SQLite directly.

</details>

职责边界是固定的：

- 本模块负责图拓扑、并行执行、循环、执行路由和图 checkpoint。
- domain-knowledge 负责 `FlywheelRun`、`KnowledgeVersion`、评测证据、发布决定和公共 API。
- 图节点状态通过 `WorkflowObserver` 输出；Console 不直接读取 LangGraph SQLite schema。
- Agent 定义固定在代码中，前台只允许修改 `promptAddon`。

这里的代码来自 domain-knowledge 早期 LangGraph spike，现已接到同仓库的 Application Port。不要在本目录新增第二套知识存储、发布 Registry 或 HTTP Server。
