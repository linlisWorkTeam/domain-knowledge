<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：跨角色工作流设计。
-->
# 跨角色工作流设计

代码位置：[src/domain/services/workflow/Workflow.ts](../../../../../src/domain/services/workflow/Workflow.ts)、[src/domain/services/workflow/AgentDefinitions.ts](../../../../../src/domain/services/workflow/AgentDefinitions.ts)、[src/application/services/AutomatedProjectWorkflow.ts](../../../../../src/application/services/AutomatedProjectWorkflow.ts)。


## 输入、阶段和输出

输入是 Application 解析并固定的项目场景、材料引用、策略和 workerCount（传给 DocGen 的内部任务数量）。AgentDefinitions 显式绑定业务角色与节点；Workflow 给出固定连接及纯路由函数。角色自己的计划输出不驱动动态建图。

| 阶段 | 规则 | 下游 |
| --- | --- | --- |
| orchestrator | 测试生成与知识生成并行，外层不调度内部 Worker | test_gen；doc_gen |
| 文档链 | DocGen 内部调用 DocWorker，汇总全部片段后输出正文，再进行候选质量判断 | candidate_knowledge |
| candidate_knowledge | ITERATE / STOPPED 跳过代码生成 | workflow_router；其余进入 code |
| 验证链 | code → check；test_gen → oracle_validation | 两条链都完成后 evaluation |
| evaluation | FAILED 进入失败；STOPPED 交路由；其余审查 | failed / workflow_router / review |
| review | 输出纠正意见交 Application 保存和判定 | workflow_router |
| workflow_router | PASS 发布；ITERATE 加一轮；FAILED 失败；其余停止 | publication / orchestrator / failed / stopped |

`ProjectWorkflowStages` 加载历史知识、纠正意见、质量反馈和可信工件，调用 RoleExecutionService；角色不查询历史数据库。质量拒绝反馈进入下一轮 DocGen，预算用尽停止。评测由独立执行器完成，候选命令不直接成为门禁。

## 恢复和可观察性

Application 冻结配置，LangGraph 保存执行 checkpoint，Registry 记录业务提交和节点投影。相同 generationKey 的完成结果可重放；同版本失败节点可恢复，旧 roleExecutionVersion 明确拒绝。取消信号传到模型和外部执行，迟到角色结果不能提交。内部 Worker 使用 doc_gen/doc_worker:worker-N 投影与独立 Registry checkpoint；片段复用不依赖外层 LangGraph Worker 节点。DocGen 结果的 workerResultRefs 保留子任务血缘。

节点 status、attempt、iteration、readyAt 与开始/完成时间用于观测，不作为发布权威。状态不完整时显示不可用，不能从节点完成比例推断知识可信度。

## 验证边界

两轮源码、双场景图、质量不足、取消和同版本恢复有现有测试入口；内部 Worker 增加分块、失败取消、片段复用和独立组合样例验证。业务规则修改定位本模块；仅调整一个角色内部步骤定位 agents 目录。


文档关系：[设计目录](../../../README.md)负责代码与设计定位；[开发指南](../../../../Development.md)说明修改和交付步骤。
