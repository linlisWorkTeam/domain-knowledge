# 开发状态

**当前阶段：DEV-005 HCP-1 = Rework required，F2 视觉返工中｜更新时间：2026-09-03｜当前任务：DEV-005 F2 视觉对齐**

本文件是 domain-knowledge 的**唯一开发进度入口**，用于记录当前阶段、已完成里程碑、正在进行或下一项工作、后续队列和最近验证结果。产品行为仍以 [`../specs/`](../specs/README.md) 为规范性事实源；需求级的 `Implemented / Partial / Planned` 状态仍只在[追踪矩阵](../specs/13-verification/traceability-matrix.md)维护。

<details lang="en">
<summary>English summary</summary>

This file is the single entry point for project-level development status, current work and ordering. The Spec remains authoritative for behavior, while the traceability matrix exclusively owns requirement-level implementation status. Any PR that changes progress must update this file in the same change.

</details>

## 记录边界

| 记录内容 | 唯一维护位置 |
| --- | --- |
| 当前阶段、工作项顺序、下一任务、阻塞项、最近验证 | 本文件 |
| 单项需求的状态、实现路径和测试路径 | [`specs/13-verification/traceability-matrix.md`](../specs/13-verification/traceability-matrix.md) |
| 可验收行为和完成条件 | [`specs/13-verification/acceptance-plan.md`](../specs/13-verification/acceptance-plan.md) |
| 架构决策及取代关系 | [`specs/adr/`](../specs/adr/README.md) |
| 单次变更的提交、审查和 CI 证据 | Git commit 与 Pull Request |
| 阶段性测评结论和汇报口径 | [`docs/report/`](report/) |

本文件不复制全部需求行，也不以任务状态覆盖追踪矩阵。两者不一致时，需求级判断以追踪矩阵为准，并在同一 PR 修正本文件的项目级摘要。

## 更新规则

出现以下任一变化时，必须在同一 PR 回写本文件：

1. 工作项开始、完成、阻塞、取消或调整优先级；
2. 追踪矩阵中任一需求的 `Implemented / Partial / Planned` 状态发生变化；
3. 阶段测评结论、验证基线或已知边界发生变化；
4. 下一项开发任务或其完成标准发生变化；
5. 前台、API、Agent 拓扑或部署范围的协作边界发生变化。

回写时必须更新顶部日期、工作项状态和实际验证证据。没有代码、测试或运行证据的能力不得标记为完成。纯重构只有在改变里程碑或任务顺序时才需要更新本文件。

## 当前结论

- P0-A Spec 已 Accepted，P0-B 处于实现验证阶段。
- DDD 分层已经对齐，UI/API 通过 Application App 进入系统，LangGraph、Provider 和持久化实现留在 Infrastructure。
- 固定七 Agent 拓扑、并行、迭代、取消、Checkpoint、运行契约和配置快照已经通过自动化验证。
- deterministic fixture 可以完成失败、修订、重新生成、评测和发布闭环。
- 前台 F2 已完成最终七页面、真实 Run Agent Graph、绿色双主题、响应式、可访问性及真实/Partial/Disabled 状态；已修正 103px Header 基线、14px 密度和重复 Page Intro，加入 `1363 × 936` 像素回归，HCP-1 仍为 `Rework required` 等待人工复验。
- B1 Preview API 破坏性迁移已经同步完成 Server、Console、DSH Adapter、测试和文档；旧公共 HTTP 路径不保留兼容别名，B2–B4 的 `Planned` 能力仍未实现。
- DeepSeek Harness live Adapter 已存在；公司 CodeAgent CLI 尚未接入。
- 真实 Agent 质量、公司环境容量、长期稳定性和敌对代码执行安全尚未形成验收结论。

需求级统计以追踪矩阵当前内容为准：`Implemented 43 / Partial 15 / Planned 13`。

## 里程碑与工作项

| ID | 工作项 | 状态 | 结果或证据 |
| --- | --- | --- | --- |
| DEV-001 | P0-A Spec、验收计划和追踪矩阵基线 | Done | `npm run validate:specs` |
| DEV-002 | DDD Application/Domain/Infrastructure 边界对齐 | Done | `tests/contract/architecture.test.ts` |
| DEV-003 | 固定七 Agent LangGraph 编排、Checkpoint 与确定性闭环 | Done | `tests/integration/langgraph-infrastructure.test.ts`、`tests/acceptance/automated-langgraph-flow.test.ts` |
| DEV-004 | AgentCommand/AgentResult、Run 配置冻结与框架机械能力测评 | Done | [框架阶段性测评](report/框架阶段性测评.md)，结果 `6/6 ACCEPTED` |
| DEV-UI-001 | 前台 F1 Knowledge Console | Done | `tests/contract/site.test.ts`、`tests/e2e/console.spec.ts`；只复用现有 API |
| DEV-005 | Console 第一轮：F2 最终七页面 + B1 API 基线 + HCP-1 | In Progress | B1 已就绪；HCP-1=`Rework required`，F2 正在按指定参考站返工，通过前不得开始 B2/B3 前台接线 |
| DEV-006 | Console B2 Action Center 与 Runs 完整控制面 | Planned | Action Item、progress/retry/SSE、组件健康、Activity 与 Graph 实时更新；依赖 DEV-005 |
| DEV-007 | Console B3 Knowledge、Evaluations 与 Sources | Planned | Knowledge 可由独立 Agent 并行；血缘/Diff、Evaluation 读模型与规则、Source Registry、Knowledge Health；依赖 DEV-005 |
| DEV-008 | Console B4 运营面加固 | Planned | Provider status、指标口径、SSE 容量和大数据查询验收；依赖 DEV-006/007 |
| DEV-009 | 公司 CodeAgent CLI Adapter 与契约验证 | Planned | 原 DEV-005；Console 优先队列完成后恢复排序 |
| DEV-010 | 公司 CodeAgent 七角色真实闭环与效果基线 | Planned | 原 DEV-006；依赖 DEV-009 |
| DEV-011 | TestGen 候选测试的通用 Oracle 验证与门禁链路 | Planned | 原 DEV-007；对应 `KF-SYS-004` |
| DEV-012 | 四点崩溃注入、完整权限拒绝审计与恢复加固 | Planned | 原 DEV-008；对应 `AC-REC-001`、`AC-SEC-002` |
| DEV-013 | 生产容量、认证续期、并发与 Redis 启用决策 | Planned | 原 DEV-009；依赖真实运行数据，不改变 Registry 事实源地位 |

状态含义：`Ready / Next` 表示下一项已排序但尚未开始；`In Progress` 表示已有活动开发分支；`Blocked` 必须写明外部依赖；`Done` 必须给出可复验结果。

## 当前开发任务：DEV-005

目标是在同一轮并行完成 F2 最终七页面视觉结构与 B1 Preview API 基线，并以 HCP-1 冻结页面信息架构、Graph 语义和 API 边界，再进入 B2/B3。

范围：

- 前台完成 Action Center、Flywheel Runs、Knowledge、Graph、Evaluations、Sources、Agent Settings 七页最终布局和全部真实/Partial/Disabled 状态；
- Graph 使用现有 Run、WorkflowNodeProjection、workflow status 和事件实现真实轮询版，不增加 Graph API；
- API 完成 11 个旧接口的资源化迁移，并同步 Server、Console、DSH Adapter、测试和文档；
- 落地统一分页、错误、认证、幂等和 revision 契约，不保留 Preview 旧路由别名；
- 提供公网验收环境、桌面/移动端与双主题证据、逐区域数据来源表和禁用能力清单；
- 执行 HCP-1，结论必须为 `Accepted` 或 `Accepted with follow-ups` 才能开始 B2/B3 前台接线。

完成标准：

1. 七个最终页面均可导航，目标视觉、响应式、无障碍和错误/空/部分状态通过自动化检查；
2. Graph 正确表达选定 Run 的固定 Agent 执行图，节点详情来自 Registry 投影且不能编辑拓扑或推进状态；
3. 新 API 路径通过 Server、Console 与 DSH Adapter 契约测试，旧公共 HTTP 路径返回 404；
4. 页面不展示模拟 Health、ETA、Activity、Action Item、Workspace 或用户身份；
5. `npm run typecheck`、`npm run validate:specs`、`npm test`、`npm run site:check` 和 `npm run test:ui` 全部通过；
6. HCP-1 证据与人工结论记录在对应 PR，开发状态在同一变更回写。

## 后续开发任务：DEV-009 CompanyCodeAgentCliAdapter

目标是在不改变 Domain/Application、七个 Agent 拓扑、内部 AgentCommand/AgentResult 和现有 HTTP API 的前提下，实现 `CompanyCodeAgentCliAdapter`，作为现有 `AgentProvider` Port 的 Infrastructure 实现。

范围：

- 启动前执行 `codeagent auth status --json`，区分未登录和凭据过期；
- 不经 shell 启动非交互 CLI，Prompt 通过 stdin 传输；
- 解析 JSON/JSONL 最终结果并保留可恢复的 session ID；
- 实现超时、AbortSignal、进程组终止和错误分类；
- 按角色限制工具和工作目录，保留固定 commit 源码视图与 Code 角色隔离；
- 审计记录只保存摘要、耗时、状态和关联 ID，不保存凭据与 Prompt 正文；
- 将非秘密 Provider 参数纳入 Run 配置摘要，恢复不兼容时 fail closed。

完成标准：

1. 七个角色均通过同一个 `AgentProvider` 契约测试；
2. 合法输出进入 AgentResult，非法 JSON、Schema 错误和角色错配在下游前失败；
3. 认证失败、超时、取消、无效 session、权限拒绝和模型不可用均有稳定测试；
4. fixture 与现有 DeepSeek Harness 路径保持兼容；
5. `npm run typecheck`、`npm run validate:specs`、`npm test` 和 `npm run evaluate:framework` 全部通过；
6. 追踪矩阵和本文件在同一 PR 回写实际结果。

DEV-009 不修改 `web/`、`site/`、前台产品设计、现有 HTTP 路由或响应。如果发现必须新增 API，只记录需求并输出交给前台/API 负责人的 Prompt，不在后台任务中实现。

## 最近验证基线

| 日期 | 基线 | 结果 |
| --- | --- | --- |
| 2026-09-03 | Agent 运行契约与框架测评合入后的 `main` | TypeScript 通过；Spec：7 schemas、7 commands、8 results、38 P0；测试 112/112；框架测评 6/6 `ACCEPTED` |
| 2026-09-03 | 前台 F1 Knowledge Console 合入前基线 | TypeScript 通过；Spec：7 schemas、7 commands、8 results、51 P0；测试 114/114；框架测评 6/6 `ACCEPTED`；Chromium E2E 4/4 |
| 2026-09-03 | DEV-005 F2 + B1 HCP-1 第二轮返工候选 | TypeScript 通过；Spec：7 schemas、7 commands、8 results、51 P0；测试 115/115；Chromium E2E 7/7，含七页亮色语义面审计及 Action Center `1363 × 936` 像素基线；HCP-1 仍为 `Rework required`，等待复验 |

该结果只证明框架机械能力，不代表公司 CodeAgent 效果或生产可用性。
