# ADR-004：确定性评测和发布权分离

- 状态：Accepted
- 日期：2026-08-31

## 决策

Agent 生成和归因，EvalRunner/GatePolicy 以客观证据决策，Knowledge Publisher 独占发布权。LLM 自评和相似度均不能通过门禁。

自动工作流启动时必须把完整 `GatePolicy` 写入可恢复的工作流上下文，包括 `policyId`、稳定性阈值、全测要求和最大迭代数。后续 Gate 只能使用这份已固化策略，并校验其 `policyId` 与业务 Run 一致；不得在工作流内部重新硬编码阈值。

## 后果

门禁可复现且避免 maker 自审；必须维护真实 oracle、稳定测试集和版本化策略。
