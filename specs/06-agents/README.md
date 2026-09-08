<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明Agent 规范。
-->
# Agent 规范

> 开发方向：七角色后续直接基于 DSH 开发，先底座与 CPU 范例，再按[公共 SOP](../../docs/guides/agent-customization.md#agent-development-sop)分工。下文的 AgentCommand/AgentResult 是业务输入输出约定，不是需要自建的 Agent 运行框架；具体 DSH 配置留待 [DEV-019](../changes/active/DEV-019-dsh-agent-foundation/proposal.md)实施。

目标架构包含七个飞轮运行角色，以及一个由 Application 直接调度的 SearchAgent（设计已确认，待实现）。以下规范分别定义其职责：

1. [编排类](orchestration-agents.md)：OrchestratorAgent
2. [知识生产类](documentation-agents.md)：DocGenAgent、可选 DocWorkerAgent
3. [知识写作风格](knowledge-writing-style.md)：中文自然表达、事实优先和确定性可读性检查
4. [测试生产类](test-generation-agent.md)：TestGenAgent
5. [代码与检查类](code-and-check-agents.md)：CodeAgent、CheckAgent
6. [评审类](review-agent.md)：ReviewAgent
7. [检索类](search-agent.md)：SearchAgent，只检索治理后已发布的 `VERIFIED` 文档，不经过 OrchestratorAgent 或 LangGraph 调度。

以下统一信封、固定节点和 Run 配置规则适用于七个飞轮角色。SearchAgent 使用独立检索请求/结果契约，不属于当前角色枚举；不得为调用它创建治理 Run。

统一信封、角色枚举和封闭的角色 payload 由 `agent-command.schema.json` 与 `agent-result.schema.json` 定义，Correction 另由 `correction.schema.json` 约束。成功结果的 `resultKind` 必须与 `agentType` 匹配，失败结果统一为 `error` payload；未知字段一律拒绝。所有输入 Artifact 在调用前授权，所有输出先 Schema 校验再提交。Agent 不能直接改变 Run 状态、发布知识或授予权限。

运行时采用两阶段校验：调用前先校验由受信工作流构造的 `AgentCommand`；传给 Provider 的动态上下文必须是命令内字段，或由命令中 ArtifactRef 完整性校验后物化的内容，不允许附加未绑定旁路输入。Provider 的角色原始输出仍视为不可信，经过角色校验并将大对象提交 CAS 后，再规范化和校验 `AgentResult`。下游只消费规范化结果，并沿 `commandRef` 核对 Run、角色、命令和 GenerationKey。具体配置冻结规则见 [ADR-011](../adr/ADR-011-agent-contract-and-run-configuration-snapshot.md)。

## 固定节点与有限定制

`src/domain/services/workflow/AgentDefinitions.ts` 是运行时 Agent 清单，固定七个角色的标识、职责、输入、输出、基础提示词和工具权限。Console 必须完整展示这些信息，但受信操作者只能维护 `promptAddon`：运行时把它追加到基础提示词，不能覆盖基础提示词。前台或 API 不得修改节点职责、Schema、边、并行关系、工具权限或 Agent 标识；这些变化必须走 Spec、Schema、代码和测试评审。

每次提示词变更都要记录 revision、操作者和审计事件。节点执行状态经 `WorkflowObserver` 转成 `WorkflowNodeProjection`，按 `runId` 在前台显示；Agent 自己无权直接写这份投影。

工作流启动时会冻结七个角色的 prompt revision、提示词摘要、Provider/模型摘要、工具权限和 Schema URI。运行中的配置修改不影响该 Run，也不会把完整 Prompt 或凭据写入快照。
