<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：领域驱动设计约定。
-->
# 领域驱动设计约定

代码位置：[src/domain/Domain.ts](../../../src/domain/Domain.ts)、[src/domain/agents/AgentExecution.ts](../../../src/domain/agents/AgentExecution.ts)、[src/application/services/RoleExecution.ts](../../../src/application/services/RoleExecution.ts)、[src/application/ports/ApplicationPorts.ts](../../../src/application/ports/ApplicationPorts.ts)。


Domain 中 `agents` 与 `services` 平级：`agents/<role>` 保存领域内部角色实现；`services/<feature>` 按 association、evaluation、knowledge、workflow、sourceScan、workspace、migration 组织领域对外服务及所属规则。`Domain.ts` 保留共享实体与不变量。领域服务封装业务能力，不复制 Agent 的生成步骤，也不承担 Application 的持久化事务。

## 目录与调用边界

```text
src/domain/
├── Domain.ts                 # 共享实体与确定性不变量
├── agents/                   # 七角色内部实现、契约、Prompt 与独立样例
└── services/                 # 对 Application 提供的领域能力
    ├── association/          # 事实提取策略和目标关联校验
    ├── evaluation/           # 基于评测报告与策略生成 GateDecision
    ├── workflow/             # 生命周期、跨角色规则、AgentExecutionService 入口
    ├── knowledge/            # 正文差异规则
    ├── sourceScan/           # 来源扫描能力（既有资源访问例外）
    ├── workspace/            # 工作区能力（既有资源访问例外）
    └── migration/            # 历史数据迁移能力（既有资源访问例外）
```

Application 的 RoleExecutionService 经 `services/workflow/AgentExecutionService.ts` 执行角色，由领域服务选择内部显式注册的 Agent。Application 保留材料加载、阶段日志、CAS 写入及幂等提交；领域执行服务只委派已有角色实现。外层不能直接调用角色 execute 或读取 AgentRegistry；共享类型、Schema、材料校验函数及受控 fixture 辅助函数仍可按职责导入，不额外建立全 Domain 总导出。

AssociationDomainService 注入 ExternalExtractor / ReverseMapper，校验事实身份、目标引用和置信度；DocWorkerAgent 从固定源码提取可追溯事实供 DocGen 使用，当前两者没有互相调用。未来若用 Agent 实现提取策略，应接入既有服务边界，不复制关联校验。EvalRunnerDomainService 根据独立报告确定 PASS / ITERATE / STOPPED；TestGen、Check、Review 只生成候选或意见，不能替代该判定。`evaluation-agent` 是既有能力标识，接口命名为 EvaluationService，不加入七角色注册。

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
