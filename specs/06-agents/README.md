# Agent 规范

六类规范覆盖七个运行角色：

1. [编排类](orchestration-agents.md)：OrchestratorAgent
2. [知识生产类](documentation-agents.md)：DocGenAgent、可选 DocWorkerAgent
3. [知识写作风格](knowledge-writing-style.md)：中文自然表达、事实优先和确定性可读性检查
4. [测试生产类](test-generation-agent.md)：TestGenAgent
5. [代码与检查类](code-and-check-agents.md)：CodeAgent、CheckAgent
6. [评审类](review-agent.md)：ReviewAgent

统一信封、角色枚举和封闭的角色 payload 由 `agent-command.schema.json` 与 `agent-result.schema.json` 定义，Correction 另由 `correction.schema.json` 约束。成功结果的 `resultKind` 必须与 `agentType` 匹配，失败结果统一为 `error` payload；未知字段一律拒绝。所有输入 Artifact 在调用前授权，所有输出先 Schema 校验再提交。Agent 不能直接改变 Run 状态、发布知识或授予权限。

运行时采用两阶段校验：调用前先校验由受信工作流构造的 `AgentCommand`；Provider 的角色原始输出仍视为不可信，经过角色校验并将大对象提交 CAS 后，再规范化和校验 `AgentResult`。下游只消费规范化结果。具体配置冻结规则见 [ADR-011](../adr/ADR-011-agent-contract-and-run-configuration-snapshot.md)。

## 固定节点与有限定制

`src/infrastructure/workflow/langgraph/agent-definitions.ts` 是运行时 Agent 清单，固定七个角色的标识、职责、输入、输出、基础提示词和工具权限。Console 必须完整展示这些信息，但受信操作者只能维护 `promptAddon`：运行时把它追加到基础提示词，不能覆盖基础提示词。前台或 API 不得修改节点职责、Schema、边、并行关系、工具权限或 Agent 标识；这些变化必须走 Spec、Schema、代码和测试评审。

每次提示词变更都要记录 revision、操作者和审计事件。节点执行状态经 `WorkflowObserver` 转成 `WorkflowNodeProjection`，按 `runId` 在前台显示；Agent 自己无权直接写这份投影。

工作流启动时会冻结七个角色的 prompt revision、提示词摘要、Provider/模型摘要、工具权限和 Schema URI。运行中的配置修改不影响该 Run，也不会把完整 Prompt 或凭据写入快照。
