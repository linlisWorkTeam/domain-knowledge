# ADR-011：Agent 运行契约与 Run 配置快照

- 状态：Accepted
- 日期：2026-09-03

## 背景

七个 LangGraph Agent 节点已经可以通过确定性 Fixture 或 Provider 运行，但 `specs/schemas` 中的 `AgentCommand`、`AgentResult` 仍主要用于规范校验，生产调用链尚未统一消费这些信封。节点执行时还会读取最新 `promptAddon`，导致同一个 Run 的前后节点可能使用不同配置，难以复验。

本阶段只验证框架契约和运行机制，不评价真实模型质量，也不接入公司 CodeAgent CLI 或启用 Redis。

## 决策

### 统一信封

每次 Agent 调用必须形成版本为 `1.0` 的 `AgentCommand`，至少绑定 `commandId`、`runId`、`agentType`、`generationKey` 和角色 payload。调用前必须通过 Draft 2020-12 Schema 校验；失败时不得启动 Provider 或调度下游。

Provider 返回值首先视为不可信的角色原始输出。工作流负责执行角色专属校验、把正文或代码等大对象写入 CAS，再规范化为 `AgentResult`。只有通过统一 `AgentResult` Schema 的结果可以成为节点输出并被下游消费。Provider 不生成或猜测 ArtifactRef。

七个角色保持不变：`orchestrator`、`doc-gen`、`doc-worker`、`test-gen`、`code`、`check`、`review`。统一信封不能改变图拓扑、职责、工具权限或确定性 Gate 的发布权。

### RunConfigurationSnapshot

工作流启动时必须生成并持久化不可变 `RunConfigurationSnapshot`，包含：

- `schemaVersion`、`runId`、捕获时间；
- Provider 类型、模型标识和非敏感参数摘要；
- AgentCommand/AgentResult Schema URI 与内容摘要；
- 七个 Agent 的 prompt revision、基础提示词摘要、追加提示词摘要、有效提示词摘要和工具权限。

快照不得保存 token、Cookie、完整 Prompt、用户目录或 Provider Session。Run 启动后，节点只读取这份快照；操作员后续修改 `promptAddon` 只影响新 Run。

恢复 Run 时必须先比较当前运行时与快照。Provider、模型、非敏感参数摘要、基础 Prompt、工具权限、Schema URI 或 Schema 内容摘要不一致时拒绝恢复；系统不得悄悄改用当前环境配置。运行期间修改 `promptAddon` 不阻断旧 Run，但旧 Run 继续读取冻结的有效 Prompt 工件。

### Review 与基础设施失败

ReviewAgent 只审查已经形成的正常评测报告。认证失败、超时、进程崩溃、Schema 错误和其他基础设施故障由确定性工作流分类并进入 `STOPPED` 或可恢复失败路径，不额外调用 ReviewAgent。ReviewAgent 仍无权决定状态或发布。

## 验收

1. 七种合法命令和成功结果通过运行时 Schema；错误版本、缺字段、未知字段和角色错配在 Provider 或下游执行前失败。
2. 同一 Run 中途修改 Agent 配置不会改变后续节点使用的 prompt revision；新 Run 使用新 revision。
3. 配置快照能按 `runId` 查询和导出，但不包含完整 Prompt 或凭据。
4. 基础设施失败不会调用 ReviewAgent；正常评测仍经过 ReviewAgent。
5. 原有七个 Agent 和 LangGraph 边保持不变。

当前实现证据：运行配置冻结由 `tests/integration/run-configuration.test.ts` 验证；七类运行时结果信封、命令先验校验及原拓扑覆盖由 `tests/integration/agent-contracts.test.ts` 和 `tests/acceptance/automated-langgraph-flow.test.ts` 验证。真实模型输出质量不属于本 ADR 的完成条件。

## 后果

- Adapter 可以更换为公司 CodeAgent CLI，而不改变 Domain/Application 或节点契约。
- Checkpoint 恢复能够重用同一配置与 Schema 版本，评测报告具备可复验配置摘要。
- 新增 Schema 规范化和 CAS 写入步骤，但大对象不会膨胀 GraphState。
