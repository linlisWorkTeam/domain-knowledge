<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：LangGraph 执行适配设计。
-->
# LangGraph 执行适配设计

代码位置：[src/infrastructure/langgraph/Graph.ts](../../../../src/infrastructure/langgraph/Graph.ts)、[src/infrastructure/langgraph/Runtime.ts](../../../../src/infrastructure/langgraph/Runtime.ts)、[src/infrastructure/langgraph/State.ts](../../../../src/infrastructure/langgraph/State.ts)。


Graph 将 Domain Workflow 的节点、静态连接和分支目标映射到 StateGraph、Send 与 START/END。角色节点执行 Application WorkflowStageExecutor，围绕执行记录尝试编号、readyAt、开始/完成和失败投影。Runtime 管理实例、运行中的取消信号和 checkpoint 恢复；State 定义 Annotation 及更新合并方式。

业务分块任务由 orchestratorTasks 返回，Adapter 只转换消息并发；路由由 candidateDestination、evaluationDestination、workflowDestination 决定。节点默认超时为 600000ms，异常由 NodeError 转为失败 Command；执行故障可与业务 STOPPED 区分。

同版本恢复从持久 checkpoint 继续，Run 配置不兼容由 Application 拒绝。Registry 业务提交与 LangGraph checkpoint 不是同一事务，Graph 在 executor 返回后才保存节点更新。Application 先持久化不可变路由结果，再幂等迁移 Run/保存停止交接；重放返回既有 route-v2 结果，不按已递增的 Run.iteration 重算预算。Gate 已提交而路由未提交时按相同证据取回决定，输入冲突拒绝。`tests/integration/WorkflowRouterReplay.test.ts` 用真实图异常注入及 resume 覆盖这些窗口；不能只凭 Orchestrator 重放测试声明 router 可恢复。SDK 类型不进入 Domain，Console 读取 Registry 投影而非 checkpoint SQLite。

独立角色开发直接调用 Application 和 Domain，不启动该图；基础设施不再提供单角色示例的兼容导出。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
