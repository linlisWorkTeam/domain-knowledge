# Preview HTTP API 规范

**状态：Accepted｜版本：0.1.0｜日期：2026-09-03**

本文是 Knowledge Console HTTP API 的唯一规范性入口，统一定义资源分组、页面能力、当前实现映射和待补接口。领域行为、状态机与发布门禁仍以对应领域和工作流规范为准；HTTP 路由不得创造第二套业务语义。

## 1. Preview 生命周期与通用约束

- 首个 Release 发布前均属于 Preview，可以进行破坏性路由调整，不提供旧路径兼容别名。
- 路由调整必须在同一变更中同步 Server、Console、DSH Adapter、测试和接口文档，避免新旧契约并存。
- Release 之后才引入弃用窗口、版本兼容和迁移策略。
- `/health` 只用于进程存活探针；产品级系统状态统一位于 `/api/v1/system/*`。
- 资源读取使用名词路由。简单知识检索使用 `GET /api/v1/knowledge?q=...`；只有未来出现复杂查询体时才增加 `POST /api/v1/knowledge/search`。
- 列表接口必须提供稳定排序、`limit`、`cursor` 和 `nextCursor`；过滤条件必须在接口表中明确。
- 所有写接口使用 Bearer token。未配置写能力返回 `503`，凭据缺失或无效返回 `401`，权限不足返回 `403`。
- 所有 Command 必须接受 `Idempotency-Key`，返回关联资源 ID 和审计事件 ID；危险动作还必须记录 actor 与 reason。
- 前台不得把静态原型或浏览器派生值表达成服务端事实。接口状态只使用：`Available`、`Available / Rename`、`Available / Redefine`、`Available / Extend`、`Partial`、`Planned`。

## 2. 系统与能力

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /health` | Available | 进程存活探针；不返回业务健康分。 |
| `GET /api/v1/system/status` | Available / Rename | 由 `/api/v1/status` 迁移；返回 Registry、CAS、Provider、Evaluator 的真实状态与采样时间。 |
| `GET /api/v1/system/capabilities` | Available / Rename | 由 `/api/v1/capabilities` 迁移；返回读写开关、认证方式、Provider 类型和隔离能力。 |
| `GET /api/v1/system/components` | Planned | 返回分组件健康、reason code、最后成功时间和受控诊断摘要。 |

## 3. Runs、Action Center 与 Activity

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /api/v1/runs` | Available / Extend | Run 列表；补充 `status`、`moduleId`、`updatedAfter`、分页和稳定排序。 |
| `POST /api/v1/runs` | Available / Redefine | 创建并启动固定 profile Run；替代只创建记录的旧语义，返回 `runId`、`eventId`。 |
| `GET /api/v1/runs/:runId` | Available | Run、版本、评测、Decision、checkpoint、节点、事件和 publication 快照。 |
| `GET /api/v1/runs/:runId/events?after=<seq>` | Available | 按 `event_seq` 增量读取运行事件。 |
| `GET /api/v1/runs/:runId/workflow-nodes` | Available | 返回角色、轮次、尝试、执行状态和时间，不暴露 checkpoint 私有数据。 |
| `GET /api/v1/runs/:runId/workflow-status` | Available | 工作流执行状态，不替代 FlywheelRun 业务状态。 |
| `GET /api/v1/runs/:runId/report` | Available / Rename | 由 `demo-report` 迁移；下载脱敏审计报告。 |
| `POST /api/v1/runs/:runId/resume` | Available / Rename | 从同一 checkpoint 恢复。 |
| `POST /api/v1/runs/:runId/cancel` | Available / Rename | 取消运行并传播终止信号。 |
| `GET /api/v1/runs/:runId/progress` | Planned | 返回可证明的 completed/total 单元、当前阶段和采样时间；无可靠模型时不得提供 ETA。 |
| `POST /api/v1/runs/:runId/retry` | Planned | 按治理决议创建新 Run 或执行规范允许的失败节点重试。 |
| `GET /api/v1/runs/:runId/event-stream` | Planned | SSE 推送，支持 `Last-Event-ID`/`event_seq` 续传和自动重连。 |
| `GET /api/v1/action-items` | Planned | 持久化治理事项列表；支持 severity、type、status、runId、分页。 |
| `GET /api/v1/action-items/:actionItemId` | Planned | 返回原因、证据、允许动作、actor 权限和审计历史。 |
| `POST /api/v1/action-items/:actionItemId/actions/:action` | Planned | 执行白名单治理动作，如 acknowledge、resolve、retry；不得直接篡改 Gate 或 publication。 |
| `POST /api/v1/action-items/:actionItemId/regenerate` | Planned | 以修订输入创建新 Run，保留来源 Action Item、原 Run 和 reason。 |
| `GET /api/v1/activity` | Planned | 跨 Run 审计活动列表，支持 type、runId、actor、时间和分页过滤。 |
| `GET /api/v1/activity/stream` | Planned | 跨 Run SSE 活动流，支持断线续传。 |
| `GET /api/v1/knowledge/health` | Planned | 返回有明确口径和样本范围的 freshness、coverage、quality 聚合，不得输出模型臆测分数。 |

第一阶段 Action Center 只能从 `FAILED`、`LOW_CONFIDENCE` 和最新 GateDecision=`STOPPED` 派生 Run 级只读事项，并明确标记为 `Partial`；独立生命周期、处理状态、Regenerate 和跨 Run Activity 必须等待上述接口。

## 4. Knowledge

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /api/v1/knowledge` | Available / Extend | 知识目录与简单检索；统一支持 `q`、`status`、`category`、`limit`、`cursor`，取代 `/api/v1/query`。 |
| `GET /api/v1/knowledge/:versionId` | Available | 正文、状态、quality 和 provenance 详情。 |
| `POST /api/v1/knowledge/candidates` | Available / Rename | 由 `/api/v1/ingest` 迁移；只创建候选，不表示发布。 |
| `POST /api/v1/knowledge/:versionId/feedback` | Available / Rename | 由 `/api/v1/feedback` 迁移；记录 `hit`、`rate` 或 `correct`，不得直接改变发布状态。 |
| `GET /api/v1/knowledge/:versionId/lineage` | Planned | 返回父子版本、关联 Run、Correction、Evaluation 和 publication。 |
| `GET /api/v1/knowledge/:versionId/diff?against=<versionId>` | Planned | 返回结构化 Markdown Diff 和范围校验。 |
| `GET /api/v1/knowledge/:versionId/relations` | Planned | 返回图谱所需的 typed edges 与相邻节点。 |

第一阶段 Knowledge 是真实列表、检索与详情组成的 Preview；Add curated knowledge 暂不进入前台范围。

## 5. Evaluations

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| Run snapshot 的 `evaluations` 与 `latestDecision` | Available | 单 Run 评测和 Gate 的当前事实源。 |
| `GET /api/v1/evaluations` | Planned | 跨 Run 评测列表；支持 runId、moduleId、gate、status、时间与分页。 |
| `GET /api/v1/evaluations/:evaluationId` | Planned | 报告、策略版本、工具链摘要、reason codes 和 ArtifactRef。 |
| `GET /api/v1/evaluations/:evaluationId/artifacts` | Planned | 按权限返回评测证据元数据和受控下载链接。 |
| `GET /api/v1/evaluation-rules` | Planned | 只读返回规则、版本、适用范围和启用状态。 |
| `PATCH /api/v1/evaluation-rules/:ruleId` | Planned | 管理员更新允许变更的规则配置，保留版本和审计记录。 |

第一阶段 Evaluations 只能聚合现有 Run snapshot，并持续显示 `Partial`；全局筛选、规则管理和完整证据浏览不可宣称可用。

## 6. Sources

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /api/v1/sources/scan` | Available / Rename | 由 `/api/v1/scan` 迁移；返回本次发现的来源候选，不等同于 Registry。 |
| `GET /api/v1/sources` | Planned | 持久化来源列表；支持 type、status、project、分页和最后同步时间。 |
| `POST /api/v1/sources` | Planned | 创建来源配置，校验路径/URL、访问边界和凭据引用。 |
| `GET /api/v1/sources/:sourceId` | Planned | 返回来源配置、同步状态、最近错误和关联知识统计。 |
| `PATCH /api/v1/sources/:sourceId` | Planned | 修改白名单字段并记录审计；不得回传秘密正文。 |
| `POST /api/v1/sources/:sourceId/refresh` | Planned | 发起幂等扫描/同步任务并返回关联 runId 或 jobId。 |

第一阶段 Sources 仅提供真实只读扫描候选；持久化管理、启停、刷新和来源统计均以禁用状态展示。

## 7. Graph

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /api/v1/graph` | Planned | 支持 root、depth、relationType 和 limit，返回节点、typed edges、截断信息与生成时间。 |
| `GET /api/v1/graph/nodes/:nodeId` | Planned | 返回节点详情、来源版本、状态和可导航资源链接。 |

第一阶段 Graph 只能使用固定静态预览，页面必须常驻“静态预览、非实时数据”标识，不得提供会被误解为成功写入的编辑动作。

## 8. Agent Settings

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /api/v1/agents` | Available | 返回固定 Agent 定义、职责、只读契约和当前 `promptAddon`。 |
| `PUT /api/v1/agents/:agentId/prompt` | Available | 仅更新 `promptAddon`；拒绝职责、Schema、权限、节点边和 Provider 类名。 |
| `GET /api/v1/agents/providers/status` | Planned | 返回 Provider 认证/可用状态、模型标识和受控错误摘要，不返回凭据。 |

第一阶段 Agent Settings 可以真实展示 Agent；若产品暂不开放写入，则隐藏或禁用提示词编辑。拓扑、工具权限、Schema 与 Provider 切换不提供假保存。

## 9. Preview 破坏性迁移清单

以下旧 HTTP 路径必须在实现迁移时直接删除，不保留别名：

- `/api/v1/status`、`/api/v1/capabilities`；
- `/api/v1/query`、`/api/v1/scan`、`/api/v1/ingest`、`/api/v1/feedback`；
- `/api/v1/run-commands/start`、`/api/v1/run-commands/resume`、`/api/v1/run-commands/cancel`；
- `/api/v1/transition`、`/api/v1/evaluate`、`/api/v1/publish`。

其中 transition、evaluate、publish 继续作为内部 Application App/工作流能力存在，但不再作为公共 HTTP API。迁移提交完成前，本文中的 `Available / Rename` 和 `Available / Redefine` 均不等于新路径已经可调用。

## 10. 页面交付矩阵

| 页面 | 第一阶段可真实使用 | 可预览但不完整 | 仍需后台 API |
|---|---|---|---|
| Action Center | Run 指标、最近 Run、运行级异常投影 | 健康分项可展示已有事实 | Action Item 生命周期、Regenerate、Activity、Knowledge Health |
| Flywheel Runs | 列表、启动固定 profile、详情、节点、事件、取消、恢复、报告 | 进度仅展示可证明阶段 | 百分比进度、retry、SSE、通用启动参数 |
| Knowledge | 列表、简单查询、详情、反馈 | 血缘和 Diff 入口禁用 | lineage、diff、relations；不含 Add curated knowledge |
| Graph | 无动态数据 | 固定静态预览 | graph、node detail |
| Evaluations | 从 Run snapshot 查看与聚合 | 全局列表标记 Partial | 独立列表/详情/证据/规则 API |
| Sources | 扫描候选只读查看 | Registry 控件禁用 | 来源 CRUD、刷新和统计 |
| Agent Settings | Agent 定义和 promptAddon 事实 | Provider 健康标记未接入 | Provider status；其余固定契约不得开放编辑 |
