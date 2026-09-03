# Preview HTTP API 规范

**状态：Accepted；B1 已实现、DEV-006 契约已细化｜版本：0.3.0｜日期：2026-09-03**

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

### 1.1 通用响应契约

列表响应统一为 `{ items, nextCursor, sampledAt }`。`nextCursor=null` 表示结束；cursor 是不透明值，客户端不得解析。默认 `limit=50`，最大 `limit=200`。同一 cursor 链必须使用同一过滤条件和排序，资源变更时允许弱一致但不得重复返回同一 ID。

错误响应统一为：

```json
{
  "error": {
    "code": "STABLE_DOMAIN_CODE",
    "message": "面向用户的受控说明",
    "requestId": "req_...",
    "retryable": false,
    "details": {}
  }
}
```

`details` 不得包含凭据、Prompt、源码正文、任意文件路径或未脱敏输出。并发版本冲突返回 `409`，无效输入返回 `422`，限流返回 `429`。SSE 的 `id` 必须等于可持久化续传位置，事件 payload 使用同一版本化事件信封。

### 1.2 Command 与版本控制

- `POST` Command 使用 `Idempotency-Key`；同一 key 与同一规范化请求返回同一结果，不同请求返回 `409 IDEMPOTENCY_CONFLICT`。
- `PATCH` 和规则类修改必须提交当前 revision；过期 revision 返回 `409 REVISION_CONFLICT`。
- 成功写响应至少包含 `{ resourceId, eventId, revision, acceptedAt }`；异步任务另外返回 `runId` 或 `jobId`。
- 时间使用 UTC RFC 3339，ID 在资源生命周期内稳定；所有枚举只允许追加或通过 API 大版本调整。

## 2. 系统与能力

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /health` | Available | 进程存活探针；不返回业务健康分。 |
| `GET /api/v1/system/status` | Available | 返回 Registry、CAS、Provider、Evaluator 的真实状态与采样时间；已由旧 `/api/v1/status` 迁移。 |
| `GET /api/v1/system/capabilities` | Available | 返回读写开关、认证方式、Provider 类型和隔离能力；已由旧 `/api/v1/capabilities` 迁移。 |
| `GET /api/v1/system/components` | Planned | 返回分组件健康、reason code、最后成功时间和受控诊断摘要。 |

## 3. 飞轮批次、操作中心与活动流

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /api/v1/runs` | Available / Extend | Run 列表；补充 `status`、`moduleId`、`updatedAfter`、分页和稳定排序。 |
| `POST /api/v1/runs` | Available | 创建并启动固定 profile Run；返回 `runId`、`eventId`。 |
| `GET /api/v1/runs/:runId` | Available | Run、版本、评测、Decision、checkpoint、节点、事件和 publication 快照。 |
| `GET /api/v1/runs/:runId/events?after=<seq>` | Available | 按 `event_seq` 增量读取运行事件。 |
| `GET /api/v1/runs/:runId/workflow-nodes` | Available | 返回角色、轮次、尝试、执行状态和时间，不暴露 checkpoint 私有数据。 |
| `GET /api/v1/runs/:runId/workflow-status` | Available | 工作流执行状态，不替代 FlywheelRun 业务状态。 |
| `GET /api/v1/runs/:runId/report` | Available | 下载脱敏审计报告；已由旧 `demo-report` 路径迁移。 |
| `POST /api/v1/runs/:runId/resume` | Available | 从同一 checkpoint 恢复。 |
| `POST /api/v1/runs/:runId/cancel` | Available | 取消运行并传播终止信号。 |
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

第一阶段操作中心只能从 `FAILED`、`LOW_CONFIDENCE` 和最新 GateDecision=`STOPPED` 派生批次级只读事项，并明确标记为 `Partial`；独立生命周期、处理状态、重新生成和跨批次活动流必须等待上述接口。

### 3.1 DEV-006 最小交付边界

DEV-006 只补齐操作中心、飞轮批次和工作流图所需控制面，不提前实现 B3 的来源漂移、Evaluation Rule、Knowledge lineage/diff 或 Knowledge Health，也不实现 B4 的项目空间和 Provider 配置。交付拆为三个可独立验收的切片：

1. `DEV-006A`：组件健康、持久化待处理事项、批次进度和跨批次活动流的只读 API；前台从临时派生数据切换到服务端事实。
2. `DEV-006B`：acknowledge、resolve、retry、regenerate 命令及完整权限、幂等和审计；读模型稳定前不得先开放写按钮。
3. `DEV-006C`：批次与活动 SSE、断线续传、前台实时更新和轮询降级；SSE 故障不得使已持久化事实消失。

### 3.2 待处理事项领域契约

待处理事项是持久化治理实体，不等同于 FlywheelRun、GateDecision 或普通事件。DEV-006 允许以下来源类型：

| `type` | 确定性触发事实 | 默认严重级别 |
|---|---|---|
| `RUN_FAILED` | 批次进入 `FAILED` | `HIGH` |
| `LOW_CONFIDENCE` | 批次进入 `LOW_CONFIDENCE` | `MEDIUM` |
| `GATE_STOPPED` | 最新 GateDecision 为 `STOPPED` | `HIGH` |
| `COMPONENT_UNAVAILABLE` | 必需组件状态为 `UNAVAILABLE` 且影响活动批次 | `HIGH` |

来源漂移、知识冲突和规则质量问题属于 B3，不能在 DEV-006 中以自由文本假装为已实现类型。实体最小结构如下：

```json
{
  "actionItemId": "ai_...",
  "type": "RUN_FAILED",
  "severity": "HIGH",
  "status": "OPEN",
  "subject": { "kind": "RUN", "id": "run_..." },
  "runId": "run_...",
  "reasonCode": "AGENT_OUTPUT_INVALID",
  "summary": "受控、可本地化的说明",
  "sourceEventId": "evt_...",
  "fingerprint": "sha256:...",
  "allowedActions": ["ACKNOWLEDGE", "RETRY"],
  "revision": 1,
  "createdAt": "2026-09-03T00:00:00Z",
  "updatedAt": "2026-09-03T00:00:00Z",
  "resolvedAt": null,
  "resolution": null
}
```

- `fingerprint = SHA-256(type + subject.kind + subject.id + reasonCode)`；同一 fingerprint 同时最多存在一个非 `RESOLVED` 事项。事件重放只增加已观察来源，不创建重复事项。
- 已解决事项再次发生同类新事实时创建新 `actionItemId`，并用 `previousOccurrenceId` 关联上一次事项，不覆盖历史。
- 状态仅允许 `OPEN → ACKNOWLEDGED → RESOLVED` 或 `OPEN → RESOLVED`。acknowledge 表示已接手，不表示风险消失；resolve 必须提交非空 reason。
- `allowedActions` 由服务端根据事项类型、批次状态、能力和权限计算；前台不得自行推导或展示未返回的动作。
- 任何动作只追加治理历史和必要命令，不得修改历史 GateDecision、EvaluationReport、KnowledgeVersion 或 publication receipt。

列表接口支持 `status`、`severity`、`type`、`runId`、`limit` 和 `cursor`，默认按 `updatedAt DESC, actionItemId DESC`。详情额外返回 `history[]`、受控证据引用和关联命令，不返回 Prompt、模型正文或任意文件路径。

命令请求统一为：

```json
{
  "expectedRevision": 1,
  "reason": "人工判断依据",
  "feedback": "仅 regenerate 可选；将进入新批次的冻结输入"
}
```

`ACKNOWLEDGE` 和 `RESOLVE` 只改变事项状态；`RETRY` 仅适用于具有可恢复失败 checkpoint 的原批次，并复用既有 resume 语义；`REGENERATE` 创建新的批次和新的 RunConfigurationSnapshot，返回 `runId`，并通过 `causedByActionItemId`、`parentRunId` 保留因果链。retry/regenerate 接受成功不自动解决事项，只有目标批次达到与原因相符的成功条件后才可由确定性规则或管理员 resolve。

### 3.3 可证明进度

```json
{
  "runId": "run_...",
  "mode": "DETERMINATE",
  "completedUnits": 4,
  "totalUnits": 7,
  "ratio": 0.5714,
  "currentStage": "EVALUATE",
  "iteration": 1,
  "retrying": false,
  "sampledAt": "2026-09-03T00:00:00Z"
}
```

- 工作单元来自冻结的 RunConfigurationSnapshot 与固定 Agent DAG；节点只有持久化为 `COMPLETED` 才计入 completed。
- 同一节点的 attempt/retry 不增加 total；确定性迭代新增一轮时，服务端先原子扩展 total，再发布进度事件，ratio 不得超过 `1`。
- 无法在查询时证明完整工作单元时返回 `mode=INDETERMINATE`，`completedUnits`、`totalUnits`、`ratio` 均为 `null`，仍可返回 currentStage 和 iteration。
- DEV-006 不返回 ETA；前台显示阶段和可证明比例，不能根据本地计时猜测剩余时间。

### 3.4 SSE 与恢复

- 批次流 `GET /api/v1/runs/:runId/event-stream` 的每条 `id` 等于该批次已持久化 `event_seq`；客户端必须先读取 snapshot，再以 snapshot 的最后序号连接。
- 服务端同时接受 `Last-Event-ID` 或 `after`，两者同时存在且不一致返回 `400 INVALID_EVENT_CURSOR`。重连从游标之后发送，不能跳过已提交事件。
- 活动流 `GET /api/v1/activity/stream` 使用全局、单调递增且不透明的 activity cursor，不能复用单批次 `event_seq`。
- 连接建立后先发送 `ready` 事件；空闲每 15 秒发送注释 heartbeat。单连接最长 30 分钟，正常关闭前发送 `reconnect` 提示。
- 游标早于保留窗口返回 `409 CURSOR_EXPIRED` 并附 `snapshotRequired=true`；客户端重新读取对应列表/snapshot 后再连接。
- 允许网络层重复投递，客户端必须按 cursor 去重；持久化事件顺序必须不重不漏。SSE 不可用时前台退回现有增量轮询并明确显示连接状态。

### 3.5 跨批次活动流

活动是现有不可变领域/审计事件的脱敏读模型，不建立第二套可写事实源。条目最小字段为 `activityId`、`cursor`、`type`、`occurredAt`、`runId?`、`subject`、`summary`、`severity`、`eventId` 和 `links`。列表支持 `type`、`runId`、`severity`、`occurredAfter`、`limit`、`cursor`，按全局 cursor 倒序；SSE 按正序续传。重复构建读模型必须得到同一 activityId。

### 3.6 组件健康

`GET /api/v1/system/components` 返回固定组件 `registry`、`artifactStore`、`workflow`、`provider`、`evaluator`：

```json
{
  "items": [{
    "component": "provider",
    "status": "DEGRADED",
    "reasonCode": "AUTH_EXPIRING",
    "message": "受控说明",
    "checkedAt": "2026-09-03T00:00:00Z",
    "lastSucceededAt": "2026-09-02T23:59:00Z"
  }],
  "overall": "DEGRADED",
  "sampledAt": "2026-09-03T00:00:00Z"
}
```

状态只允许 `AVAILABLE`、`DEGRADED`、`UNAVAILABLE`、`UNKNOWN`；overall 取最差必需组件状态，但 `UNKNOWN` 不得显示为健康。检查必须有严格超时且不得触发模型生成、运行评测或其他有副作用操作。响应不得包含 API Key、token、Session、Prompt、文件路径或上游原始错误正文。

### 3.7 权限、并发与错误

列表、详情、进度、组件健康和 SSE 在本地 Preview 中可只读访问，但仍受部署访问边界约束；所有事项动作和 retry/regenerate 必须使用管理员 Bearer token。命令同时要求 `Idempotency-Key` 与 `expectedRevision`：重复同请求返回原结果，不同 payload 返回 `409 IDEMPOTENCY_CONFLICT`，过期 revision 返回 `409 REVISION_CONFLICT`。至少定义以下稳定错误码：`ACTION_NOT_ALLOWED`、`ACTION_ITEM_RESOLVED`、`RUN_NOT_RETRYABLE`、`CURSOR_EXPIRED`、`INVALID_EVENT_CURSOR`、`COMPONENT_CHECK_TIMEOUT`。

## 4. Knowledge

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /api/v1/knowledge` | Available | 知识目录与简单检索；统一支持 `q`、`status`、`category`、`limit`、`cursor`，已取代 `/api/v1/query`。 |
| `GET /api/v1/knowledge/:versionId` | Available | 正文、状态、quality 和 provenance 详情。 |
| `POST /api/v1/knowledge/candidates` | Available | 创建候选但不表示发布；已由旧 `/api/v1/ingest` 迁移。 |
| `POST /api/v1/knowledge/:versionId/feedback` | Available | 记录 `hit`、`rate` 或 `correct`，不得直接改变发布状态；已由旧 `/api/v1/feedback` 迁移。 |
| `GET /api/v1/knowledge/:versionId/lineage` | Planned | 返回父子版本、关联 Run、Correction、Evaluation 和 publication。 |
| `GET /api/v1/knowledge/:versionId/diff?against=<versionId>` | Planned | 返回结构化 Markdown Diff 和范围校验。 |

第一阶段 Knowledge 是真实列表、检索与详情组成的 Preview；Add curated knowledge 暂不进入前台范围。

## 5. 评测

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| Run snapshot 的 `evaluations` 与 `latestDecision` | Available | 单 Run 评测和 Gate 的当前事实源。 |
| `GET /api/v1/evaluations` | Planned | 跨 Run 评测列表；支持 runId、moduleId、gate、status、时间与分页。 |
| `GET /api/v1/evaluations/:evaluationId` | Planned | 报告、策略版本、工具链摘要、reason codes 和 ArtifactRef。 |
| `GET /api/v1/evaluations/:evaluationId/artifacts` | Planned | 按权限返回评测证据元数据和受控下载链接。 |
| `GET /api/v1/evaluation-rules` | Planned | 只读返回规则、版本、适用范围和启用状态。 |
| `PATCH /api/v1/evaluation-rules/:ruleId` | Planned | 管理员更新允许变更的规则配置，保留版本和审计记录。 |

第一阶段评测页只能聚合现有批次 snapshot，并持续显示 `Partial`；全局筛选、规则管理和完整证据浏览不可宣称可用。

## 6. 来源

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /api/v1/sources/scan` | Available | 返回本次发现的来源候选，不等同于 Registry；已由旧 `/api/v1/scan` 迁移。 |
| `GET /api/v1/sources` | Planned | 持久化来源列表；支持 type、status、project、分页和最后同步时间。 |
| `POST /api/v1/sources` | Planned | 创建来源配置，校验路径/URL、访问边界和凭据引用。 |
| `GET /api/v1/sources/:sourceId` | Planned | 返回来源配置、同步状态、最近错误和关联知识统计。 |
| `PATCH /api/v1/sources/:sourceId` | Planned | 修改白名单字段并记录审计；不得回传秘密正文。 |
| `POST /api/v1/sources/:sourceId/refresh` | Planned | 发起幂等扫描/同步任务并返回关联 runId 或 jobId。 |

第一阶段来源页仅提供真实只读扫描候选；持久化管理、启停、刷新和来源统计均以禁用状态展示。

## 7. Graph

工作流图页面是所选批次的只读 Agent 工作流执行图，不是 Knowledge Graph，也不是可编辑工作流画布。它不新增专用 Graph API，而是组合以下现有事实：

| 数据来源 | 状态 | Graph 用途 |
|---|---|---|
| `GET /api/v1/runs` | Available / Extend | 选择当前或历史 Run。 |
| `GET /api/v1/runs/:runId` | Available | 读取 FlywheelRun 业务状态、iteration 和关联事实。 |
| `GET /api/v1/runs/:runId/workflow-nodes` | Available | 读取固定 Agent 节点的状态、角色、轮次、attempt 和时间。 |
| `GET /api/v1/runs/:runId/workflow-status` | Available | 读取工作流执行状态，不替代 FlywheelRun 业务状态。 |
| `GET /api/v1/runs/:runId/events?after=<seq>` | Available | 轮询补充节点事件并维护稳定顺序。 |
| `GET /api/v1/runs/:runId/event-stream` | Planned | B2 后通过 SSE 实时更新并断线续传。 |

第一阶段 Graph 必须使用真实节点投影实现轮询版；点击节点可查看受控 ArtifactRef、错误摘要与事件。固定拓扑来自服务端 Agent 定义，前台不得拖拽修改边、直接读取 checkpoint 或提供人工推进状态的动作。

## 8. Agent 设置

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /api/v1/agents` | Available | 返回固定 Agent 定义、职责、只读契约和当前 `promptAddon`。 |
| `PUT /api/v1/agents/:agentId/prompt` | Available | 仅更新 `promptAddon`；拒绝职责、Schema、权限、节点边和 Provider 类名。 |
| `GET /api/v1/agents/providers/status` | Planned | 返回 Provider 认证/可用状态、模型标识和受控错误摘要，不返回凭据。 |
| `GET /api/v1/provider-settings` | Planned | 返回 Pi Agent Provider 类型、脱敏 API URL、API Key 是否已配置及验证状态，不返回完整凭据。 |
| `PUT /api/v1/provider-settings` | Planned | 管理员保存 API URL 与可选 API Key，要求鉴权、幂等、地址安全校验和审计。 |
| `POST /api/v1/provider-settings/verify` | Planned | 使用服务端持有凭据执行无副作用连接验证并返回分类结果。 |

第一阶段 Agent 设置可以真实展示 Agent；若产品暂不开放写入，则隐藏或禁用提示词编辑。拓扑、工具权限、Schema 与 Provider 切换不提供假保存。

## 9. Preview 破坏性迁移清单

以下旧 HTTP 路径已在 B1 迁移中直接删除，不保留别名：

- `/api/v1/status`、`/api/v1/capabilities`；
- `/api/v1/query`、`/api/v1/scan`、`/api/v1/ingest`、`/api/v1/feedback`；
- `/api/v1/run-commands/start`、`/api/v1/run-commands/resume`、`/api/v1/run-commands/cancel`；
- `/api/v1/transition`、`/api/v1/evaluate`、`/api/v1/publish`。

其中 transition、evaluate、publish 继续作为内部 Application App/工作流能力存在，但不再作为公共 HTTP API。Server、Console、DSH Adapter 与测试均已切换到规范路径，旧公共路径由集成测试验证返回 `404`。

## 10. 页面交付矩阵

| 页面 | 第一阶段可真实使用 | 可预览但不完整 | 仍需后台 API |
|---|---|---|---|
| 操作中心 | 批次指标、最近批次、批次级异常投影 | 健康分项可展示已有事实 | 待处理事项生命周期、重新生成、活动流、知识健康度 |
| 飞轮批次 | 列表、启动固定 profile、详情、节点、事件、取消、恢复、报告 | 进度仅展示可证明阶段 | 百分比进度、重试、SSE、通用启动参数 |
| 知识 | 列表、简单查询、详情、反馈 | 血缘和差异入口禁用 | 血缘、差异；不含人工添加精选知识 |
| 工作流图 | 选择批次、真实固定拓扑、节点状态与轮询事件 | 进度和实时连接状态在 B2 前为 Partial | 复用批次进度与 event-stream，不新增 Graph API |
| 评测 | 从批次 snapshot 查看与聚合 | 全局列表标记 Partial | 独立列表/详情/证据/规则 API |
| 来源 | 扫描候选只读查看 | 注册控件禁用 | 来源 CRUD、刷新和统计 |
| Agent 设置 | Agent 定义和 promptAddon 事实 | Provider 健康与配置标记未接入 | Provider 状态、API URL/Key 安全配置与验证；固定 Agent 契约不得开放编辑 |

## 11. 最终目标实施顺序

| 阶段 | 后台能力 | 完成出口 |
|---|---|---|
| B1 API 基线 | 11 个旧接口的资源化迁移；分页、错误、认证、幂等、revision 通用契约 | 旧 HTTP 路由全部删除，Server、Console、DSH Adapter、测试和文档只引用新路径。 |
| B2 核心控制面 | 待处理事项；批次进度/重试/SSE；组件健康与活动流；工作流图实时更新 | 操作中心、飞轮批次和 Agent 工作流执行图不依赖模拟或浏览器私有状态即可完成查看、治理、重试和断线恢复。 |
| B3 内容与质量面 | Knowledge lineage/diff；Evaluation 读模型与规则；Source Registry；Knowledge Health | Knowledge、Evaluations、Sources 的列表、详情、筛选、证据和允许动作全部来自服务端事实，健康指标具备完整输入和计算口径。 |
| B4 运营面 | Provider status 与 Pi Agent API 配置；项目空间；指标口径、SSE 容量和大数据查询加固 | Agent Settings 显示真实 Provider 状态并安全配置默认 Pi Agent，全部列表与实时连接通过容量、恢复、分页和权限验收。 |

B1–B4 的接口范围以本文件各表为准；Graph 重复引用批次 event-stream，不重复视为 Graph 专用接口。阶段可以拆分 PR，但不得在某阶段完成前把对应页面状态从 Preview/Partial/Disabled 提升为 Available。

HCP-1 已于 2026-09-03 获得 `Accepted`，当前七页信息架构、Graph 语义和 API 边界已经冻结；后续 B2/B3 接线不得恢复历史八入口结构。HCP-1 不替代本规范的自动化迁移验收门。
