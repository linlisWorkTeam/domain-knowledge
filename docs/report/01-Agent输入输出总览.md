# Agent 输入输出总览（讨论稿）

> 用途：用于阶段汇报和后续 Agent 契约讨论。
>
> 基线：[01-多agent调研.md 的 4.5.1 总体工作流程](../01-多agent调研.md#451-总体工作流程mermaid-流程图)。
>
> 状态：输入输出边界草案，不代表 Prompt、Schema 和评测指标已定稿。

## 1. 总体产物流

```mermaid
flowchart TD
    %% -------------------- 调度入口 --------------------
    UQ["用户目标 / 仓库范围 / 执行约束"]
    RS["RunState<br/>runId、iteration、checkpoint、历史产物"]
    FB["上轮修订要求<br/>knowledge_path + 问题 + 验收判据"]

    O["OrchestratorAgent（V1 确定性代码）<br/>只规划、拆分、委派、汇总和驱动重试<br/>不生成知识，不作内容质量决策"]
    PLAN["TaskPlan / DispatchPlan<br/>模块列表、worker 任务、并发上限、迭代预算"]

    UQ --> O
    RS --> O
    FB --> O
    O --> PLAN

    %% -------------------- 文档生成链 --------------------
    subgraph DOC["文档生成链"]
        DSRC["源码分块 / 公开头文件<br/>具体路径 + 版本 / hash"]
        DDEP["模块边界 / 依赖图 / 文档格式约束"]
        DW["DocWorkerAgent × N<br/>每个 worker 只处理一个独立分块"]
        FRAG["分块知识片段 .md<br/>证据引用 .json<br/>未解决问题列表"]

        PREV["上一版知识文档<br/>本轮 Review 修订指令"]
        DIRECT["DocGen 直读源码范围<br/>待确认：禁止 / 定向补读 / 全量可读"]
        DG["DocGenAgent<br/>汇总片段、处理冲突、修订知识<br/>唯一知识文档执笔者"]
        KD["候选知识文档 .md<br/>sources / evidence 溯源<br/>合并与冲突报告 .json"]
        KS["KnowledgeStore（候选区）<br/>版本、SHA-256、ledger"]

        DSRC --> DW
        DDEP --> DW
        DW --> FRAG
        FRAG --> DG
        PREV --> DG
        DIRECT -.->|"待确认"| DG
        DG --> KD
        KD --> KS
    end

    PLAN -.->|"拆分 / 委派"| DW
    PLAN -.->|"汇总 / 修订"| DG

    %% -------------------- 测试 Oracle 链 --------------------
    subgraph TEST["测试 Oracle 链（与知识生成独立）"]
        TSRC["真实源码 + 公开头文件<br/>测试框架 / 构建约束"]
        TG["TestGenAgent<br/>从真实源码提取行为 oracle<br/>不读候选知识文档"]
        TC["候选测试文件<br/>oracle 候选值<br/>覆盖目标与来源说明"]
        OV["OracleValidation（确定性）<br/>对真实源码运行候选测试"]
        VT["已验证门禁测试集<br/>期望输出 + 验证证据"]

        TSRC --> TG
        TG --> TC
        TC --> OV
        TSRC --> OV
        OV --> VT
    end

    PLAN -.->|"委派"| TG

    %% -------------------- 代码生成和检查 --------------------
    subgraph CODE["代码生成与独立检查"]
        CH["公开接口头文件<br/>目标语言 / 构建约束"]
        CA["CodeAgent<br/>只依据候选知识 + 公开接口生成实现<br/>物理隔离真实源码和门禁测试"]
        IMPL["实现代码文件<br/>文件变更清单<br/>假设 / 无法实现项"]
        CRIT["检查判据<br/>允许的 diff 范围 / 编码规范"]
        CK["CheckAgent（CCR）<br/>新会话、只读语义审查<br/>不修改实现代码"]
        CREP["CheckReport .json<br/>blocking + findings<br/>文件 / 行号证据"]

        KS --> CA
        CH --> CA
        CA --> IMPL
        IMPL --> CK
        CRIT --> CK
        CK --> CREP
    end

    PLAN -.->|"委派"| CA
    PLAN -.->|"委派"| CK

    %% -------------------- 确定性评测与审查 --------------------
    subgraph VERIFY["确定性评测、独立审查和门禁"]
        EV["EvalRunner（非 Agent）<br/>编译 + 门禁测试 + 客观指标"]
        EREP["EvaluationReport .json<br/>pass / fail / critical-regression / infra-error<br/>日志、失败证据、环境信息"]
        RV["ReviewAgent（CCR）<br/>只读评测证据和候选知识<br/>归因问题，不直接改代码"]
        RREP["ReviewReport .json<br/>recommendation + findings<br/>corrections: knowledge_path / issue / criterion"]
        G["Gate（确定性，非 Agent）<br/>pass / iterate / rollback / stopped / failed"]

        IMPL --> EV
        VT --> EV
        CREP --> EV
        KS --> EV
        EV --> EREP

        EREP --> RV
        CREP --> RV
        KS --> RV
        RV --> RREP

        EREP --> G
        CREP --> G
        RREP --> G
        RS --> G
    end

    PLAN -.->|"委派"| RV
    G -->|"iterate：只修订知识"| FB
    G -->|"rollback"| RS
    G -->|"pass"| PUB["KnowledgeStore（已验证区）<br/>发布知识 + SHA-256 快照 + ledger"]
    G -->|"stopped / failed"| STOP["终止报告<br/>保留 checkpoint、Artifact 和失败证据"]

    %% -------------------- 样式 --------------------
    classDef input fill:#e8f5e9,stroke:#388e3c,color:#1b5e20;
    classDef agent fill:#e1f5fe,stroke:#0288d1,color:#01579b,stroke-width:2px;
    classDef output fill:#f3e5f5,stroke:#7b1fa2,color:#4a148c;
    classDef infra fill:#fff3e0,stroke:#f57c00,color:#e65100;
    classDef pending fill:#fffde7,stroke:#f9a825,color:#5d4037,stroke-dasharray:5 5;
    classDef terminal fill:#eceff1,stroke:#546e7a,color:#263238;

    class UQ,RS,FB,DSRC,DDEP,PREV,TSRC,CH,CRIT input;
    class O,DW,DG,TG,CA,CK,RV agent;
    class PLAN,FRAG,KD,TC,VT,IMPL,CREP,EREP,RREP output;
    class KS,OV,EV,G infra;
    class DIRECT pending;
    class PUB,STOP terminal;
```

### 图例

- 绿色：Agent 或确定性组件的输入。
- 蓝色：7 类 Agent；`OrchestratorAgent` 在 V1 中使用确定性代码实现，但保留角色位置。
- 紫色：需要落盘、引用或进入下游的产物。
- 橙色：确定性组件，不算 Agent。
- 黄色虚线：尚未确认的边界。

## 2. 分阶段产物流

总图适合检查链路是否完整。汇报单个阶段时，可以直接使用下面三张图。

### 2.1 文档生成

DocWorker 读取分块源码并输出带证据的知识片段，DocGen 是最终知识文档的唯一执笔者。上一版知识和 Review 修订指令也从这里进入下一轮。

```mermaid
flowchart TD
    PLAN["TaskPlan / DispatchPlan<br/>分块任务、并发上限、迭代预算"]
    SRC["源码分块 + 公开头文件<br/>路径、版本、hash"]
    DEP["模块边界 + 依赖图<br/>文档格式约束"]
    DW["DocWorkerAgent × N<br/>每个 worker 处理一个分块"]
    FRAG["知识片段<br/>结构化摘要 + evidence<br/>未解决问题"]
    PREV["上一版知识文档"]
    FIX["Review 修订指令<br/>knowledge_path / issue / criterion"]
    DIRECT["按证据缺口定向补读源码<br/>范围待确认"]
    DG["DocGenAgent<br/>汇总、消除冲突、修订<br/>唯一执笔者"]
    DOC["候选知识文档<br/>sources / evidence<br/>合并与冲突报告"]
    KS["KnowledgeStore 候选区<br/>版本、SHA-256、ledger"]

    PLAN --> DW
    SRC --> DW
    DEP --> DW
    DW --> FRAG
    FRAG --> DG
    PREV --> DG
    FIX --> DG
    DIRECT -.-> DG
    DG --> DOC
    DOC --> KS

    classDef input fill:#e8f5e9,stroke:#388e3c,color:#1b5e20;
    classDef agent fill:#e1f5fe,stroke:#0288d1,color:#01579b,stroke-width:2px;
    classDef output fill:#f3e5f5,stroke:#7b1fa2,color:#4a148c;
    classDef infra fill:#fff3e0,stroke:#f57c00,color:#e65100;
    classDef pending fill:#fffde7,stroke:#f9a825,color:#5d4037,stroke-dasharray:5 5;
    class PLAN,SRC,DEP,PREV,FIX input;
    class DW,DG agent;
    class FRAG,DOC output;
    class KS infra;
    class DIRECT pending;
```

### 2.2 代码生成与评测

代码生成和测试 Oracle 是两条隔离链路。CodeAgent 看不到真实源码和门禁测试；TestGenAgent 不读取候选知识。两条链路只在 EvalRunner 汇合。

```mermaid
flowchart TD
    KS["候选知识文档<br/>KnowledgeStore 候选区"]
    HEADER["公开接口头文件<br/>目标语言 + 构建约束"]
    CA["CodeAgent<br/>只读知识和公开接口"]
    IMPL["实现代码<br/>变更清单 + 假设"]

    SOURCE["真实源码 + 公开头文件<br/>测试框架 + 构建约束"]
    TG["TestGenAgent<br/>提取行为 Oracle<br/>不读候选知识"]
    TESTS["候选测试<br/>期望值 + 来源说明"]
    OV["OracleValidation<br/>在真实源码上运行候选测试"]
    GATE_TESTS["已验证门禁测试集<br/>期望输出 + 验证证据"]

    RULES["检查判据<br/>diff 范围 + 编码规范"]
    CK["CheckAgent<br/>新会话、只读检查"]
    CREP["CheckReport<br/>blocking + findings<br/>文件 / 行号证据"]

    EV["EvalRunner<br/>编译 + 门禁测试 + 客观指标"]
    EREP["EvaluationReport<br/>pass / fail / critical-regression / infra-error"]

    KS --> CA
    HEADER --> CA
    CA --> IMPL

    SOURCE --> TG
    TG --> TESTS
    TESTS --> OV
    SOURCE --> OV
    OV --> GATE_TESTS

    IMPL --> CK
    RULES --> CK
    CK --> CREP

    IMPL --> EV
    GATE_TESTS --> EV
    CREP --> EV
    KS --> EV
    EV --> EREP

    classDef input fill:#e8f5e9,stroke:#388e3c,color:#1b5e20;
    classDef agent fill:#e1f5fe,stroke:#0288d1,color:#01579b,stroke-width:2px;
    classDef output fill:#f3e5f5,stroke:#7b1fa2,color:#4a148c;
    classDef infra fill:#fff3e0,stroke:#f57c00,color:#e65100;
    class KS,HEADER,SOURCE,RULES input;
    class CA,TG,CK agent;
    class IMPL,TESTS,GATE_TESTS,CREP,EREP output;
    class OV,EV infra;
```

### 2.3 Review、门禁与回写

ReviewAgent 负责读取证据、定位问题并给出修订要求。最终路线由确定性 Gate 决定，ReviewAgent 不能直接发布知识。

```mermaid
flowchart TD
    EREP["EvaluationReport<br/>结果、日志、失败证据、环境信息"]
    CREP["CheckReport<br/>blocking + findings<br/>文件 / 行号证据"]
    KS["候选知识文档<br/>当前版本 + sources / evidence"]
    HIST["历史最佳版本<br/>Artifact hash"]
    RS["RunState<br/>iteration + maxIterations"]

    RV["ReviewAgent<br/>只读归因，不改代码"]
    RREP["ReviewReport<br/>recommendation + findings<br/>knowledge_path / issue / criterion"]
    G["Gate<br/>确定性规则"]

    PASS["发布<br/>进入 KnowledgeStore 已验证区"]
    FIX["修订知识<br/>回到 DocGenAgent"]
    ROLLBACK["回滚<br/>恢复历史最佳版本"]
    STOP["停止<br/>保留低置信度结果和证据"]
    FAILED["失败<br/>保留 checkpoint 和错误证据"]

    EREP --> RV
    CREP --> RV
    KS --> RV
    HIST --> RV
    RV --> RREP

    EREP --> G
    CREP --> G
    RREP --> G
    RS --> G
    HIST --> G

    G -->|pass| PASS
    G -->|iterate| FIX
    G -->|rollback| ROLLBACK
    G -->|stopped| STOP
    G -->|failed| FAILED

    classDef input fill:#e8f5e9,stroke:#388e3c,color:#1b5e20;
    classDef agent fill:#e1f5fe,stroke:#0288d1,color:#01579b,stroke-width:2px;
    classDef output fill:#f3e5f5,stroke:#7b1fa2,color:#4a148c;
    classDef infra fill:#fff3e0,stroke:#f57c00,color:#e65100;
    classDef terminal fill:#eceff1,stroke:#546e7a,color:#263238;
    class EREP,CREP,KS,HIST,RS input;
    class RV agent;
    class RREP output;
    class G infra;
    class PASS,FIX,ROLLBACK,STOP,FAILED terminal;
```

## 3. 公共 Agent 任务契约

下图是所有 Agent 都可共用的外层信封。具体 Prompt 和业务 Schema 可以后续调整，但不应要求改写 LangGraph 顶层图。

```mermaid
flowchart LR
    T["AgentTask<br/>runId / iteration / attempt<br/>objective / constraints<br/>ArtifactRef[]<br/>workspace 读写边界<br/>previousFeedback?"]
    A["AgentRunner Adapter<br/>Fake / CodeAgent CLI / 可选 Provider"]
    R["AgentResult<br/>status / summary<br/>output manifest<br/>evidence / assumptions<br/>unresolvedIssues<br/>sessionId?"]
    FS["Workspace 文件快照<br/>校验实际新增 / 修改 / 删除"]
    AR["ArtifactStore<br/>ArtifactRef + SHA-256<br/>producer / iteration / attempt"]

    T --> A
    A --> R
    A --> FS
    R --> AR
    FS --> AR

    classDef input fill:#e8f5e9,stroke:#388e3c;
    classDef agent fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef output fill:#f3e5f5,stroke:#7b1fa2;
    classDef infra fill:#fff3e0,stroke:#f57c00;
    class T input;
    class A agent;
    class R output;
    class FS,AR infra;
```

## 4. 每个 Agent 的最小输入输出

| Agent | 最小输入 | 最小输出 | 必须携带的证据 | 禁止项 |
|---|---|---|---|---|
| OrchestratorAgent | 用户目标、RunState、上轮修订要求 | TaskPlan、worker 任务、并发/迭代预算 | 每个任务的输入 ArtifactRef | 不执笔，不替代 Gate 作内容决策 |
| DocWorkerAgent | 源码分块、头文件、依赖图、分块目标 | 知识片段、结构化摘要、未解问题 | 源文件、symbol、行号/hash | 不跨越已分配模块范围 |
| DocGenAgent | DocWorker 片段、上版知识、Review 修订指令 | 候选知识文档、合并/冲突报告 | 每个事实的 sources/evidence | 不编造缺失行为；直读源码范围待确认 |
| TestGenAgent | 真实源码、头文件、测试/构建规范 | 候选测试、oracle 候选、覆盖目标 | oracle 的源码依据及实跑验证结果 | 不读候选知识，不由 LLM 单独确认期望值 |
| CodeAgent | 候选知识、公开头文件、构建约束 | 实现代码、变更清单、假设/无法实现项 | 知识段落 / 公开接口引用 | 不读真实源码和门禁测试 |
| CheckAgent | 实现代码、diff、判据清单 | blocking/findings 检查报告 | 文件、行号、触发的判据 | 只读，不直接修改代码，不给最终发布结论 |
| ReviewAgent | EvaluationReport、CheckReport、候选知识、历史版本 | recommendation、findings、corrections | 失败用例→knowledge_path→修订判据的映射 | 只读，不改代码，不越过确定性 Gate 发布 |

## 5. 当前需要继续确认的问题

1. DocGenAgent 是完全不读源码，还是允许根据证据缺口定向补读；
2. DocWorker 的分块单位是文件、symbol、模块还是依赖子图；
3. 知识文档最终格式是 OKF、Markdown + front matter，还是另定 Schema；
4. TestGenAgent 的候选测试如何进入受保护门禁集，以及哪些测试需要人工复核；
5. CodeAgent 允许使用的构建命令、第三方依赖和输出目录；
6. CheckReport 和 ReviewReport 的 severity、blocking 和修订指令 Schema；
7. 不同 Agent 的 session 是同轮复用、跨轮复用，还是每次新建。

这些问题不影响当前 LangGraph 拓扑和 `AgentRunner` Adapter 边界，但会决定后续每个 Agent 的具体 Prompt、上下文构建和业务评测方法。
