# Preview HTTP API 规范

**状态：Accepted；B1–B4 已实现｜版本：0.5.0｜日期：2026-09-04**

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

- `POST` Command 使用 `Idempotency-Key`；持久化回执提交后，同一 key 与同一规范化请求返回同一结果，不同请求返回 `409 IDEMPOTENCY_CONFLICT`。业务变更与回执不共享事务的 Preview 例外必须在对应资源契约中显式列出。
- `PATCH` 和规则类修改必须提交当前 revision；过期 revision 返回 `409 REVISION_CONFLICT`。
- 成功写响应至少包含 `{ resourceId, eventId, revision, acceptedAt }`；异步任务另外返回 `runId` 或 `jobId`。
- 时间使用 UTC RFC 3339，ID 在资源生命周期内稳定；所有枚举只允许追加或通过 API 大版本调整。

## 2. 系统与能力

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /health` | Available | 进程存活探针；不返回业务健康分。 |
| `GET /api/v1/system/status` | Available | 返回 Registry、CAS、Provider、Evaluator 的真实状态与采样时间；已由旧 `/api/v1/status` 迁移。 |
| `GET /api/v1/system/capabilities` | Available | 返回读写开关、认证方式、Provider 类型和隔离能力；已由旧 `/api/v1/capabilities` 迁移。 |
| `GET /api/v1/system/components` | Available | 返回分组件健康、reason code、最后成功时间和受控诊断摘要。 |

## 3. 飞轮批次、操作中心与活动流

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /api/v1/runs` | Available / Extend | Run 列表；补充 `status`、`moduleId`、`updatedAfter`、分页和稳定排序。 |
| `POST /api/v1/runs` | Available | 创建并启动固定 profile Run；返回 `runId`、`eventId`。 |
| `GET /api/v1/runs/:runId` | Available | Run、版本、评测、Decision、checkpoint、节点、事件和 publication 快照。 |
| `GET /api/v1/runs/:runId/events?after=<seq>` | Available | 按 `event_seq` 增量读取运行事件。 |
| `GET /api/v1/runs/:runId/workflow-nodes` | Available | 返回角色、轮次、尝试、执行状态、`readyAt`、开始和完成时间；历史记录无法证明 `readyAt` 时返回 `null`，不暴露 checkpoint 私有数据。 |
| `GET /api/v1/runs/:runId/workflow-status` | Available | 工作流执行状态，不替代 FlywheelRun 业务状态。 |
| `GET /api/v1/runs/:runId/report` | Available | 下载脱敏审计报告；已由旧 `demo-report` 路径迁移。 |
| `POST /api/v1/runs/:runId/resume` | Available | 从同一 checkpoint 恢复。 |
| `POST /api/v1/runs/:runId/cancel` | Available | 取消运行并传播终止信号。 |
| `GET /api/v1/runs/:runId/progress` | Available | 返回可证明的 completed/total 单元、当前阶段和采样时间；无可靠模型时返回 `INDETERMINATE`，不提供 ETA。 |
| `POST /api/v1/runs/:runId/retry` | Planned | 不开放脱离治理事项的通用重试；受控 retry 已由事项动作接口实现。 |
| `GET /api/v1/runs/:runId/event-stream` | Available | SSE 推送，支持 `Last-Event-ID`/`event_seq` 续传和自动重连。 |
| `GET /api/v1/action-items` | Available | 持久化治理事项列表；支持 severity、type、status、runId、分页。 |
| `GET /api/v1/action-items/:actionItemId` | Available | 返回原因、重复观察来源、服务端允许动作、前次发生和不可变审计历史。 |
| `POST /api/v1/action-items/:actionItemId/actions/:action` | Available | 实现 acknowledge、resolve、retry 的管理员鉴权、revision、持久化幂等和审计。 |
| `POST /api/v1/action-items/:actionItemId/regenerate` | Available | 以冻结反馈创建新 Run，在配置快照保留来源事项、parentRunId 和 reason 摘要。 |
| `GET /api/v1/activity` | Available | 跨 Run 审计活动列表，支持 type、runId、severity、时间和分页过滤。 |
| `GET /api/v1/activity/stream` | Available | 跨 Run SSE 活动流，支持断线续传。 |
| `GET /api/v1/knowledge/health?window=24h|7d|30d` | Available | 返回有明确分子、分母、样本窗口和规则版本的 freshness、coverage、quality，以及仅在三项均可用时计算的 0–100 总分；不得输出模型臆测分数。 |

DEV-006A/B/C 已完成：异常与组件不可用事实形成可去重、可复发关联的持久化事项；进度来自冻结七 Agent 配置；治理命令具备管理员鉴权、revision、跨重启幂等与审计；regenerate 冻结因果链和反馈；批次与活动 SSE 已接入前台并在断线时退回轮询。DEV-008 随后补齐了有明确口径的 Knowledge Health；无完整分母时仍返回 `unavailable` 和空值，不回退到原型演示分数。

### 3.1 DEV-006 最小交付边界

DEV-006 只补齐操作中心、飞轮批次和工作流图所需控制面，不提前实现 B3 的来源漂移、Evaluation Rule、Knowledge lineage/diff 或 Knowledge Health，也不实现 B4 的项目空间和 Provider 配置。交付拆为三个可独立验收的切片：

1. `DEV-006A`：组件健康、持久化待处理事项、批次进度和跨批次活动流的只读 API；前台从临时派生数据切换到服务端事实。
2. `DEV-006B`：acknowledge、resolve、retry、regenerate 命令及完整权限、幂等和审计；读模型稳定前不得先开放写按钮。
3. `DEV-006C`：批次与活动 SSE、断线续传、前台实时更新和轮询降级；SSE 故障不得使已持久化事实消失。

### 3.2 待处理事项领域契约

待处理事项是持久化治理实体，不等同于 FlywheelRun、GateDecision 或普通事件。DEV-006 允许以下来源类型：

操作中心只能从 `FAILED`、`LOW_CONFIDENCE`、确定性门禁停止、影响活动批次的必需组件不可用，以及来源刷新得到的漂移/访问失败事实产生事项；不得从前台占位内容、模型自由文本或正常的自动 `ITERATE` 制造治理事实。

| `type` | 确定性触发事实 | 默认严重级别 |
|---|---|---|
| `RUN_FAILED` | 批次进入 `FAILED` | `HIGH` |
| `LOW_CONFIDENCE` | 批次进入 `LOW_CONFIDENCE` | `MEDIUM` |
| `GATE_STOPPED` | 最新 GateDecision 为 `STOPPED` | `HIGH` |
| `COMPONENT_UNAVAILABLE` | 必需组件状态为 `UNAVAILABLE` 且影响活动批次 | `HIGH` |
| `SOURCE_DRIFT` | 来源刷新或显式复验发现 observed revision 与 pinned revision 不一致 | `MEDIUM` |
| `SOURCE_UNAVAILABLE` | 来源刷新经过访问边界校验后仍不可访问 | `HIGH` |

评测的 `STOPPED` 已通过 `GATE_STOPPED` 确定性投影；普通失败评测会进入自动 Correction/迭代，不重复创建人工事项。来源事项的 subject.kind 为 `SOURCE`、runId 为 `null`，只允许 `ACKNOWLEDGE` 与 `RESOLVE`。安全事实事项等待 DEV-012 的完整权限拒绝审计后补齐，因此 `KF-SYS-033` 仍保持 Partial。实体最小结构如下：

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
  "allowedActions": ["ACKNOWLEDGE", "RESOLVE", "RETRY"],
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
| `GET /api/v1/knowledge/:versionId/lineage` | Available | 返回父子版本边、provenance，以及关联批次、Correction、Evaluation 和 publication 的反向关系。 |
| `GET /api/v1/knowledge/:versionId/diff?against=<versionId>` | Available | 返回结构化 Markdown hunks、变更章节和 Correction 范围校验。 |

Knowledge 页面以真实列表、检索、详情、血缘和差异组成可用 Preview，并可从关系记录反向进入批次和评测详情。人工添加精选知识仍不进入本轮前台范围。

## 5. 评测

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| Run snapshot 的 `evaluations` 与 `latestDecision` | Available | 单 Run 评测和 Gate 的当前事实源。 |
| `GET /api/v1/evaluations` | Available | 跨批次评测列表；支持 `runId`、`moduleId`、`gate`、`status`、`from`、`to`、`limit` 和 `cursor`。 |
| `GET /api/v1/evaluations/:evaluationId` | Available | 返回不可变报告、Decision、规则版本、工具链摘要、reason codes 和 ArtifactRef。 |
| `GET /api/v1/evaluations/:evaluationId/artifacts` | Available | 返回评测证据元数据；匿名读取不会得到可下载能力。 |
| `GET /api/v1/evaluations/:evaluationId/artifacts/:artifactId` | Available | 使用管理员 Bearer token 读取并校验指定证据字节；浏览器必须以鉴权请求下载，不得把 token 放进 URL。 |
| `GET /api/v1/evaluation-rules` | Available | 返回规则当前版本、适用范围和启用状态。 |
| `GET /api/v1/evaluation-rules/:ruleId` | Available | 返回当前规则与不可变修订历史。 |
| `PATCH /api/v1/evaluation-rules/:ruleId` | Available | 管理员只更新允许的 `scope`、`config`、`enabled`，要求 revision、reason、幂等键并保留审计记录。 |

评测页使用独立读模型完成跨批次筛选、详情、证据元数据、受控下载和规则修订；历史报告与历史规则版本保持不可变，新规则只影响后续评测。

## 6. 来源

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /api/v1/sources/scan` | Available | 返回本次发现的来源候选，不等同于 Registry；已由旧 `/api/v1/scan` 迁移。 |
| `GET /api/v1/sources` | Available | 持久化来源列表；支持 `kind`、`status`、`project`、`limit`、`cursor` 和最后同步时间。 |
| `POST /api/v1/sources` | Available | 创建 `FILE` 或 `HTTPS` 来源，先校验路径/URL、访问边界、固定 revision 和凭据引用。 |
| `GET /api/v1/sources/:sourceId` | Available | 返回脱敏配置、固定/观测 revision、同步状态、漂移、最近错误、刷新任务、审计和关联知识统计。 |
| `PATCH /api/v1/sources/:sourceId` | Available | 使用 revision、reason 与幂等键修改名称、启停、locator、固定 revision 或凭据引用；不得回传秘密正文。 |
| `POST /api/v1/sources/:sourceId/refresh` | Available | 幂等复验来源并返回 `jobId`、状态、reasonCode 和最新来源快照。 |

来源页默认读取持久化注册；扫描候选仅在用户明确触发时读取，不能覆盖已加载的注册事实。`FILE` 只能位于配置的采集根，`HTTPS` 仅允许显式主机白名单、拒绝重定向和私网/本机目标，凭据只允许 `secret://env/<name>` 引用。Preview 不提供 DELETE：停用通过 `PATCH enabled=false` 完成，历史与审计保留。

## 7. Graph

工作流图页面是所选批次的只读 Agent 工作流执行图，不是 Knowledge Graph，也不是可编辑工作流画布。它不新增专用 Graph API，而是组合以下现有事实：

| 数据来源 | 状态 | Graph 用途 |
|---|---|---|
| `GET /api/v1/runs` | Available / Extend | 选择当前或历史 Run。 |
| `GET /api/v1/runs/:runId` | Available | 读取 FlywheelRun 业务状态、iteration 和关联事实。 |
| `GET /api/v1/runs/:runId/workflow-nodes` | Available | 读取固定 Agent 节点的状态、角色、轮次、attempt 和时间。 |
| `GET /api/v1/runs/:runId/workflow-status` | Available | 读取工作流执行状态，不替代 FlywheelRun 业务状态。 |
| `GET /api/v1/runs/:runId/events?after=<seq>` | Available | 轮询补充节点事件并维护稳定顺序。 |
| `GET /api/v1/runs/:runId/event-stream` | Available | 通过 SSE 实时更新并以持久化序号断线续传。 |

Graph 使用真实节点投影与 SSE；断线时退回增量轮询。点击节点可查看受控 ArtifactRef、错误摘要与事件。固定拓扑来自服务端 Agent 定义，前台不得拖拽修改边、直接读取 checkpoint 或提供人工推进状态的动作。

## 8. Agent 设置

| 方法与路径 | 状态 | 用途与最小响应 |
|---|---|---|
| `GET /api/v1/agents` | Available | 返回固定 Agent 定义、职责、只读契约和当前 `promptAddon`。 |
| `PUT /api/v1/agents/:agentId/prompt` | Available | 仅更新 `promptAddon`；拒绝职责、Schema、权限、节点边和 Provider 类名。 |
| `GET /api/v1/agents/providers/status` | Available | 返回当前 Provider 的可用性、认证状态、模型、检查时间和受控 reasonCode，不返回凭据。 |
| `GET /api/v1/provider-settings` | Available | 返回 Pi Agent 类型、脱敏 API URL、API Key 是否已配置、revision 与验证状态，不返回完整凭据。 |
| `PUT /api/v1/provider-settings` | Available | 管理员保存 API URL、模型与可选 API Key，要求鉴权、revision、幂等、地址安全校验和脱敏审计；保存后默认未启用。 |
| `POST /api/v1/provider-settings/verify` | Available | 使用服务端持有凭据执行无生成副作用的模型列表探测；成功后按请求启用，失败则保持关闭。 |
| `GET /api/v1/metrics/runs?window=24h|7d|30d` | Available | 返回批次、节点与排队耗时 P50/P95、调用、`providerCalls.retries`、`workflowNodeRetries`、Token、估算成本、Provider/节点分组和样本量。 |
| `GET /api/v1/metrics/governance?window=24h|7d|30d` | Available | 返回首次自动修订通过率、三轮收敛率、人工介入比例、平均处理时间与七日复发率。 |

Agent 设置同时展示固定 Agent 契约、Provider 配置/验证和运营指标。完整 API Key 仅在保存请求中从页面内存发送；服务端使用权限为 `0600` 的 AES-256-GCM 本地密钥文件持有，读接口、审计、运行快照和指标均不得包含秘密。API URL 必须是公开 `HTTPS`，保存和验证前均重新解析 DNS 并拒绝本机、私网、混合解析、用户信息、查询、fragment 与重定向。验证成功的配置有效期为 24 小时；只有已启用且验证有效的配置才使后续新批次冻结 `pi-agent`、模型和非秘密参数摘要。已经冻结为 Pi 的批次在到期、配置变化、不可用或恢复摘要不匹配时拒绝执行，不得退回 fixture；没有有效 Pi 配置时，新批次使用 `GET /api/v1/system/capabilities` 明确返回的部署 fallback，默认 fixture 仅代表本地验收。空输出或 Schema 不合法输出由全新 Pi 会话做 `1..3` 次有界总尝试，每次单独审计。Provider 设置文件与 SQLite 命令回执暂不共享崩溃原子性：加密文件已经提交但回执尚未提交时，进程重启后的重放会返回 revision 冲突；该恢复边界属于 DEV-012，不得宣称 crash-exactly-once。

指标响应统一携带 `window`、`from`、`to`、`sampledAt`、`cohort`、`definitions` 和逐指标 `sampleSize`。排队耗时只使用同一次节点尝试的持久化 `readyAt → startedAt`；旧记录缺少 `readyAt` 时排除该样本。`providerCalls.retries` 只计算模型输出无效后的额外 Provider 尝试，`workflowNodeRetries.total` 只计算 attempt 大于一的额外工作流节点尝试，两者不得相加或互相代替。比率同时返回 numerator/denominator；空分母或缺少可信模型定价时返回 `null`，不能以 0 代替。fixture 与真实 Provider 样本必须通过 cohort 标识，前台不得把混合样本解释为生产模型水平。

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
| 操作中心 | 持久化事项、治理动作、组件健康、活动流、最近批次和知识健康度 | 缺少完整样本时健康度显示 `—` | 安全事实事项仍随 DEV-012 权限审计补齐 |
| 飞轮批次 | 列表、固定 profile、详情、可证明进度、节点、事件、受控重试、取消、恢复、报告和 SSE | 通用启动参数仍受限 | 任意项目的通用启动向导不属于 B2 |
| 知识 | 列表、组合查询、详情、反馈、血缘、结构化差异和反向关系 | 无样本时关系区 Empty | 不含人工添加精选知识 |
| 工作流图 | 选择批次、真实固定拓扑、节点状态、实时事件和轮询降级 | 无 | 复用批次进度与 event-stream，不新增 Graph API |
| 评测 | 跨批次列表、筛选、详情、证据元数据/受控下载和规则修订 | 无 | 任意新建/删除规则不在 Preview 范围 |
| 来源 | 持久化注册、筛选、创建、更新、启停、刷新、漂移和关联统计 | 扫描候选是显式辅助视图 | 删除与自动内容摄取不在本轮范围 |
| Agent 设置 | Agent 定义、promptAddon、Provider 状态、安全配置/验证和运行/治理指标 | 无样本或无可信定价显示 `—` | 项目空间与企业级 KMS 后置；固定 Agent 契约不得开放编辑 |

## 11. 最终目标实施顺序

| 阶段 | 后台能力 | 完成出口 |
|---|---|---|
| B1 API 基线 | 11 个旧接口的资源化迁移；分页、错误、认证、幂等、revision 通用契约 | 旧 HTTP 路由全部删除，Server、Console、DSH Adapter、测试和文档只引用新路径。 |
| B2 核心控制面 | 待处理事项；批次进度/重试/SSE；组件健康与活动流；工作流图实时更新 | 操作中心、飞轮批次和 Agent 工作流执行图不依赖模拟或浏览器私有状态即可完成查看、治理、重试和断线恢复。 |
| B4 运营最小可用面（DEV-007） | Provider status 与 Pi Agent API 配置；生成/治理速度、成本和效果观测；项目空间继续后置 | Agent Settings 显示真实 Provider 状态并安全配置默认 Pi Agent；新批次可使用真实 Provider；P50/P95、Token、成本与治理收敛指标具有样本量和明确口径。 |
| B3 内容与质量面（DEV-008） | Knowledge lineage/diff；Evaluation 读模型与规则；Source Registry；Knowledge Health | Knowledge、Evaluations、Sources 的列表、详情、筛选、证据和允许动作全部来自服务端事实，健康指标具备完整输入和计算口径。 |

B1–B4 的接口范围以本文件各表为准，当前均已有实现和自动化验收；Graph 重复引用批次 event-stream，不重复视为 Graph 专用接口。项目空间、敌对代码隔离、完整安全事实事项和生产容量仍属于后续阶段，不能因 DEV-007/008 完成而外推为 Release 能力。

HCP-1 已于 2026-09-03 获得 `Accepted`，当前七页信息架构、Graph 语义和 API 边界已经冻结；后续 B2/B3 接线不得恢复历史八入口结构。HCP-1 不替代本规范的自动化迁移验收门。
