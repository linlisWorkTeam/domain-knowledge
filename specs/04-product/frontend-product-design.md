# 知识飞轮前台产品设计

**状态：Accepted；UI Refresh Stage 1 规范已冻结，固定 ohMyWorkPanel 自动路径已实现｜版本：0.4.0｜日期：2026-09-03**

本文定义 domain-knowledge 知识飞轮控制台的用户体验、信息架构、交互边界、接口需求和验收标准。领域状态、门禁、安全和发布语义以同仓库的[规范总入口](../README.md)为准；前台不得创造第二套状态或发布权威。

关联规范：

- [用户用例与交互时序](../05-workflows/user-use-cases.md)
- [知识飞轮工作流](../05-workflows/knowledge-flywheel-workflow.md)
- [数据边界与权限矩阵](../09-security/data-boundaries.md)
- [知识发布门禁](../08-evaluation/knowledge-publication-gate.md)

## 1. 产品定位

前台不是 Agent 聊天室，也不是让用户逐步点击状态转换的工作流调试器。它是：

> 面向工程师和知识治理者的本地优先控制台，用于启动自动知识飞轮、观察证据链、处理异常治理，并安全消费已经发布的知识。

### 1.1 产品目标

1. 用户用一个高层动作启动 Run，Workflow Service 自动推进正常路径。
2. 用户能够回答“现在运行到哪里、为什么停下、用了什么证据、发布了哪个版本”。
3. `CANDIDATE`、质量合格、Gate `PASS` 和 `VERIFIED` 在视觉与文案上严格区分。
4. 只有需要人类判断的异常进入治理队列，正常迭代不要求人工逐节点操作。
5. 任一关键结果都能沿 `Run → Agent node → Artifact → Evaluation → GateDecision → Publication` 追溯。

### 1.2 非目标

- 不提供任意状态跳转按钮。
- 不允许用户在页面上直接把候选标记为 `VERIFIED`。
- 不把模型流式文本、思维过程或 Agent 自评分当成进度或证据。
- 不在第一阶段实现通用 IDE、源码编辑器或复杂工作流画布编辑器。
- 不把受信项目 EvalRunner 描述成敌对代码沙箱。

## 2. 用户角色与核心任务

| 角色 | 核心任务 | 默认权限 |
|---|---|---|
| 知识消费者 | 搜索 `VERIFIED` 知识、查看来源、提交使用反馈 | 只读 + feedback |
| 工程师 | 选择项目和模块、启动 Run、观察自动迭代、取消自己的 Run | 受保护写入 |
| 知识治理者 | 查看 Correction、处理 `LOW_CONFIDENCE`、批准重新运行或创建新候选 | 受保护写入 |
| 发布验收者 | 查看固定 commit、测试命令、工具链、Gate 和 publication receipt | 只读审计；受控重跑 |
| 平台维护者 | 配置 Provider、Policy、评测器和安全边界，诊断基础设施失败 | 本地管理员 |

## 3. 产品原则

### 3.1 证据优先

界面先展示确定性事实：状态、测试结果、reason code、ArtifactRef、commit、工具链和 receipt。Agent 名称、模型和耗时是辅助信息，不占据主视觉中心。

### 3.2 自动化可见，但不要求人工遥控

正常路径由 Workflow Service 自动推进。界面展示状态图、节点和事件，但不为 `PLANNED → GENERATING → EVALUATING` 提供人工“下一步”按钮。用户只看到符合当前状态和权限的高层动作。

### 3.3 失败可理解

错误必须归入以下一种用户可理解类别：

- 行为失败：测试或关键门禁未通过。
- 知识问题：Correction 已定位知识路径。
- 基础设施失败：工具、超时、资源或 Provider 不可用。
- 安全拒绝：权限、路径、命令或完整性校验失败。
- 预算停止：迭代上限或停滞策略触发。

### 3.4 渐进披露

概览只展示结果和需要注意的事项；Run 详情展示节点；Evidence Drawer 才展示 argv、摘要和 ArtifactRef；完整原始 Artifact 需要显式打开且受权限控制。

### 3.5 高风险动作显式确认

取消运行、以新策略重跑、发布例外申请和治理决议必须展示影响范围。普通查询、查看证据和下载审计摘要不需要确认。

## 4. 信息架构

### 4.1 实现目录边界

本产品控制台的新增代码必须收口在 domain-knowledge：

```text
domain-knowledge/
├── acceptance/            # 固定源码验收 fixture
├── src/
│   ├── domain/              # 领域模型与确定性业务规则
│   ├── application/
│   │   ├── ports/           # 应用端口契约
│   │   └── services/        # 用例编排
│   ├── infrastructure/      # 持久化、评测器、智能体与工作流实现
│   └── interfaces/          # 命令行、服务接口与外部适配入口
├── docs/                  # 架构、运维、迁移
├── specs/                 # 产品、需求、工作流、Schema 与验收规范
├── site/                  # 双主题 GitHub Pages 项目官网
├── tests/                 # unit、contract、integration、acceptance
└── web/                   # HTML、CSS 与浏览器交互
```

控制台服务适配器与只读投影分别位于 `src/interfaces/runner/server.ts` 和 `src/interfaces/runner/console-read-model.ts`。控制台不得为了页面查询扩张 `src/application/services`、`src/application/ports` 或写侧持久化仓库；状态变更仍只能委托共享应用服务。

```text
Knowledge Flywheel
├── 操作中心
│   ├── 系统健康
│   ├── 运行指标
│   ├── 需要处理
│   └── 最近 Run
├── Runs
│   ├── Run 列表
│   ├── 创建 Run
│   └── Run 工作台
│       ├── 自动化状态图
│       ├── Agent 节点
│       ├── 评测与 Gate
│       ├── Correction / 版本变化
│       └── 事件与证据
├── Knowledge
│   ├── 知识目录
│   ├── 版本详情
│   ├── 版本血缘与 Diff
│   └── 使用反馈
├── Governance
│   ├── LOW_CONFIDENCE
│   ├── 基础设施失败
│   ├── 安全拒绝
│   └── 待批准动作
├── Evidence
│   ├── Artifact 检索
│   ├── EvaluationReport
│   └── Publication receipt
├── 智能体
│   ├── Agent 目录与固定契约
│   ├── 当前 Provider / 运行健康
│   └── 追加提示词定制
├── 发现
│   └── 当前来源扫描候选
└── 设置
    ├── Policy
    ├── Project / source roots
    ├── Agent Provider
    └── EvalRunner / Sandbox 状态
```

`Agents` 不是工作流画布编辑器。节点名称、职责、依赖、输入输出 Schema、可读写范围和工具权限来自服务端固定定义，只读展示。治理模式下仅可修改 `promptAddon`；前台不得提交任意 Agent 类型、Provider 类名、节点边或 Schema。

### 4.2 UI Refresh Stage 1 范围

`web/prototype/` 中保存的 PR #2 原型只作为布局、密度、组件层级和绿色强调色的视觉参考。运行时事实、可用动作、状态名称和权限仍以服务端 API 与本规范为准，原型内的演示数据不是产品契约。

第一阶段导航固定为“操作中心、运行、知识、治理、证据、智能体、发现、设置”。其中：

- 操作中心从 Run 状态与最新 GateDecision 派生运行级待治理事项，不声明独立 Action Item 生命周期。
- 发现页只展示 `GET /api/v1/scan` 返回的来源候选，不描述为持久化 Source Registry。
- Knowledge Graph、Knowledge Health、跨 Run Activity、精确进度百分比、ETA、多项目切换和用户身份不在本阶段能力内；对应入口隐藏，或以不带演示值的明确“尚未接入”状态展示。
- 页面只能展示服务端事实或本节允许的派生值。派生值必须能说明输入字段和计算规则，不得伪装成服务端指标。
- API 失败、部分响应或空结果分别进入 Error、Partial 或 Empty 状态，不得回退到原型演示数据。

## 5. 全局界面框架

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ ◇ Knowledge Flywheel   [环境: Local] [只读/治理模式] [系统健康] [用户]   │
├──────────────┬────────────────────────────────────────────────────────────┤
│ 操作中心     │ 页面标题                                      主要动作    │
│ Runs         ├────────────────────────────────────────────────────────────┤
│ Knowledge    │                                                            │
│ Governance 3 │                    页面主内容                              │
│ Evidence     │                                                            │
│ Agents       │                                                            │
│ 发现         │                                                            │
│ Settings     │                                                            │
│              │                                                            │
├──────────────┴────────────────────────────────────────────────────────────┤
│ Runtime · Registry · CAS · Provider · Evaluator 状态                     │
└───────────────────────────────────────────────────────────────────────────┘
```

全局规则：

- 左侧导航固定，治理队列显示未处理数量。
- 顶栏持续显示当前运行环境和权限模式，避免用户误以为只读页面可以写入。
- 第一阶段全局搜索覆盖 Knowledge 关键词；Run ID、moduleId 和 versionId 通过对应列表和详情定位。Artifact 全局检索在专用 API 可用前不作承诺。
- 系统健康不是单一绿色圆点，而是 Registry、CAS、Provider、Evaluator 的分项状态。

## 6. 核心页面设计

### 6.1 操作中心

操作中心用于回答三个问题：系统是否正常、飞轮是否在工作、我是否需要介入。第一阶段的待处理条目是 Run 级投影，仅允许从 `FAILED`、`LOW_CONFIDENCE` 或最新 GateDecision=`STOPPED` 的真实数据产生。

```text
┌─ 今日运行 ─────┬─ VERIFIED ─────┬─ 自动迭代 ────┬─ 待治理 ─────────┐
│ 12             │ 38             │ 7             │ 3                │
│ 成功 8 / 运行 2 │ 本周 +5        │ 平均 1.6 轮    │ 1 安全 / 2 停止 │
└────────────────┴────────────────┴───────────────┴──────────────────┘

需要处理
┌────────────────────────────────────────────────────────────────────┐
│ HIGH  ohmyworkpanel-mentions · STOPPED · 迭代预算耗尽  [查看]     │
│ MED   cpp-parser · INFRA_FAILURE · evaluator unavailable [诊断]  │
└────────────────────────────────────────────────────────────────────┘

最近 Run
Module             State          Iteration   Gate       Updated
mentions           EVALUATING     1/5         —          2m
connector-routing  VERIFIED       2/5         PASS       1h
```

禁止使用虚构的“AI 信心分”。指标必须来自 Registry、EvaluationReport 或事件聚合；Coverage、Freshness、Accuracy、趋势百分比、ETA 和全局活动流在没有专用服务端口径时不得展示数值。

### 6.2 创建 Run

采用三步向导，最终提交的是高层 `StartRunCommand`，不是一组裸状态转换。

1. **来源**：选择已配置项目、固定 commit、模块和公开接口范围。
2. **策略**：选择 GatePolicy、最大迭代、评测器和允许的工具。
3. **确认**：展示可访问路径、命令白名单、预计资源和安全边界。

提交后界面立即进入 Run 工作台；Workflow Service 负责后续状态推进。

必须在确认页突出显示：

- 固定 commit 与当前 checkout HEAD 的区别。
- 是否为受信源码执行。
- 当前执行器是否具备 OS 级隔离。
- Agent Provider 是真实模型还是 deterministic scenario。

### 6.3 Run 工作台

这是产品的核心页面。

```text
┌ mentions / run_fad0... ───────────── EVALUATING · Iteration 2/5 ───────┐
│ fixed commit cfef082 · policy local-v1 · trusted-source evaluation      │
│ [取消 Run] [导出审计]                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│ CREATED ✓ → PLANNED ✓ → GENERATING ✓ → EVALUATING ● → REVIEWING       │
│                                    ↖ ITERATING 1                         │
├───────────────────────────────────────────────┬─────────────────────────┤
│ 自动化节点                                    │ 当前节点                │
│                                               │ EvalRunner · attempt 2  │
│ Reference Gate  ✓ 1/1                         │ elapsed 00:42           │
│ DocGen v1       ✓  artifact...                │ command 2/4             │
│ CodeGen v1      ✓                             │                         │
│ Eval v1         ✕ 0/1                         │ [查看实时事件]          │
│ Review          ✓  COR-0001                   │ [查看证据摘要]          │
│ DocGen v2       ✓  changed: 行为规则          │                         │
│ CodeGen v2      ✓  fresh                      │                         │
│ Eval v2         ●                             │                         │
├───────────────────────────────────────────────┴─────────────────────────┤
│ 时间线  10:21 EvalStarted · 10:20 NodeCompleted · 10:18 ArtifactCommitted│
└─────────────────────────────────────────────────────────────────────────┘
```

#### 状态与可用动作

| 状态 | 主信息 | 用户动作 |
|---|---|---|
| `CREATED / PLANNED` | 输入、计划、权限和资源声明 | 取消；无“下一步”按钮 |
| `GENERATING` | 当前 Agent、输入引用、Schema 状态 | 取消；查看节点 |
| `EVALUATING` | 命令进度、测试计数、超时和工具链 | 取消；查看证据 |
| `REVIEWING` | Gate reason codes、Correction | 正常路径自动继续 |
| `ITERATING` | 当前轮次、修改知识路径、剩余预算 | 查看 Diff；正常路径自动继续 |
| `ROLLING_BACK` | historical best、回滚原因 | 查看比较；正常路径自动继续 |
| `PUBLISHING` | 事务阶段和 publication key | 只读等待；不得重复点击发布 |
| `VERIFIED` | 版本、GateDecision、receipt | 打开知识；导出审计 |
| `LOW_CONFIDENCE` | 停止原因、未解决风险、建议动作 | 创建治理决议；以新 Run 重试 |
| `FAILED` | 失败类别、最后 checkpoint | 诊断；满足规则时从新 Run 重试 |
| `CANCELLED` | 取消主体、时间、清理结果 | 查看审计 |

### 6.4 Correction 与知识 Diff

Correction 不使用聊天气泡展示，而使用结构化审阅卡：

```text
Correction COR-0001
知识路径      行为规则
失败判据      AC-E2E-001
证据          evaluation sha256:...
风险          mention parsing behavior remains incorrect

知识变化
  未修改  背景
  已修改  行为规则       [展开 Diff]
  未修改  验证方式

范围校验      PASS · 指定章节外字节一致
```

用户可以查看 Correction 和 Diff，但正常 `ITERATE` 不要求点击批准。只有策略明确要求人工批准或进入 `LOW_CONFIDENCE` 时才出现治理动作。

### 6.5 Knowledge 页面

保留当前左右分栏的高效浏览方式，并增加：

- 模块级版本血缘图。
- `CANDIDATE / VERIFIED / SUPERSEDED / LOW_CONFIDENCE` 状态解释。
- Quality Gate 与 Behavioral Gate 分区，禁止把两个分数合并。
- 与上一版本的 Markdown Diff。
- 产生该版本的 Run、Correction、Evaluation 和 receipt 反向链接。
- `hit / rate / correct` 反馈控件；反馈后明确提示“不会直接改变发布状态”。

### 6.6 Evidence 页面

默认展示脱敏摘要：

- Artifact ID、media type、size、完整性状态。
- 来源 commit、工具链 fingerprint、命令、退出码和耗时。
- 测试总数、通过数、稳定性、critical failures。
- Gate reason codes 和策略版本。

stdout/stderr、Prompt 和源码正文依据权限分级。页面不得通过 URL 参数绕过 Artifact 权限。

### 6.7 Governance 队列

治理条目按风险而不是创建时间优先：

1. 安全与完整性拒绝。
2. 关键行为回归或 `ROLLBACK`。
3. `STOPPED / LOW_CONFIDENCE`。
4. 基础设施失败。
5. 用户 `correct` 反馈。

允许的治理结果只有：创建新 Run、补充来源、调整策略后新建 Run、接受当前 `LOW_CONFIDENCE` 状态、取消。不得直接修改既有 GateDecision 或 publication receipt。

## 7. 自动化交互

```mermaid
sequenceDiagram
    autonumber
    actor User as 工程师
    participant UI as Flywheel Console
    participant API as Command API
    participant WF as Workflow Service
    participant Events as Event Stream
    participant Gate as Deterministic Gate

    User->>UI: 完成创建 Run 向导
    UI->>API: StartRunCommand
    API->>WF: 创建并启动 Run
    WF-->>UI: runId
    UI->>Events: 订阅 runId 事件

    loop 自动执行到终态
        WF-->>Events: state / node / artifact / evaluation event
        Events-->>UI: 增量更新 Run 工作台
        WF->>Gate: EvaluationReport + Policy
        Gate-->>WF: PASS / ITERATE / ROLLBACK / STOPPED
    end

    alt VERIFIED
        Events-->>UI: publication receipt
        UI-->>User: 发布成功，可查看知识与审计
    else LOW_CONFIDENCE / FAILED
        Events-->>UI: governance required
        UI-->>User: 加入治理队列并说明原因
    end
```

前台刷新或断线重连后，必须先读取 Run snapshot，再从最后 `event_seq` 续订事件；不得通过前端本地状态猜测 Run 进度。

### 7.1 查看和定制 Agent

```mermaid
sequenceDiagram
    actor Operator as 平台维护者
    participant UI as Agents 页面
    participant API as Knowledge Flywheel API
    participant Registry as Agent 配置存储
    participant WF as LangGraph infrastructure

    Operator->>UI: 打开 Agent 目录
    UI->>API: GET /api/v1/agents
    API-->>UI: 固定定义 + 当前 promptAddon + 节点状态摘要
    Operator->>UI: 修改追加提示词
    UI->>API: PUT /api/v1/agents/:agentId/prompt
    API->>Registry: 校验长度并审计保存
    Registry-->>API: 配置版本
    API-->>UI: 更新后的 Agent 视图
    Note over API,WF: 新提示词只影响后续节点执行，不改职责、输入输出或拓扑
```

## 8. 视觉系统

### 8.1 风格

界面提供深色和浅色两套主题。两者使用同一套语义 token、信息层级和组件尺寸，只改变颜色值与阴影强度。深色适合长时间观察 Run；浅色适合明亮环境、阅读知识正文和打印截图。

| 语义 | 深色 | 浅色 |
|---|---|---|
| 背景 | `#080B10` | `#F4F7F9` |
| 一级表面 | `#10151D` | `#FFFFFF` |
| 二级表面 | `#121A25` | `#F0F4F7` |
| 边框 | `#273140` | `#CBD6DF` |
| 主文字 | `#EEF2F7` | `#17212B` |
| 次文字 | `#9AA8BA` | `#586B7D` |
| 交互强调 | `#55E6B5` | `#0B9D72` |
| 成功 / VERIFIED | `#76EFBD` | `#087C58` |
| 候选 / 等待 | `#FFD27D` | `#92610F` |
| 失败 | `#FF7D8E` | `#B62F48` |
| 治理 / LOW_CONFIDENCE | `#C7A6FF` | `#7250A8` |

颜色必须同时配合图标和文字，不作为唯一状态表达。

UI Refresh Stage 1 实现合入前，当前 Console 与项目官网继续共享既有交互强调色 `#71D4FF`（深色）和 `#07769F`（浅色），不得仅修改规范造成实现漂移。绿色目标 token 只在新版 Console、契约测试和本规范同步落地后启用；项目官网是否同步换色另行评审。

正文默认不小于 `14px`，辅助说明不小于 `12px`，仅非关键短标签可以使用 `11px`；正文行高不低于 `1.5`。页面在 200% 缩放下必须保持查询、导航、详情与治理状态可用。字体、图标、脚本和样式默认同源提供，不得依赖 Google Fonts 或其他第三方 CDN；既有 Content Security Policy 不得因视觉改版放宽。

### 8.2 组件

- `StateBadge`：领域状态和解释。
- `RunStepper`：合法状态路径与当前节点。
- `NodeCard`：Agent、输入输出、checkpoint、重试次数。
- `GatePanel`：Outcome、reason codes、策略和证据。
- `ArtifactLink`：摘要显示、复制、完整性状态和权限提示。
- `CorrectionCard`：路径、判据、证据、风险和知识 Diff。
- `GovernanceAction`：高风险动作、影响说明和确认。
- `EventTimeline`：按 `event_seq` 排序，不依赖相同时间戳。

### 8.3 主题切换

- 首次访问跟随 `prefers-color-scheme`。
- 用户手动切换后，把 `light` 或 `dark` 偏好写入独立的 `localStorage` key；主题数据不得与治理 token 共用存储。
- 切换按钮必须有可感知名称，并显示切换后的目标主题。
- 官网和本地 Console 分别适配两套主题。项目官网仍是纯静态页面，不得因为主题切换连接 Registry 或写 API。
- 状态色在两套主题下都要保持文字、边框或图标提示；正文与背景应满足 WCAG AA 对比度。

### 8.4 响应式策略

- ≥1200px：固定侧栏，Run 图与当前节点双栏。
- 768–1199px：可折叠侧栏，详情 Drawer。
- <768px：只保证查询、告警确认和 Run 观察；创建策略与复杂 Diff 引导用户使用桌面宽度。

移动端允许把表格转换为卡片，但不得仅通过隐藏列丢失状态、来源或更新时间等关键事实。侧栏应折叠为可关闭导航，打开的详情必须能够通过返回按钮或 Escape 关闭。

## 9. 权限与安全体验

- 未配置 `WP_KNOWLEDGE_WRITE_TOKEN` 时，界面明确进入“只读模式”，隐藏写按钮，并在“设置”中给出完整配置方法。
- 仓库根目录提供 `.env.example`。用户将其复制为默认忽略的 `.env.local`，设置随机长令牌后重启 `npm run knowledge:serve`；启动脚本自动读取该文件。
- 令牌错误显示 `401`，不得伪装成网络故障。
- 令牌不得写入网址、日志或长期浏览器存储；本地第一版只保存在当前页面内存中。
- UI 不直接暴露通用 `transition` 操作；产品动作调用高层 Command API。
- 所有治理动作展示 actor、runId、目标资源和预期副作用，并产生审计事件。
- 安全拒绝必须显示 reason code 和受控摘要，不泄露被拒绝的源码或密钥。

## 10. 状态体验

每个页面必须覆盖：

| 状态 | 产品行为 |
|---|---|
| Loading | 使用骨架屏，避免把零值误认为真实指标。 |
| Empty | 解释为什么为空，并提供符合权限的下一动作。 |
| Stale | 显示最后更新时间和重新连接状态。 |
| Partial | 单个 Evidence/Provider 故障不抹掉已持久化的 Run snapshot。 |
| Unauthorized | 显示只读能力和重新验证入口。 |
| Write disabled | 明确要求服务端配置 token，而不是反复要求用户输入。 |
| Conflict | 显示幂等重放或输入冲突的具体原因。 |
| Terminal | 冻结状态视图，只允许审计、新建 Run 或治理动作。 |

## 11. 前端所需 API

### 11.1 当前可复用

| API | 用途 | 产品化判断 |
|---|---|---|
| `GET /api/v1/status` | 操作中心基础指标 | 可复用；第一阶段不扩展为综合健康分 |
| `GET /api/v1/capabilities` | Provider、Prompt 传输、Agent 源码隔离和敌对代码执行隔离的当前事实 | 已实现；前台不得把两种隔离合并展示 |
| `GET /api/v1/knowledge` | 知识列表与状态筛选 | 第一阶段直接复用；分页与排序仍是后续扩展 |
| `GET /api/v1/knowledge/:versionId` | 知识详情、正文与 provenance | 第一阶段直接复用；血缘和反向链接仍是后续扩展 |
| `GET /api/v1/query` | Knowledge 关键词与分类搜索 | 第一阶段直接复用；分页和高亮摘要仍是后续扩展 |
| `GET /api/v1/scan` | 发现页的来源候选 | 可复用，不等同于持久化来源管理 |
| `POST /api/v1/feedback` | 用户反馈 | 可复用，需要前端表单 |
| `POST /api/v1/runs` | 创建 Run | 仅创建，不会启动完整自动流 |
| `POST /api/v1/transition` | 裸状态转换 | 只保留运维兼容，不供产品 UI 使用 |
| `POST /api/v1/evaluate` | 录入受信报告 | 只供受信操作端，不作为普通 UI 流程 |
| `POST /api/v1/publish` | 发布 | 由 Workflow/Publisher 调用，不暴露普通按钮 |

### 11.2 运行与观察 API

| API | 需求 |
|---|---|
| `GET /api/v1/runs` | 已实现 Run 摘要和状态过滤；模块过滤、分页与排序仍待扩展。 |
| `GET /api/v1/runs/:runId` | 已实现 Run、版本、评测、Decision、checkpoint、workflowNodes、事件和 publication 的 snapshot。 |
| `GET /api/v1/runs/:runId/events?after=<seq>` | 基于 `event_seq` 增量读取事件。 |
| `GET /api/v1/runs/:runId/workflow-nodes` | 已实现节点、角色、轮次、尝试、状态和时间投影。 |
| `GET /api/v1/runs/:runId/workflow-status` | 已实现工作流执行状态查询，不替代 FlywheelRun 业务状态。 |
| Run snapshot 中的 `evaluations` 与 `latestDecision` | 第一阶段评测和 Gate 视图的事实源；当前没有独立评测列表 API。 |
| `GET /api/v1/knowledge/:versionId/lineage` | 返回父子版本、关联 Run、Correction 和 publication。 |
| `GET /api/v1/artifacts/:artifactId` | 按权限返回元数据或受控内容。 |
| 前端从 `GET /api/v1/runs` 派生治理队列 | 第一阶段只形成 Run 级只读队列；当前没有独立 Governance API。 |
| `GET /api/v1/policies` | 返回可选择的固化策略及解释。 |
| `POST /api/v1/run-commands/start` | 已实现固定 ohMyWorkPanel profile；通用来源/策略向导和命令幂等键仍待完成。 |
| `POST /api/v1/run-commands/cancel` | 已实现取消传播和业务状态同步；请求级幂等审计仍待强化。 |
| `POST /api/v1/run-commands/resume` | 已实现按同一 runId/thread_id 从 graph checkpoint 恢复。 |
| `POST /api/v1/run-commands/retry` | 根据治理决议创建新 Run 或合法重试失败节点。 |
| `POST /api/v1/governance/:id/resolve` | 记录受控治理决议，不直接篡改 Gate 或发布记录。 |
| `GET /api/v1/event-stream` | SSE 推送事件；断线后使用 `event_seq` 续传。 |
| `GET /api/v1/agents` | 已实现全部固定 Agent 定义和追加提示词；Provider 健康仍待接入。 |
| `PUT /api/v1/agents/:agentId/prompt` | 已实现；只更新受限 `promptAddon`，需要写 token，拒绝职责、Schema、权限或拓扑字段。 |
| `GET /api/v1/runs/:runId/workflow-nodes` | 已实现 LangGraph 节点执行投影，不暴露 checkpoint 私有数据。 |
| `GET /api/v1/runs/:runId/demo-report` | 已实现脱敏 Demo JSON 下载；覆盖 Registry 事实、Agent 调用摘要和 CAS 完整性，不返回 Prompt/Session/凭据。 |

所有列表接口必须有稳定排序、游标分页和上限；所有 Command 必须包含幂等键并返回关联 `runId/eventId`。

上述分页、独立 Governance、lineage、Artifact、policy、retry 和 SSE 路由是目标契约，不得在第一阶段前台中假定已经实现。精确进度、ETA、Knowledge Health、Knowledge Graph、跨 Run Activity、持久化 Sources 和 Evaluation Rule 管理同样等待后端规范对齐后另行立项。

## 12. 产品需求与验收

| ID | 优先级 | 需求 | 验收 |
|---|---|---|---|
| KF-UI-001 | P0 | 用户必须能从一个高层入口启动自动 Run，不接触裸状态转换。 | AC-UI-001 |
| KF-UI-002 | P0 | Run 工作台必须从服务端 snapshot 和事件显示状态、节点、迭代和 Gate。 | AC-UI-002 |
| KF-UI-003 | P0 | 正常 `ITERATE/ROLLBACK/PASS` 路径必须自动推进，前台不得要求逐节点点击。 | AC-UI-003 |
| KF-UI-004 | P0 | Quality Gate 与 Behavioral Gate 必须分区展示，并解释 `ACCEPTED` 不等于 `VERIFIED`。 | AC-UI-004 |
| KF-UI-005 | P0 | 用户必须能从 Run 追踪到 Correction、版本、Evidence、GateDecision 和 receipt。 | AC-UI-005 |
| KF-UI-006 | P0 | 只有 `STOPPED/LOW_CONFIDENCE/FAILED` 或策略要求批准时进入治理队列。 | AC-UI-006 |
| KF-UI-007 | P0 | 只读、未授权和写入关闭必须具有不同且可理解的界面状态。 | AC-UI-007 |
| KF-UI-008 | P0 | 高风险操作必须受权限保护、显式确认、幂等并记录事件。 | AC-UI-008 |
| KF-UI-009 | P1 | 用户可以比较知识版本，并确认 Correction 之外的范围未变化。 | AC-UI-009 |
| KF-UI-010 | P1 | Run 必须支持断线重连和按 `event_seq` 恢复，不丢失已持久化状态。 | AC-UI-010 |
| KF-UI-011 | P1 | 知识消费者可以在不获得发布权限的情况下查询和反馈。 | AC-UI-011 |
| KF-UI-012 | P1 | 界面必须满足键盘导航、可见焦点、语义标签和非纯颜色状态表达。 | AC-UI-012 |
| KF-UI-013 | P1 | 项目官网和本地 Console 必须提供深色/浅色主题，首次跟随系统、允许手动切换并独立保存偏好；主题切换不得持久化治理凭据或改变领域状态。 | AC-UI-013 |
| KF-UI-014 | P0 | Agents 页面必须显示全部 Agent 的固定职责、输入输出、基础提示词和追加提示词；每次 Run 中的 Agent 节点状态在 Run 工作台显示。 | AC-UI-014 |
| KF-UI-015 | P0 | 治理模式只能修改 Agent 的追加提示词；服务端必须拒绝任何拓扑、职责、Schema、Provider 实现或权限替换。 | AC-UI-015 |
| KF-UI-016 | P0 | Run 工作台必须显示 LangGraph 节点投影，并明确区分执行状态与 FlywheelRun 业务状态。 | AC-UI-016 |
| KF-UI-017 | P1 | 项目官网和控制台的用户可见文案必须使用自然、统一的中文；除固定标题 `WORKPANEL · KNOWLEDGE FLYWHEEL` 外，不得出现中英文拼接的栏目名、状态名或说明句。代码、命令、项目名、环境变量和协议标识符按原值展示。 | AC-UI-017 |
| KF-UI-018 | P0 | 写入关闭时，设置页必须提供 `.env.local` 的创建位置、变量示例和重启方式；配置前所有写操作仍默认拒绝，治理令牌只保存在页面内存中。 | AC-UI-018 |
| KF-UI-019 | P0 | 前台只能展示服务端事实或具有公开计算规则的派生值；缺少领域模型或 API 支持的指标、身份、问题和关系不得以模拟数据呈现。 | AC-UI-019 |

### 12.1 验收场景

| ID | Given / When / Then |
|---|---|
| AC-UI-001 | Given 有效来源和 Policy，When 用户确认创建 Run，Then 系统返回 runId 并自动进入工作流，页面没有手动状态推进控件。 |
| AC-UI-002 | Given 一个活动 Run，When 打开工作台，Then 状态、迭代、节点和事件均来自服务端且刷新后保持一致。 |
| AC-UI-003 | Given 首轮评测失败且预算充足，When Gate=`ITERATE`，Then Review、局部修订、fresh CodeGen 和复评自动发生。 |
| AC-UI-004 | Given Quality=`ACCEPTED` 但无 PASS Gate，When 查看知识，Then 页面仍显示 `CANDIDATE` 并禁止发布表述。 |
| AC-UI-005 | Given 一个 `VERIFIED` 版本，When 从详情逐层导航，Then 能定位原 Run、输入、Correction、评测证据、Gate 和 receipt。 |
| AC-UI-006 | Given Gate=`STOPPED`，When事件到达，Then Run 进入治理队列，页面说明原因、未解决风险和允许动作。 |
| AC-UI-007 | Given未配置 token、错误 token 和有效 token，When进入控制台，Then分别显示只读、未授权和治理模式。 |
| AC-UI-008 | Given用户取消活动 Run，When确认影响，Then请求带幂等键，重复提交只产生一个取消结果和审计事件。 |
| AC-UI-009 | Given Correction 仅指向一个知识章节，When查看 v1/v2 Diff，Then明确显示目标章节变化和范围校验结果。 |
| AC-UI-010 | Given浏览器在第 N 个事件后断线，When恢复，Then先读取 snapshot，再从 N 后续传且事件不重不漏。 |
| AC-UI-011 | Given只读知识消费者，When查询并提交 feedback，Then反馈被记录但知识状态和 GateDecision 不变。 |
| AC-UI-012 | Given仅键盘和屏幕阅读器，When完成查询并打开 Run Gate，Then焦点顺序、名称、状态和错误均可感知。 |
| AC-UI-013 | Given 系统主题为浅色、无已保存偏好，When 首次打开官网或 Console，Then 使用浅色 token；When 用户切换深色并刷新，Then 主题保持且页面没有保存治理 token、发出写请求或改变 Run 状态。 |
| AC-UI-014 | Given 已启动或未启动工作流，When 打开 Agents 页面和 Run 工作台，Then 七类 Agent 均可查阅，固定契约与可编辑提示词分离，节点状态按 runId 展示。 |
| AC-UI-015 | Given 有效写 token，When 保存 promptAddon，Then 后续执行使用该值并产生审计；When 请求包含 role、inputs、outputs、tools 或 edges，Then 服务端拒绝。 |
| AC-UI-016 | Given LangGraph 正在运行，When 打开 Run 工作台，Then 页面从 Knowledge Registry 的节点投影显示 pending/running/completed/failed，不把 graph route 当成知识发布状态。 |
| AC-UI-017 | Given 用户打开项目官网或控制台，When 阅读栏目、状态、说明和错误提示，Then 除固定标题与原样技术标识符外，页面不出现英文栏目或中英文拼接句，中文表达自然且术语一致。 |
| AC-UI-018 | Given 服务端未配置写入令牌，When 用户点击治理模式或打开设置页，Then 页面引导其从 `.env.example` 创建 `.env.local`、设置 `WP_KNOWLEDGE_WRITE_TOKEN` 并重启服务；令牌不会被写入网址或本地存储。 |
| AC-UI-019 | Given 服务端只提供当前已实现 API，When 用户访问新版控制台全部页面或任一 API 失败，Then 页面只显示服务端事实、规范允许的派生值或明确状态，不显示模拟 Knowledge Health、ETA、Graph、Action Item、Activity、Workspace 或用户身份数据。 |

## 13. 实施阶段

### UI Refresh Stage 1：现有 API 上的产品视觉收敛

- 使用 `web/prototype/` 的布局和视觉层级重构现有 Console，但保留 `web/app.js` 的真实 API、鉴权和状态语义。
- 优先交付操作中心、运行、知识、治理、证据、智能体、发现和设置；缺失服务端能力不以演示数据替代。
- 用契约测试验证自然中文、双主题、同源资源、键盘可达、状态真实性和移动端关键路径。
- 本阶段不得修改 Domain、Application App、HTTP API 或 JSON Schema；若视觉需求触发这些变化，必须先形成独立 Spec 对齐。

### Phase 1：架构与事实源收敛

- 将 domain-knowledge 迁入独立 infrastructure 目录并接入 WorkflowEngine 端口。
- 固化 FlywheelRun、GraphState、GenerationKey、graph checkpoint 和双 Gate 的所有权。
- 建立 Agent 定义、提示词覆盖和节点执行投影的 Registry Schema。

### Phase 2：ohMyWorkPanel 自动垂直切片

- 以固定 commit 的 ohMyWorkPanel 场景启动真实 LangGraph。
- 打通候选知识、首轮失败、Review、增量修订、fresh Code generation、真实 ProjectEvaluator 和 Knowledge Registry 发布事务。
- 用 GenerationKey 防止 graph checkpoint 边界重放外部副作用。

### Phase 3：Agent Studio 与节点可观察性

- 新增 Agents 页面、固定 Agent 定义查询和受限 promptAddon 编辑。
- 在 Run 工作台展示 LangGraph 节点执行投影。
- 增加高层 Start/Resume/Cancel API，不向产品 UI 暴露裸状态转换。

### Phase 4：配套材料与生产强化

- 同步 GitHub Pages、快速入门、架构、运维、测试和仓库目录文档。
- 为真实 Agent Provider 增加重复运行统计和健康状态；Scenario 只留在验收 profile。
- 在安全隔离能力完成后开放对应语言项目执行。
- 增加崩溃注入、审计导出、权限细分、可访问性和大规模数据性能验证。

不得在 Phase 2 用前端连续调用 `transition/evaluate/publish` 模拟自动 Orchestrator。自动化必须存在于服务端 Workflow Service，页面只负责命令和观察。

## 14. 当前实现差距

| 能力 | 当前状态 |
|---|---|
| 全局 Shell、响应式导航和 Overview | Implemented：桌面侧栏、移动底栏、运行指标和能力边界已接入真实 API |
| GitHub Pages 项目官网 | Implemented：纯静态、双主题、响应式，提供使用者命令和 Agent 配置 Prompt；不连接 Registry；站点源码只在 `site/`，分支/Jekyll 模式由根入口嵌入，切到 GitHub Actions Source 后由工作流直接发布该目录 |
| 双主题知识目录、状态筛选、知识详情 | Implemented MVP：官网和 Console 支持深色/浅色切换；目录筛选、搜索、详情 Drawer、provenance 和正文使用同一套语义状态色 |
| Quality / Behavioral Gate 区分 | Implemented MVP：分区展示并解释 `ACCEPTED` 不等于 `VERIFIED`；版本 Diff 仍待实现 |
| Feedback UI | Implemented：使用仅驻留页面内存的 bearer token，明确反馈不改变发布状态 |
| Run 列表与工作台 | Implemented MVP：新增 Run 列表、snapshot、顺序事件、checkpoint、评测和 Gate API/UI |
| 自动 Run 启动 | Implemented fixed profile：CLI/API/Console 可启动固定 ohMyWorkPanel LangGraph 流程；任意项目的通用来源/策略向导仍在规划 |
| Agent 目录与定制 | Implemented：七个固定角色可查，只有 `promptAddon` 可在治理模式修改并形成 revision/audit |
| LangGraph 节点投影 | Implemented：Run 工作台从 Knowledge Registry 显示节点、Agent、轮次、attempt 与状态，不读取 graph checkpoint |
| 实时事件 | Partial：已提供 `after=event_seq` 增量查询，SSE 和自动重连尚未实现 |
| Correction / Diff | Partial：固定场景有 Correction 和范围校验，尚无通用查询/UI |
| Governance | Partial：已从终态 Run 形成只读队列，治理决议 Command API 尚未实现 |
| Evidence | Implemented MVP：聚合 EvaluationReport、GateDecision、工具链、测试和证据引用摘要 |
| 真实在线 Agent | Implemented（受限样例）：官方 DSH SDK 已跑通固定 ohMyWorkPanel；通用项目向导和稳定性统计仍待实现 |
| 敌对代码安全执行 | Planned；安全能力完成前必须 fail closed |
| UI Refresh Stage 1 | Spec accepted：视觉原型只作样式参考；实现必须复用现有 API，缺失能力不得以演示数据补齐 |
