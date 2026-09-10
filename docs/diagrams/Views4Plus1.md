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
  Apps --> Services[Domain services]
  Services --> Execute[AgentExecutionService]
  Execute --> Roles[内部七角色 agents]
  Services --> Association[AssociationDomainService]
  Services --> Evaluation[EvalRunnerDomainService]
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
  A --> D[domain: agents / services / Domain.ts]
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
  O[orchestrator] --> W[doc_worker 并行分块]
  O -->|无分块| D[doc_gen]
  O --> T[test_gen]
  W --> D
  D --> Q[candidate_knowledge]
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
  Project --> Processes[node / pnpm / cargo 子进程]
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
  A->>E: 参考检查与生成实现评测
  E-->>A: 测试失败证据
  A->>R: Review 归因
  R-->>A: 带评测证据的纠正意见
  A->>D: 报告与策略
  D-->>A: ITERATE
  A-->>G: 路由下一轮
  G->>R: DocGen 修订、Code fresh 生成
  A->>E: 新一轮独立评测
  E-->>A: 全部门禁事实
  A->>D: 重新判定
  D-->>A: PASS
  A->>S: 原子发布并去重回执
  S-->>U: 可查询的 VERIFIED 版本与证据
```

该场景是已有两轮回归的设计路径。质量不足可在代码生成前进入下一轮；基础设施失败和取消另行记录；有图和受控测试不代表真实模型质量已验收。

## 工作台场景：固定源码生成可阅读卡片

```mermaid
sequenceDiagram
  actor U as Console用户
  participant A as WorkbenchGeneration
  participant T as StageTaskStore
  participant N as NativeLanguageToolchain
  participant D as Domain KnowledgeUnits与DocGen
  participant M as 隔离模型会话
  participant S as SQLite与CAS
  U->>A: 已保存项目输入与接口范围
  A->>S: 冻结模型配置和源码引用
  A->>T: 启动GENERATE并取得单任务租约
  A->>N: 从固定源码提取公开声明
  N-->>A: 无实现正文的接口投影
  A->>D: 划分稳定知识单元
  loop 每张未完成卡片
    A->>D: 固定单元、源码材料与提示词
    D->>M: 概要、章节正文（内联材料，无文件工具）
    M-->>D: 结构化结果
    D-->>A: 角色结果及待提交工件
    A->>S: 保存候选版本与来源
    A->>T: 保存卡片检查点和累计用量
    A-->>U: 可立即阅读，尚未评测
  end
  U->>A: 后续独立INDEX操作
```

上图描述已接通的 C/C++ 生成入口，INDEX由KnowledgeIndexService执行。新阶段有自己的冻结输入、尝试审计和恢复记录，不借用旧Run的发布状态；FLYWHEEL、EVALUATE和ASSOCIATE已有独立应用入口；持久化一键编排已接通，自动知识修订仍未接通。


```mermaid
sequenceDiagram
  actor U as Console用户
  participant W as WorkbenchStages
  participant R as WorkbenchReconstruction
  participant E as WorkbenchEvaluation
  participant A as WorkbenchAssociations
  participant D as 领域角色与关联规则
  participant N as 隔离原生执行器
  participant S as SQLite与CAS
  U->>W: 启动FLYWHEEL（冻结卡片与工具链）
  W->>R: 分派重建
  R->>D: Code只获取卡片、公开接口和所选范围
  D-->>R: 所选模块代码
  R->>N: 独立接口投影与比较
  R->>S: 保存代码和接口比较
  opt 生成接口编译拒绝
    R->>D: 区分确定性代码错误与资源中断
    R->>S: 保存生成代码及诊断检查点
    U->>W: 同输入恢复，累计用量保留
    W->>R: 继续原阶段
    R->>D: 仅代码错误时交Code自身旧代码和诊断
    Note over R,N: 资源中断复用原Code；不读取参考正文或隐藏测试
  end
  U->>W: 启动EVALUATE
  W->>E: 分派评测
  E->>N: 参考实现基础构建
  E->>S: 读取同卡片集合历史可信门禁
  alt 已有可信门禁
    E->>D: 构建门禁并集，保留原输入和预期
  else 尚无可信门禁
    E->>D: TestGen提出候选（可附未可信拒绝反馈）
  end
  E->>N: 参考验证候选
  alt 候选全部通过
    E->>S: 保存不可变可信用例
    E->>N: 评测重建实现
    E->>S: 保存结果与章节版本
  else 历史可信门禁在新参考失败
    E->>S: 保存冲突报告，保留旧可信记录
    E-->>U: PAUSED，恢复不能替换原门禁
  else 新候选参考拒绝
    E->>S: 保存未可信候选和拒绝证据
    E->>D: 从失败DSL定位实参构造提示
    E-->>U: 停止，可恢复重新提出候选
  end
  U->>W: 索引完成后独立启动ASSOCIATE
  W->>A: 固定卡片版本
  A->>D: 依据正文明确符号引用建立关系
  A->>S: 保存带版本和引用行的JSON关系索引
  U->>A: 当前卡片不适用
  A-->>U: 有效关系及适用条件，排除受版本变更影响的关系
```

图中各阶段由同一持久化阶段服务承载，可分别启动或由knowledge-pipeline-v3独立协调租约顺序启动；行为通过不自动赋予发布资格。关系是可审计的引用事实，不保证可替代性；自动知识修订和发布为剩余实现范围。


```mermaid
flowchart LR
  UI[操作中心一键执行] --> P[WorkbenchPipelines]
  P --> PS[(SQLite协调记录与独立租约)]
  P --> PREP[相同阶段prepare用例]
  PREP --> HANDOFF[先冻结子任务输入与身份]
  HANDOFF --> S[WorkbenchStages单执行槽]
  S --> G[生成 → 索引 → 重建 → 评测 → 关联]
  G --> D[Domain推进门禁]
  D -->|通过| P
  D -->|失败或部分成功| STOP[停止推进并保留全部前序结果]
  UI -->|取消或同输入恢复| P
```

指定外部材料捕获链路（快照与关联任务选材已接线）：

```mermaid
flowchart LR
  UserSource[用户选择登记来源和适用条件] --> MaterialApp[WorkbenchMaterials]
  MaterialApp --> SourceReader[来源读取端口]
  SourceReader --> FixedInput[受限本地文件或指定 HTTPS]
  MaterialApp --> RevisionCheck[固定修订校验]
  RevisionCheck --> TextAdapter[UTF-8 正文转换]
  TextAdapter --> MaterialCAS[原始字节及正文 CAS]
  MaterialCAS --> MaterialRegistry[SQLite 不可变材料快照]
  MaterialRegistry --> FrozenSelection[分步或一键冻结选材]
  FrozenSelection --> Association[Domain 明确符号引用]
  Association --> Evidence[关系索引与原文证据下载]
```


重建诊断在 Code 之后读取参考源码，缓存绑定不变输入：

```mermaid
flowchart LR
  Frozen[冻结知识/接口/构建/模型/工具链] --> Reuse{匹配已成功代码与角色证据}
  Reuse -->|命中| Credit[幂等继承历史用量及代码工件]
  Reuse -->|未命中| Code[Code 仅获取知识和公开接口]
  Credit --> Check[重新检查生成接口]
  Code --> Check
  Reference[固定参考源码 CAS] --> Compare[公开函数规范化诊断]
  Check --> Compare
  Compare --> Evidence[差异与未解决项]
  Evidence --> Evaluation[独立可信行为门禁]
```

评测修订依据、独立修订与 v4 多轮自动推进已接通：

```mermaid
flowchart LR
  Evaluation[固定成功评测记录] --> Load[Application 校验 CAS 与来源绑定]
  Oracle[可信套件和参考观察] --> Load
  Body[固定卡片正文] --> Load
  Load --> Domain[Domain 重算行为差异与当前 H2 绑定]
  Domain -->|行为失败且章节有效| Candidate[Review 候选章节及失败用例]
  Domain -->|编译故障或旧章节| Unresolved[保留未解决诊断]
  Domain -->|全部通过| None[没有行为失败驱动的修订]
  Candidate --> UI[Console 只读修订依据]
  Unresolved --> UI
  None --> UI
  Generated[固定生成代码 CAS] --> Review
  Candidate --> Review[Review 对当前章节归因]
  Review --> Bound[校验标准化纠正意见及原始输出绑定]
  Bound -->|明确修订且无未解决风险| DocGen[DocGen 无损 H2 修订]
  Review -->|证据不足| Unresolved
  Review -->|知识正确无需修改| Retry[绑定失败评测的新 Code 尝试]
  DocGen --> SourceReview[最终正文独立源码复核]
  SourceReview -->|PASS 无风险| Parent[提交前校验原卡片头版本]
  SourceReview -->|拒绝或证据不足 保留草稿不提交| Unresolved
  Parent --> CandidateVersion[幂等保存新候选版本]
  CandidateVersion --> Index[同一索引用例刷新受影响项]
  Index --> Retry
  Retry --> Next[冻结本轮版本并重建评测]
  Next --> Progress{行为全部通过或持续改善}
  Progress -->|通过| Associate[关联查看且发布仍待门禁]
  Progress -->|仍失败但有进展| Evaluation
  Progress -->|连续无进展| Pause[保存历史并暂停]
```

整卡来源复核独立于行为失败归因，当前接通入口如下：

```mermaid
flowchart LR
  Evaluated[普通原生评测完成] --> SourceApp[WorkbenchSourceVerification 冻结全部卡片]
  SourceApp --> Materials[固定源码与可信参考观察 CAS]
  Materials --> ReviewAll[既有 Review 逐张核对全部 H2]
  ReviewAll --> SourceDomain[Domain 校验正文版本及完整覆盖]
  SourceDomain --> Matched[来源匹配 仍未发布]
  SourceDomain --> Mismatch[明确矛盾及 H2]
  SourceDomain --> Unknown[未解决风险]
  Mismatch --> SourceRevision[WorkbenchSourceRevision 校验原始 Review 绑定]
  SourceRevision --> SharedRevision[WorkbenchCardRevision 定点修订与源码复核]
  SharedRevision --> Reindex[增量索引]
  Reindex --> Rebuild[新版本重建与再评测]
```

一键 pipeline-v10 接通来源门禁：

```mermaid
flowchart LR
  Code[冻结版本重建] --> Behavior[可信行为评测]
  Behavior -->|失败| BehavioralRepair[行为归因与修订]
  BehavioralRepair --> Code
  Behavior -->|全部通过| Chapters[逐 H2 来源复核 完整覆盖全部卡片]
  Chapters -->|明确矛盾| SourceRepair[来源意见驱动修订与增量索引]
  SourceRepair --> Code
  Chapters -->|未知或无有效进展| Pause[保存子任务与累计预算 暂停]
  Chapters -->|全部匹配| Associate[知识关联]
  Associate -.待实现.-> Publish[固定测试及独立发布事务]
```

来源章节检查点、来源修订与行为子任务统一纳入轮次历史；通过行为评测结束该连续失败阶段，来源进展另按新完成的章节复核计数。旧 v9 不跨版本恢复。
