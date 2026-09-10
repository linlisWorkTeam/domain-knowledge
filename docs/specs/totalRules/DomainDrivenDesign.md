<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：领域驱动设计约定。
-->
# 领域驱动设计约定

代码位置：[src/domain/Domain.ts](../../../src/domain/Domain.ts)、[src/domain/agents/AgentExecution.ts](../../../src/domain/agents/AgentExecution.ts)、[src/application/services/RoleExecution.ts](../../../src/application/services/RoleExecution.ts)、[src/application/ports/ApplicationPorts.ts](../../../src/application/ports/ApplicationPorts.ts)。


Domain 按领域功能组织：agents、workflow、evaluation、association、knowledge、sourceScan、workspace、migration 是同层级目录，不设置 services 分组或总导出文件。领域服务类放在所属功能目录；Domain.ts 保留共享实体与不变量。

## 聚合与边界

FlywheelRun 管理批次身份、状态和当前轮次。KnowledgeVersion 关联正文、来源、父版本和治理状态。EvaluationReport 是独立执行产生的证据；GateDecision 是 Domain 对报告和策略的确定性解释；发布回执由存储事务生成。工件正文不嵌进跨阶段通用状态，使用 ArtifactRef 传递。

八个 Application App 是外部用例入口，内部服务协调端口。角色输入使用各自的 Payload、已加载 Material 和运行上下文，不接收 WorkflowStageInput 或数据库对象。Domain 的 PendingArtifact 只声明正文和交接引用，由 RoleExecutionService 执行 CAS 写入、符号绑定和结果信封校验。

## 依赖方向与例外

Domain 不导入 Application、Infrastructure、Interfaces、DSH、LangGraph 或数据库 SDK。Application 只依赖 Domain 和端口。Infrastructure 可实现 Application Port；Interfaces 的 Composition 是实例装配位置。SourceScan、Workspace 和 legacyOkf 的 Node/YAML 依赖逐文件列入架构契约，不能扩大到角色代码。

## 修改规则

调整一个角色的材料、输出或步骤，修改其 XxxAgent 目录及 Agents 设计；增加角色需显式更新 AgentContracts、AgentRegistry、工作流节点映射、业务连接和 Application 输入加载。增加外部能力先确认最小 Port，再实现 Adapter。只有共享流程改变才修改 Workflow，不引入通用步骤 DSL、自动扫描注册或第二套发布服务。

## 一致性与失败

Run 配置冻结角色执行版本、Prompt、Schema 与 Provider 摘要；旧执行版本不能恢复但历史结果保持可读。生成键去重已提交角色结果，发布键去重回执。模型输出失败、取消、评测失败和质量不足各走自己的记录与分支，不能统一伪装成“模型重试”。


文档关系：[设计目录](../README.md)负责代码与设计定位；[开发指南](../../Development.md)说明修改和交付步骤。
