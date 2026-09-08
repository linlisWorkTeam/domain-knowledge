<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明基础设施适配器目录、领域工作流边界与运行时接入职责。
-->
# 基础设施层

本目录实现外部系统接入。业务流程规则位于 [Domain Workflow](../domain/services/workflow/Workflow.ts)，角色实现位于 [Domain Agents](../domain/agents/AgentRegistry.ts)。基础设施通过 Application Port 接收请求，不定义发布资格或角色业务输出。

| 目录 | 职责 |
| --- | --- |
| `agentAdapters/` | DSH、公司 CLI、模型配置及凭据存储适配 |
| `langgraph/` | 将领域流程映射为执行图，处理并发、取消、异常及 checkpoint |
| `sqlite/` | SQLite 业务仓库、工件存储、内容治理和行动项持久化 |
| `redis/` | Redis 运行状态与上下文适配 |
| `http/` | HTTPS 地址校验与固定解析地址的 HTTP 连接 |
| `evaluation/` | 独立评测环境与外部进程执行 |
| `observability/` | 运行指标存储与观测 |

源码候选发现位于 `domain/sourceScan/`；旧 OKF 转换位于 `domain/migration/legacyOkf.ts`；固定提交的角色文件白名单位于 `domain/workspace/`。这些模块拥有各自的最小契约，均不引用 Application 或 Infrastructure。

`security/` 目录已取消。原凭据加密仍由 `agentAdapters/provider/ProviderSettings.ts` 实现，HTTPS 校验仍由 `http/PublicHttps.ts` 提供，供模型和来源读取适配器共同使用。

Console 通过 `WorkflowObserver` 读取节点投影，不直接读取 LangGraph SQLite。不得在适配器新增业务发布 Registry 或第二套角色实现。角色配置仍只允许追加 `promptAddon`。

<details lang="en">
<summary>English summary</summary>

Infrastructure implements model, HTTP, storage and execution adapters. Domain owns workflow topology and routing decisions; LangGraph maps those rules to executable nodes, messages and checkpoints. Source discovery, legacy migration and role workspace preparation live in Domain. Credential encryption and HTTPS validation retain their behavior in the corresponding adapters.

</details>
