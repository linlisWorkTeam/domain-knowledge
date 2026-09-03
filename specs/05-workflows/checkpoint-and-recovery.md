# Checkpoint 与恢复

## 两层 checkpoint

- LangGraph Checkpointer 保存 `GraphState`，用于恢复当前节点、并行 worker、轮次、尝试和路由上下文。
- Knowledge Registry 保存 `FlywheelRun`、GenerationKey、Artifact、Event、EvaluationReport 与 Publication，负责业务事实、幂等副作用和审计。

两层使用同一个 `runId/thread_id`。前台只能读取 Registry 中的 `WorkflowNodeProjection`，不得读取或解释 LangGraph checkpoint 表。恢复执行不等于重放业务事实：节点即使被再次调用，仍必须经过 GenerationKey 和 publication key 去重。

## 提交协议

每个有业务副作用的节点执行 `读取 graph checkpoint → 认领 GenerationKey → 执行 → 临时写 Artifact → 摘要校验/原子提交 → 追加业务事件/节点投影 → 提交 graph checkpoint`。checkpoint 不得成为 Artifact 或业务状态的唯一引用。

## 恢复语义

- `workflow-resume` 读取同一 `threadId/runId` 的状态历史。普通中断从最新 checkpoint 继续；执行状态为 `FAILED` 时，选择最近一个包含 task error 的 checkpoint 分支，重新调度该失败 super-step。
- 节点中途崩溃视为“结果未知”；允许重放，但同 GenerationKey 返回已提交结果或重新执行后 CAS 去重。
- `RUNNING` checkpoint 默认使用十五分钟租约，高于当前单节点十分钟执行上限。租约内的重复认领必须拒绝；租约过期后允许同作用域和同输入以递增 `retryCount` 接管。`retryCount` 同时是 fencing token，旧执行者不得提交或标记新租约失败；部署若调整节点上限，必须同步配置更长租约。
- 模型流式半成品、沙箱临时目录和未提交对象不进入领域状态，恢复时清理。
- 发布采用 `publicationKey=moduleId+versionId+policyId` 的比较交换；重复发布返回原 receipt。
- Agent/进程瞬时失败只把 LangGraph 执行标为 `FAILED`，不得自动把 FlywheelRun 写成业务终态。checkpoint 损坏或 Artifact 摘要不符时禁止继续，治理层才把 Run 转为 `FAILED` 并记录 `INTEGRITY_FAILURE`。
- 进程不会在关机期间继续；取消恢复后维持 `CANCELLED`，不会自动重启。

## 失败分类

`TRANSIENT` 可按策略退避重试；`AGENT_OUTPUT_INVALID` 和无法解析的 JSON 允许 Provider 在同一节点内有限重试，默认最多两次、部署上限三次。每次 Provider 尝试必须使用新模型 Session 并单独审计；业务 GenerationKey 不变。尝试耗尽后，LangGraph 节点才进入 `FAILED`，可由 `workflow-resume` 从 task checkpoint 恢复。`POLICY_DENIED`、`INTEGRITY_FAILURE`、路径拒绝和 `UNSUPPORTED_CAPABILITY` 不重试；`RESOURCE_EXHAUSTED` 是否重试由已固化策略决定。Registry Observer 按 `runId + nodeId + iteration` 计算持久化 attempt，进程重启后的重试不能覆盖上一次失败投影。

## 崩溃注入点

验收必须覆盖：模型返回后/Artifact 提交前、Artifact 提交后/事件前、事件后/checkpoint 前、发布 CAS 前后。每个点均验证无悬空引用、无重复发布、状态单调。
