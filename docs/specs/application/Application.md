<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：应用用例与提交协调设计。
-->
# 应用用例与提交协调设计

代码位置：[src/application/apps/ApplicationApps.ts](../../../src/application/apps/ApplicationApps.ts)、[src/application/services/RoleExecution.ts](../../../src/application/services/RoleExecution.ts)、[src/application/services/AutomatedProjectWorkflow.ts](../../../src/application/services/AutomatedProjectWorkflow.ts)、[src/application/services/QualityPolicy.ts](../../../src/application/services/QualityPolicy.ts)、[src/application/services/RunConfiguration.ts](../../../src/application/services/RunConfiguration.ts)。


## 外部用例

| App | 负责的用例 |
| --- | --- |
| Orchestrator | 启动、观察、取消和恢复批次，组合工作流端口 |
| FlywheelApp | 候选入库、知识生成和生命周期协调 |
| EvalRunnerApp | 请求独立评测、保存证据并调用 Domain Gate |
| KnowledgeSearchApp | 当前知识查询，SearchAgent 仍未接线 |
| KnowledgeDiscoveryApp | 调用 SourceScanner 发现未入库文件 |
| ContentGovernanceApp | 来源、规则、血缘、Diff、反馈和事项治理 |
| ProviderOperationsApp | 受控配置、校验和脱敏查询 |
| OperationalMetricsApp | 指标窗口和统计查询 |

## 角色提交链

RoleExecutionService 为生产、Fixture 和 agent:run 共用生成键、命令工件、RoleResult 和结果信封。先验证可信材料，执行显式注册角色，写入原始输出及待保存正文，将 pending/角色节点/生成键符号绑定为实际引用，校验结果信封后提交 checkpoint、结果与事件。失败和取消保留失败记录，不能提交半份成功结果。

ProjectWorkflowStages 负责解析场景上下文、读取历史工件、构造各角色 Input，再调用公共角色服务。评测、候选保存和发布继续由应用服务协调，不能把 WorkflowStageInput 透传给 Domain 角色。

DocWorkerExecutionService 实现 DocGen 的内部 Worker 执行端口，生产与独立样例共用。它校验任务范围、加载冻结的 Worker 提示词、通过 RoleExecutionService 提交独立结果，并读取已提交片段返回给 DocGen。ConcurrentTasks 在 Infrastructure 中提供默认三个并发槽；任一任务失败取消同批调用并等待在途任务结束。它不决定源码如何分组或文档如何汇总。

## 当前内容质量策略

DeterministicQualityPolicy 位于 Application：来源证据 30%、结构 25%、可验证性 20%、正文量 15%、可读性 10%，默认阈值 70。KnowledgeWritingGuide 报告模板化表达和超长段落；弱项形成反馈送回 DocGen。质量拒绝跳过 Code，质量通过不等于行为 Gate PASS。

## 配置与独立运行

RunConfiguration 冻结 Prompt、Schema、Provider 和 roleExecutionVersion 摘要，配置改变影响新 Run；旧版本拒绝恢复但不阻止查询历史。AgentExample 保存独立开发 Run、配置、工件与脱敏轨迹，不启动 LangGraph、评测或发布。所有角色样例均通过 AgentExample 执行，DocGen 内部 Worker 的提交适配复用公共角色执行服务。固定源码检查只在 DocGen 自己的样例测试中执行。


文档关系：[设计目录](../README.md)负责代码与设计定位；[开发指南](../../Development.md)说明修改和交付步骤。
