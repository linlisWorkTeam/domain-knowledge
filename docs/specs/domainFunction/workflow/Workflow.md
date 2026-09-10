<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：跨角色工作流设计。
-->
# 跨角色工作流设计

代码位置：[src/domain/workflow/Workflow.ts](../../../../src/domain/workflow/Workflow.ts)、[src/domain/workflow/AgentDefinitions.ts](../../../../src/domain/workflow/AgentDefinitions.ts)、[src/application/services/AutomatedProjectWorkflow.ts](../../../../src/application/services/AutomatedProjectWorkflow.ts)。


## 输入、阶段和输出

输入是 Application 解析并固定的项目场景、材料引用、策略和 workerCount。AgentDefinitions 显式绑定业务角色与节点；Workflow 给出固定连接及纯路由函数。角色自己的计划输出不驱动动态建图。

| 阶段 | 规则 | 下游 |
| --- | --- | --- |
| orchestrator | 清理上轮 workerTask，测试与文档处理并行 | test_gen；每个 doc_worker，或无分块时 doc_gen |
| 文档链 | doc_worker 汇合到 doc_gen，生成候选后进行内容质量判断 | candidate_knowledge |
| candidate_knowledge | ITERATE / STOPPED 跳过代码生成 | workflow_router；其余进入 code |
| 验证链 | code → check；test_gen → oracle_validation | 两条链都完成后 evaluation |
| evaluation | FAILED 进入失败；STOPPED 交路由；其余审查 | failed / workflow_router / review |
| review | 输出纠正意见交 Application 保存和判定 | workflow_router |
| workflow_router | PASS 发布；ITERATE 加一轮；FAILED 失败；其余停止 | publication / orchestrator / failed / stopped |

`ProjectWorkflowStages` 加载历史知识、纠正意见、质量反馈和可信工件，调用 RoleExecutionService；角色不查询历史数据库。质量拒绝反馈进入下一轮 DocGen，预算用尽停止。评测由独立执行器完成，候选命令不直接成为门禁。

## 运行生命周期

[FlywheelDomainService](../../../../src/domain/workflow/FlywheelDomainService.ts) 封装创建 Run、状态迁移和生成能力声明，调用 Domain.ts 中的共享实体规则拒绝非法状态变化。Application 决定何时调用并保存结果；本模块不执行模型调用或数据库写入。业务连接与生命周期同属 workflow，LangGraph 引擎接线保留在 Infrastructure。

## 恢复和可观察性

Application 冻结配置，LangGraph 保存执行 checkpoint，Registry 记录业务提交和节点投影。相同 generationKey 的完成结果可重放；同版本失败节点可恢复，旧 roleExecutionVersion 明确拒绝。取消信号传到模型和外部执行，迟到角色结果不能提交。

节点 status、attempt、iteration、readyAt 与开始/完成时间用于观测，不作为发布权威。状态不完整时显示不可用，不能从节点完成比例推断知识可信度。

## 验证边界

两轮源码、双场景图、质量不足、取消和同版本恢复有现有测试入口；本轮文档重写不执行这些测试。业务规则修改定位本模块；仅调整一个角色内部步骤定位 agents 目录。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
