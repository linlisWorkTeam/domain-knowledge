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
  O[orchestrator: 轮次检查与模块绑定] --> D
  O --> T[test_gen]
  subgraph DG[DocGen Agent 内部]
    D[拆分源码任务] --> W[DocWorker subAgents]
    W --> G[汇总正文]
    D -->|workerCount 为 0| G
  end
  G --> Q[candidate_knowledge]
  Q -->|可继续| C[code]
  Q -->|ITERATE 或 STOPPED| R[workflow_router: 固定决定后幂等迁移]
  C --> K[check]
  T --> V[oracle_validation: 参考校验 / 有限修复 / 固定测试复用]
  K --> B[等待两条链]
  V --> B
  B --> E[evaluation]
  E -->|正常结果| RV[review]
  E -->|FAILED| F[failed]
  E -->|STOPPED| R
  RV --> R
  R -->|ITERATE 且预算未耗尽| O
  R -->|PASS| P[publication]
  R -->|FAILED| F
  R -->|STOPPED 保存精简交接| S[stopped]
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
  Project --> Processes[项目准备与编译命令]
  Server --> Supervisor[受信 NativeCaseSupervisor]
  Supervisor -->|ptrace 逐入口监督| Native[独立 C/C++ 被测进程]
  Project --> Native
  Supervisor -->|独立结果通道| Server
  Native -->|stdout/stderr 日志| Server
  Server -. 适配器已提供 .-> Redis[Redis 租约与上下文]
  Browser --> Static[同源 web 静态资源]
```

CLI 和 HTTP 是两个可独立启动的入口，上图 Server 框表示共享应用装配，不要求 CLI 经 HTTP 转发。运行数据库、CAS 和项目副本位于运行目录，不提交到 Git；Redis 不成为知识事实源。

Agent 材料边界由授权工件、受限工具和 DSH 工作区控制；原生用例由另一个受信父进程监督。当前监督器限定 Linux x86_64、gcc/nm、入口符号及可用 ptrace，不提供完整文件读取隔离或通用部署沙箱。Registry 先保存 route-v2 结果及幂等副作用，Graph 随后保存节点 checkpoint，两者不在同一事务中。

## 场景视图（+1）：一次失败后的修订与发布

```mermaid
sequenceDiagram
  actor U as 用户
  participant A as Application
  participant G as LangGraph
  participant R as Domain Agents
  participant E as 独立评测器
  participant N as 外部用例监督器
  participant X as 被测子进程
  participant D as Domain Gate
  participant S as SQLite/CAS
  U->>A: 提交显式项目场景
  A->>S: 冻结配置并创建 Run
  A->>G: 启动固定流程
  G->>R: 文档、候选测试、代码与检查
  R-->>A: 业务结果及待保存正文
  A->>S: 绑定工件和结果信封
  A->>E: 按项目参数编译测试与独立 runner
  loop 固定清单的每个入口
    E->>N: 程序、入口符号、运行预算
    N->>X: 独立启动并监督入口到达与返回
    X-->>E: stdout/stderr 仅保留为日志
    N-->>E: 独立通道提交观察到的返回值
  end
  alt 首次测试失败且非配置或环境故障
    A->>R: TestGen 有限修复（独立尝试记录）
    R-->>A: 修订后的测试文件及用例清单
    A->>E: 再次参考校验
  end
  Note over A,E: 修复耗尽或配置/环境故障停止并保存可操作交接；以下仅为参考通过分支
  E-->>A: 参考校验通过
  A->>S: 按源码内容身份固定测试集
  A->>E: 同一测试集测评生成实现
  E-->>A: 测试失败证据
  A->>R: Review 接收 Check 差异及测评报告
  R-->>A: 多条位置、问题、建议及可信依据
  A->>D: 报告与策略
  D-->>A: ITERATE
  A->>S: 先固定本轮路由决定
  A->>S: 幂等推进业务轮次
  A-->>G: 返回固定决定，允许 Graph 恢复重放
  G->>R: DocGen 修订、Code fresh 生成
  A->>E: 复用固定测试集进行新一轮评测
  E-->>A: 完整逐用例证据与门禁事实
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

## Agent 证据交接补充（2026-09-10）

```mermaid
flowchart LR
  Goal[业务目标与授权模块概览] --> Plan[Orchestrator 选择本 Run 模块]
  Plan --> Bind[Application 绑定模块及任务材料]
  Bind --> Tests[TestGen 测试源码与清单]
  Tests --> Reference[原实现 + 项目命令 + 绑定测试编译运行]
  Reference -->|首次候选普通失败且仍有修复预算| Tests
  Reference -->|配置或环境故障 / 修复耗尽 / 固定集合失败| Handoff
  Reference -->|成功固定测试集| Eval[删除目标原实现后评测重建代码]
  Eval --> Review[Review 当前证据与历史全文]
  Review --> Revision[统一定位的 DocGen 修订]
  Revision --> Eval
  Review --> Gate[确定性 Gate]
  Gate -->|PASS| Publish[发布知识]
  Gate -->|STOPPED| Handoff[问题、建议、可用历史对比及证据摘要]
```

该图补充业务材料交接，不改变固定 LangGraph 拓扑。修订迭代继续使用选定模块及已固定测试集；原生参考与重建评测均采用外部逐入口监督。最终受控 SDK 验收运行两轮、五次评测后 PASS，只发布一次；模型质量仍待真实调用验证。运行可显式保留评测工作区、编译产物和完整证据，见 [报告](../reports/AgentSpecRepairAndE2E.md)。
