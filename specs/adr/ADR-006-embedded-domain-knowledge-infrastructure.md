# ADR-006：内嵌 domain-knowledge 基础设施

- 状态：Superseded by [ADR-009](ADR-009-repository-split.md)
- 日期：2026-09-02
- Supersedes：ADR-002 中“LangGraph 仍待选择”的部分

## 背景

这份记录描述 2026-09-02 的仓库内嵌方案。当时 `wpKnowledge` 已经实现 KnowledgeVersion、来源、不可变证据、确定性发布门禁、SQLite Registry、CAS、反馈和 DSH 查询，而 `domain-knowledge` 只验证了 LangGraph 编排。ADR-009 后，完整运行时迁入 domain-knowledge，本节以下内容只用于解释旧决策。

最终产品需要一套自动工作流，也只能有一套知识事实源。把两个运行时作为平级服务会引入双 Run、双 Gate、双 Artifact 和分布式发布一致性，因此不采用跨仓库或远程服务协议。

## 决策

1. `wpKnowledge` 是上层产品和知识治理权威，继续拥有 `FlywheelRun`、`KnowledgeVersion`、`EvaluationReport`、`GateDecision`、`Publication`、业务事件、反馈和 DSH API。
2. `domain-knowledge` 迁入 `src/infrastructure/workflow/langgraph/`，作为相对独立的 infrastructure 模块。该模块拥有 LangGraph 拓扑、并行、循环、执行路由、AgentRunner、workspace 和 graph checkpoint，但不得直接把知识标记为 `VERIFIED`。
3. `runId` 同时作为 FlywheelRun ID 和 LangGraph `thread_id`。FlywheelRun 是对外状态事实源；GraphState 只是可恢复的执行状态。
4. LangGraph 节点状态通过受控观察端口投影到 Knowledge Registry。Console 读取该投影，不直接查询 LangGraph checkpoint 数据库。
5. LangGraph 的工作流路由和知识发布门禁分开。工作流路由决定继续、迭代、回滚请求、停止或失败；只有 wpKnowledge 发布门禁和发布事务可以产生 `VERIFIED`。
6. 全部 Agent 使用固定的节点定义：职责、依赖、可见输入、输出 Schema、工具权限和拓扑不能从前台修改。前台只允许为 Agent 保存一段追加提示词；覆盖值有长度限制、鉴权、持久化和审计。
7. ohMyWorkPanel 是固定的集成验收样例。它必须验证 LangGraph 节点可见、首轮失败、Review/修订、fresh 生成、真实项目评测和 wpKnowledge 原子发布。
8. 每次大规模能力建设必须同步检查产品 Console、GitHub Pages、文档、Spec、追踪矩阵和验收测试。

## 依赖方向

```text
CLI / HTTP / DSH / Console
            |
            v
wpKnowledge application + governance domain
            |
            v
WorkflowEngine port
            |
            v
src/infrastructure/workflow/langgraph (LangGraph)
            |
       AgentRunner / workspace / checkpointer
```

基础设施可以依赖上层定义的端口类型；领域和应用不得导入 LangGraph SDK 类型。`src/infrastructure/workflow/langgraph` 对外只导出稳定的创建函数和执行视图。

## 状态与持久化

- Registry 保存业务 Run、知识、评测、发布、Agent 提示词覆盖和节点执行投影。
- LangGraph SQLite 只保存 graph checkpoint。
- CAS 保存不可变内容；执行工作区只保存可重建的 materialized 文件。
- GenerationKey checkpoint 保护外部副作用，LangGraph checkpoint 保护图推进，两者都必须保留。

## 后果

优点是单部署、单公共 API、单知识事实源，同时保留 LangGraph 模块独立演进的目录边界。代价是 composition root 必须明确完成两类状态的映射，并用幂等键处理 Registry 提交与 graph checkpoint 之间的崩溃窗口。

不采用的方案包括：让 domain-knowledge 独立提供 HTTP 服务、让 Console 直接读取其 SQLite、允许页面编辑节点拓扑，以及把 LangGraph 的 `publish` marker 当作知识发布。
