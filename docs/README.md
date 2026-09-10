<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：文档中心。
-->
# 文档中心

从用户任务或代码目录进入，设计只在 specs 维护，日常操作只在根部指南维护。

| 目的 | 入口 | 对应设计 |
| --- | --- | --- |
| 首次运行 | [GettingStarted](GettingStarted.md) | [Requirements](specs/totalRules/Requirements.md)、[UiuxDesign](specs/totalRules/UiuxDesign.md) |
| 阅读架构与开发报告 | [目录、DDD、Spec 与 Agent 编排报告](reports/FrameworkArchitectureAndSpecDevelopment.md) | 本次代码快照说明，现行设计仍在 specs |
| 理解架构 | [4+1 视图](diagrams/Views4Plus1.md) | [Architecture](specs/totalRules/Architecture.md)、[DDD](specs/totalRules/DomainDrivenDesign.md) |
| 修改代码 | [Development](Development.md) | [设计目录](specs/README.md)、[CodeTaste](specs/totalRules/CodeTaste.md) |
| 修改单个角色 | [AgentDevelopment](AgentDevelopment.md) | [Agents](specs/domainFunction/agents/Agents.md) |
| 接入模型 | [Runtime](Runtime.md) | [AgentAdapters](specs/infrastructure/agentAdapters/AgentAdapters.md) |
| 运行和排障 | [Operations](Operations.md) | [HttpApi](specs/interfaces/HttpApi.md)、基础设施同名设计 |
| 看开发任务、步骤与验收进度 | [Status](Status.md) | [验收追踪](specs/totalRules/Verification.md) |
| 查历史变更 | [historyEpitaph](HistoryEpitaph.md)、[最近三次交接](epitaph/) | 完整原记录通过固定 Git 提交审计 |

```text
docs/
├── README.md                # 唯一阅读导航
├── GettingStarted.md        # 启动与首个操作
├── Development.md           # 修改、验证、提交
├── AgentDevelopment.md      # 单角色开发
├── Runtime.md               # DSH / OpenCode Go 配置
├── Operations.md            # 日常运行与排障
├── Status.md                # 四阶段任务、步骤、进度与验收证据
├── specs/                   # 与代码模块对应的设计和 Schema
├── diagrams/Views4Plus1.md   # 逻辑、开发、进程、物理、场景视图
├── reports/                 # 架构与开发专题报告（快照）
├── epitaph/                 # 最近三次交接
├── HistoryEpitaph.md         # 归档摘要与历史证据链接
└── FileCatalog.json         # 文件版权与功能元数据
```

新增内容优先合入已有模块，不重复建设 guides、tutorials、reference、status/report、status/reports 或编号规范目录。知识正文和研究证据存放 wpKnowledge，不复制到运行仓库。
