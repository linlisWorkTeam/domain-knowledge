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

## 当前内容质量策略

DeterministicQualityPolicy 位于 Application：来源证据 30%、结构 25%、可验证性 20%、正文量 15%、可读性 10%，默认阈值 70。KnowledgeWritingGuide 报告模板化表达和超长段落；弱项形成反馈送回 DocGen。质量拒绝跳过 Code，质量通过不等于行为 Gate PASS。

## 项目配置与角色材料分发（已确认，待实现）

每个业务项目由框架管理一份版本化项目配置，可采用 `ProjectProfile.json`；不同业务场景引用对应项目配置及场景差异。本节定义目标职责，当前没有该文件的加载入口或机器 Schema，具体存储目录在实现时确定，不创建空配置作为已支持证明。依赖和构建说明不写入知识卡片。

| 配置内容 | 用途与接收方 |
| --- | --- |
| 项目标识、版本、场景及环境选择 | Application 定位本次运行使用的配置；本服务器与公司环境可选择不同工具链和路径 |
| C/C++ 标准、依赖声明、影响代码编写的约束 | 裁剪后传给 CodeAgent；不混入原始业务实现、参考测试或答案 |
| 编译器、依赖位置、编译/链接参数、宏定义及构建入口 | 完整配置交编译、评测执行器，CodeAgent 只获得其中必要的编写约束 |
| CodeAgent 可读材料规则、允许输出的相对路径范围 | Application 与 Workspace 解析并执行；具体白名单由框架确定，模型不能扩权 |

用户发起任务时选择知识卡片、项目和场景。同项目只换知识卡片且运行条件不变时可复用项目配置；模块或构建方式不同则选用场景差异；切换业务项目使用其对应配置，保留原项目配置。

每次启动按以下顺序准备材料：

1. 解析项目与场景，校验语言、依赖、构建配置及路径规则；场景差异不能扩大受信权限。
2. 固定本轮知识卡片版本与摘要、项目配置版本与摘要、选定场景和实际生效配置。
3. 分配独立工作区，将授权卡片和必要配置准备为角色材料，记录实际可读文件白名单、输出根目录及允许生成的相对路径。
4. 按角色裁剪 Prompt 材料与工具读取范围；CodeAgent 不再接收整份项目场景、独立接口文件或其他角色材料。
5. 保存运行快照再执行。后续修改配置只影响新任务；恢复任务使用冻结材料，无法恢复对应版本时明确失败，不能静默切换为新配置。

实际路径写在本轮运行快照中，项目配置保存权限规则；相同知识在不同环境运行可以得到不同绝对目录，但不能混用其他运行的文件。CodeAgent 返回文件列表后，由框架统一校验输出 Schema、相对路径、重复路径和输出范围，全部通过才落盘到本轮临时输出目录；编译、评测及发布继续沿用各自用例。隔离约束见 [Workspace](../domainFunction/workspace/Workspace.md)，验收见 AC-CONFIG-001、AC-CODE-001、002。

## 配置与独立运行

RunConfiguration 冻结 Prompt、Schema、Provider 和 roleExecutionVersion 摘要，配置改变影响新 Run；旧版本拒绝恢复但不阻止查询历史。AgentExample 保存独立开发 Run、配置、工件与脱敏轨迹，不启动 LangGraph、评测或发布。所有角色样例均通过 AgentExample 执行，不再为 DocGen 提供专用应用服务。固定源码检查只在 DocGen 自己的样例测试中执行。


文档关系：[设计目录](../README.md)负责代码与设计定位；[开发指南](../../Development.md)说明修改和交付步骤。
