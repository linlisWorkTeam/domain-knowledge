<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：LangGraph 执行适配设计。
-->
# LangGraph 执行适配设计

代码位置：[src/infrastructure/langgraph/Graph.ts](../../../../src/infrastructure/langgraph/Graph.ts)、[src/infrastructure/langgraph/Runtime.ts](../../../../src/infrastructure/langgraph/Runtime.ts)、[src/infrastructure/langgraph/State.ts](../../../../src/infrastructure/langgraph/State.ts)。


Graph 将 Domain Workflow 的节点、静态连接和分支目标映射到 StateGraph、Send 与 START/END。角色节点执行 Application WorkflowStageExecutor，围绕执行记录尝试编号、readyAt、开始/完成和失败投影。Runtime 管理实例、运行中的取消信号和 checkpoint 恢复；State 定义 Annotation 及更新合并方式。

业务分块任务由 orchestratorTasks 返回，Adapter 只转换消息并发；路由由 candidateDestination、evaluationDestination、workflowDestination 决定。模型与模块评测共用一个进程执行槽，避免 ECS 上重进程争抢资源；逻辑分支不等于同时启动模型。异常由 NodeError 转为失败 Command；执行故障可与业务 STOPPED 区分。

Runtime 在首次运行持久化 `budgetStartedAt` 和 `budgetDeadlineAt`，每次最多 3 轮、1800000ms，包含排队、模型重试和评测。恢复沿用原截止时间，缺少预算信封或执行版本不兼容的旧记录只读。超时产生 `WORKFLOW_BUDGET_EXHAUSTED`，传递同一个 AbortSignal 到角色、模型及评测进程；停止服务也取消活跃任务并等待退出。图节点不另设无法传递到子进程的超时信号。

同版本恢复从持久 checkpoint 继续，Run 配置不兼容由 Application 拒绝。恢复执行不能跳过已提交结果的 generationKey 去重。SDK 类型不进入 Domain，Console 读取 Registry 投影而非 checkpoint SQLite。

独立角色开发直接调用 Application 和 Domain，不启动该图；基础设施不再提供单角色示例的兼容导出。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
