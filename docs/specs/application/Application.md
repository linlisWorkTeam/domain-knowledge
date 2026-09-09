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

## 执行状态展示

Orchestrator.executionForRun 组合工作流执行事实和 RunConfiguration 兼容检查，RunExecutionPresentation 形成只读展示。业务 state 和执行 executionStatus 分开保留；可恢复失败不重写业务阶段。无执行记录或读取失败返回明确不可用状态，只有 RUNNING 执行计入活动并提供取消。恢复要求原有预算尚存、失败节点可定位和当前冻结配置兼容；命令仍由工作流执行最终预算与授权检查。展示仅输出安全错误码和节点，不输出模型原始异常。

纯规则、真实注册表 API 与受控浏览器分别由 RunExecutionPresentation、RunExecutionHttp 和 RunExecutionConsole 测试覆盖；受控执行视图不声明真实模型验收。

## 当前内容质量策略

DeterministicQualityPolicy 位于 Application：来源证据 30%、结构 25%、可验证性 20%、正文量 15%、可读性 10%，默认阈值 70。KnowledgeWritingGuide 报告模板化表达和超长段落；弱项形成反馈送回 DocGen。质量拒绝跳过 Code，质量通过不等于行为 Gate PASS。

## 配置与独立运行

RunConfiguration 冻结 Prompt、Schema、Provider 和 roleExecutionVersion 摘要，配置改变影响新 Run；旧版本拒绝恢复但不阻止查询历史。AgentExample 保存独立开发 Run、配置、工件与脱敏轨迹，不启动 LangGraph、评测或发布。所有角色样例均通过 AgentExample 执行，不再为 DocGen 提供专用应用服务。固定源码检查只在 DocGen 自己的样例测试中执行。

ProviderOperationsApp 只在用户显式验证时调用 ProviderConnectionProbe，并贯穿 HTTP 取消信号。30 秒总期限从应用入口开始，覆盖配置修订队列和 DNS 校验；取消的队列项提前返回，但不能放行仍在前序操作后的其他配置修改。模型列表与最小生成均 PASSED、reasonCode 为 GENERATION_READY 才保存已验证指纹并启用；两阶段证据保存在设置和脱敏审计中。旧版 READY 记录可读，但对外显示 UNVERIFIED / GENERATION_VERIFICATION_REQUIRED，不能成为新 Run 的默认配置，读取时不触发生成或修改旧记录。配置修订号和 HTTP 幂等约束继续阻止重复操作产生额外调用。技术预算和临时空间见[模型适配设计](../infrastructure/agentAdapters/AgentAdapters.md#显式连接验证)。


文档关系：[设计目录](../README.md)负责代码与设计定位；[开发指南](../../Development.md)说明修改和交付步骤。

## 本地发布应用边界

`PublicationOperations` 通过 `LocalPublicationPort` 承接已取得领域发布凭据的 Markdown 发布。输入必须包含 publicationKey、gateDecisionId、运行/版本标识、源码提交与摘要以及 evidenceRefs；HTTP 不提供绕过门禁的 publish 命令。工作流先完成确定性门禁和领域发布，再调用本地发布，失败保留待恢复日志。

Console 通过应用边界读取发布设置、枚举服务器授权目录、读取正文与来源、恢复待完成发布及手动同步 Git。Git 默认关闭。模型配置和服务器目录操作不要求用户编辑场景 JSON。代表模块场景由受信工厂构建，并通过 `apps.markdownLite.start(repositoryRoot)` 启动。

应用数据与安装版本分离；详见 [Linux 安装与本地发布](../../LinuxInstall.md)。
