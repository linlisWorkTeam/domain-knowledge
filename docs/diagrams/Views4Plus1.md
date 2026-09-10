<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：4+1 架构视图。
-->
# 4+1 架构视图

本文件对应 [架构设计](../specs/totalRules/Architecture.md)。五个视角描述同一套当前实现，不另建状态机。虚线表示未默认启用或仍为计划的接入。

## 逻辑视图：业务对象与职责

```mermaid
flowchart LR
  User[用户] --> Apps[Application Apps]
  Apps --> Roles[七角色 Domain Agents]
  Apps --> Run[FlywheelRun]
  Roles --> Pending[结构化结果与待保存工件]
  Pending --> Commit[RoleExecutionService]
  Commit --> Version[KnowledgeVersion]
  Apps --> Eval[独立评测事实]
  Eval --> Gate[Domain GateDecision]
  Gate --> Publish[原子发布回执]
  Version --> Publish
  Apps -. 计划能力 .-> Search[SearchAgent]
```

## 开发视图：代码与依赖

```mermaid
flowchart TB
  I[interfaces: HTTP / CLI / Composition] --> A[application: apps / services / ports]
  A --> D[domain: agents / workflow / evaluation / association / knowledge / sourceScan / workspace / migration]
  I --> F[infrastructure: agentAdapters / langgraph / sqlite / redis / evaluation]
  F --> A
  F --> D
  S[docs/specs: 对应模块设计] -. 对照 .-> D
  S -. 对照 .-> F
  T[tests: unit / contract / integration / acceptance / e2e] -. 验证 .-> A
```

## 进程视图：并行、汇合和迭代

```mermaid
flowchart TD
  O[orchestrator] --> D
  O --> T[test_gen]
  subgraph DG[DocGen Agent 内部]
    D[拆分源码任务] --> W[DocWorker subAgents]
    W --> G[汇总正文]
    D -->|workerCount 为 0| G
  end
  G --> Q[candidate_knowledge]
  Q -->|可继续| C[code]
  Q -->|ITERATE 或 STOPPED| R[workflow_router]
  C --> K[check]
  T --> V[oracle_validation]
  K --> B[等待两条链]
  V --> B
  B --> E[evaluation]
  E -->|正常结果| RV[review]
  E -->|FAILED| F[failed]
  E -->|STOPPED| R
  RV --> R
  R -->|ITERATE| O
  R -->|PASS| P[publication]
  R -->|FAILED| F
  R -->|其他| S[stopped]
```

## 物理视图：本地运行与外部资源

```mermaid
flowchart LR
  Browser[浏览器 Console] --> Server[本地 Node HTTP / Application]
  CLI[Node CLI] --> Server
  Server --> Registry[SQLite Registry]
  Server --> CAS[本地 CAS 正文]
  Server --> Checkpoint[LangGraph SQLite checkpoint]
  Server --> Harness[DSH SDK / 隔离工作空间]
  Harness --> Model[已配置模型 HTTPS API]
  Server --> Project[固定提交的参考与生成副本]
  Project --> Processes[node / pnpm / cargo / gcc / g++ / 测试程序]
  Server -. 适配器已提供 .-> Redis[Redis 租约与上下文]
  Browser --> Static[同源 web 静态资源]
```

CLI 和 HTTP 是两个可独立启动的入口，上图 Server 框表示共享应用装配，不要求 CLI 经 HTTP 转发。运行数据库、CAS 和项目副本位于运行目录，不提交到 Git；Redis 不成为知识事实源。

## 场景视图（+1）：一次失败后的修订与发布

```mermaid
sequenceDiagram
  actor U as 用户
  participant A as Application
  participant G as LangGraph
  participant R as Domain Agents
  participant E as 独立评测器
  participant D as Domain Gate
  participant S as SQLite/CAS
  U->>A: 提交显式项目场景
  A->>S: 冻结配置并创建 Run
  A->>G: 启动固定流程
  G->>R: 文档、候选测试、代码与检查
  R-->>A: 业务结果及待保存正文
  A->>S: 绑定工件和结果信封
  A->>E: 在原始源码上编译运行候选测试
  alt 首次测试失败且非环境故障
    A->>R: TestGen 有限修复（独立尝试记录）
    R-->>A: 修订后的测试文件及用例清单
    A->>E: 再次参考校验
  end
  Note over A,E: 修复耗尽或环境故障停止，以下仅为参考通过分支
  E-->>A: 参考校验通过
  A->>S: 按源码内容身份固定测试集
  A->>E: 同一测试集测评生成实现
  E-->>A: 测试失败证据
  A->>R: Review 接收 Check 差异及测评报告
  R-->>A: 多条位置、问题、建议及可信依据
  A->>D: 报告与策略
  D-->>A: ITERATE
  A-->>G: 路由下一轮
  G->>R: DocGen 修订、Code fresh 生成
  A->>E: 复用固定测试集进行新一轮评测
  E-->>A: 全部门禁事实
  A->>D: 重新判定
  D-->>A: PASS
  A->>S: 原子发布并去重回执
  S-->>U: 可查询的 VERIFIED 版本与证据
```

该场景是已有两轮回归的设计路径。质量不足可在代码生成前进入下一轮；基础设施失败和取消另行记录；有图和受控测试不代表真实模型质量已验收。

### DocGen 单文档与待决结果

```mermaid
flowchart LR
  W[内部 Worker 片段] --> D[DocGen 汇总或修订单文档]
  B[上一版文档与纠正材料] --> D
  D -->|正文| C[candidate_knowledge]
  C --> N[既有 Code / Check / evaluation / Review / Gate]
  D -->|拆分建议| P[candidate_knowledge 保存待决事项]
  P --> R[workflow_router STOPPED]
  R --> U[用户决定后准备单文档任务]
```
