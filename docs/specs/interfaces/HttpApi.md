<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：Preview HTTP API 规范。
-->
# Preview HTTP API 规范

代码位置：[src/interfaces/uiApi/UiApi.ts](../../../src/interfaces/uiApi/UiApi.ts)、[src/interfaces/runner/Server.ts](../../../src/interfaces/runner/Server.ts)、[src/interfaces/runner/Composition.ts](../../../src/interfaces/runner/Composition.ts)、[src/interfaces/dsh/Dsh.ts](../../../src/interfaces/dsh/Dsh.ts)。


## 入口与响应

UiApi 启动本地服务；Server 解析请求并通过 Application App 执行用例，Composition 装配存储、模型、工作流与评测器。Preview 路由使用 system、runs、knowledge、evaluations、sources、graph、agents 资源组，新增字段与消费者在同一变更同步。

内部 transition、evaluate、publish 不作为任意 HTTP 动作开放。写请求验证配置的令牌和请求来源，未配置时提供明确启用说明并拒绝写入。只读接口返回业务投影，不能泄漏凭据、Prompt 正文或 checkpoint 私有表。

## 资源目录

Available 是已接线路由；Planned 路由不作为当前能力。Available / Extend 表示基础读取存在，扩展查询字段仍需逐项核对。路由表保留协议定位，详细字段使用共享 Schema。

| 路由 | 状态 | 契约 |
| --- | --- | --- |
| `GET /health` | Available | 进程存活探针；不返回业务健康分。 |
| `GET /api/v1/system/status` | Available | 返回 Registry 业务汇总：知识各状态、反馈、批次与 publication 计数；已由旧 `/api/v1/status` 迁移。分组件健康与采样时间只由 `/api/v1/system/components` 返回。 |
| `GET /api/v1/system/capabilities` | Available | 返回读写开关、认证方式、Provider 类型和隔离能力；已由旧 `/api/v1/capabilities` 迁移。 |
| `GET /api/v1/system/components` | Available | 返回分组件健康、reason code、最后成功时间和受控诊断摘要。 |
| `GET /api/v1/runs` | Available / Extend | Run 列表；补充 `status`、`moduleId`、`updatedAfter`、分页和稳定排序。 |
| `POST /api/v1/runs` | Available | 以 `scenario` JSON 与 `repositoryRoot` 创建并启动项目 Run；返回 `runId`、`eventId`。 |
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
| `GET /api/v1/knowledge/health?window=<window>` | Available | 返回有明确分子、分母、样本窗口和规则版本的 freshness、coverage、quality，以及仅在三项均可用时计算的 0–100 总分；不得输出模型臆测分数。 |
| `GET /api/v1/knowledge` | Available | 治理知识目录与简单检索；统一支持 `q`、`status`、`category`、`limit`、`cursor`，未给 `status` 时返回 `CANDIDATE,VERIFIED,LOW_CONFIDENCE,SUPERSEDED`。面向知识消费者的调用必须显式使用 `status=VERIFIED`；该路由已取代 `/api/v1/query`。 |
| `GET /api/v1/knowledge/:versionId` | Available | 正文、状态、quality 和 provenance 详情。 |
| `POST /api/v1/knowledge/candidates` | Available | 创建候选但不表示发布；已由旧 `/api/v1/ingest` 迁移。 |
| `POST /api/v1/knowledge/:versionId/feedback` | Available | 记录 `hit`、`rate` 或 `correct`，不得直接改变发布状态；已由旧 `/api/v1/feedback` 迁移。 |
| `GET /api/v1/knowledge/:versionId/lineage` | Available | 返回父子版本边、provenance，以及关联批次、Correction、Evaluation 和 publication 的反向关系。 |
| `GET /api/v1/knowledge/:versionId/diff?against=<versionId>` | Available | 返回结构化 Markdown hunks、变更章节和 Correction 范围校验。 |
| `GET /api/v1/evaluations` | Available | 跨批次评测列表；支持 `runId`、`moduleId`、`gate`、`status`、`from`、`to`、`limit` 和 `cursor`。 |
| `GET /api/v1/evaluations/:evaluationId` | Available | 返回不可变报告、Decision、规则版本、工具链摘要、reason codes 和 ArtifactRef。 |
| `GET /api/v1/evaluations/:evaluationId/artifacts` | Available | 返回评测证据元数据；匿名读取不会得到可下载能力。 |
| `GET /api/v1/evaluations/:evaluationId/artifacts/:artifactId` | Available | 使用管理员 Bearer token 读取并校验指定证据字节；浏览器必须以鉴权请求下载，不得把 token 放进 URL。 |
| `GET /api/v1/evaluation-rules` | Available | 返回规则当前版本、适用范围和启用状态。 |
| `GET /api/v1/evaluation-rules/:ruleId` | Available | 返回当前规则与不可变修订历史。 |
| `PATCH /api/v1/evaluation-rules/:ruleId` | Available | 管理员只更新允许的 `scope`、`config`、`enabled`，要求 revision、reason、幂等键并保留审计记录。 |
| `GET /api/v1/sources/scan` | Available | 返回本次发现的来源候选，不等同于 Registry；已由旧 `/api/v1/scan` 迁移。 |
| `GET /api/v1/sources` | Available | 持久化来源列表；支持 `kind`、`status`、`project`、`limit`、`cursor` 和最后同步时间。 |
| `POST /api/v1/sources` | Available | 创建 `FILE` 或 `HTTPS` 来源，先校验路径/URL、访问边界、固定 revision 和凭据引用。 |
| `GET /api/v1/sources/:sourceId` | Available | 返回脱敏配置、固定/观测 revision、同步状态、漂移、最近错误、刷新任务、审计和关联知识统计。 |
| `PATCH /api/v1/sources/:sourceId` | Available | 使用 revision、reason 与幂等键修改名称、启停、locator、固定 revision 或凭据引用；不得回传秘密正文。 |
| `POST /api/v1/sources/:sourceId/refresh` | Available | 幂等复验来源并返回 `jobId`、状态、reasonCode 和最新来源快照。 |
| `GET /api/v1/runs` | Available / Extend | 选择当前或历史 Run。 |
| `GET /api/v1/runs/:runId` | Available | 读取 FlywheelRun 业务状态、iteration 和关联事实。 |
| `GET /api/v1/runs/:runId/workflow-nodes` | Available | 读取固定 Agent 节点的状态、角色、轮次、attempt 和时间。 |
| `GET /api/v1/runs/:runId/workflow-status` | Available | 读取工作流执行状态，不替代 FlywheelRun 业务状态。 |
| `GET /api/v1/runs/:runId/events?after=<seq>` | Available | 轮询补充节点事件并维护稳定顺序。 |
| `GET /api/v1/runs/:runId/event-stream` | Available | 通过 SSE 实时更新并以持久化序号断线续传。 |
| `GET /api/v1/agents` | Available | 返回固定 Agent 定义、职责、只读契约和当前 `promptAddon`。 |
| `PUT /api/v1/agents/:agentId/prompt` | Available | 仅更新 `promptAddon`；拒绝职责、Schema、权限、节点边和 Provider 类名。 |
| `GET /api/v1/agents/providers/status` | Available | 返回当前 Provider 的可用性、认证状态、模型、检查时间和受控 reasonCode，不返回凭据。 |
| `GET /api/v1/provider-settings` | Available | 返回 DSH 类型（旧 Pi 只读）、脱敏 API URL、API Key 是否已配置、revision 与验证状态，不返回完整凭据。 |
| `PUT /api/v1/provider-settings` | Available | 管理员保存 API URL、模型与可选 API Key，要求鉴权、revision、幂等、地址安全校验和脱敏审计；保存后默认未启用。 |
| `POST /api/v1/provider-settings/verify` | Available | 使用服务端持有凭据执行无生成副作用的模型列表探测；成功后按请求启用，失败则保持关闭。 |
| `GET /api/v1/metrics/runs?window=<window>` | Available | 返回批次、节点与排队耗时 P50/P95、调用、`providerCalls.retries`、`workflowNodeRetries`、Token、可空估算成本、Provider/节点分组和样本量；当前内置 Adapter 没有可信定价源，因此成本保持 `null`。 |
| `GET /api/v1/metrics/governance?window=<window>` | Available | 返回首次自动修订通过率、三轮收敛率、人工介入比例、平均处理时间与七日复发率。 |

## 命令、并发和实时读取

事项状态为 OPEN → ACKNOWLEDGED → RESOLVED。写命令使用 Idempotency-Key 去重；expectedRevision 防止覆盖并发编辑，相同请求重放返回原结果，键冲突或修订冲突返回 409。RETRY 只恢复合法 checkpoint，REGENERATE 创建带父关联的新批次，不能重写既有 Gate 或 publication。

操作中心只能从 `FAILED`、`LOW_CONFIDENCE` 等持久事实投影可处理动作；还需检查当前事项 allowedActions 和 Run 可恢复条件，不能仅凭状态按钮直接调用任意内部阶段。

事件以 event_seq 作为续传游标；失效游标返回 409 CURSOR_EXPIRED 并要求重新读取快照。进度无法证明固定总量时使用 mode=INDETERMINATE，不返回猜测百分比或 ETA。评测规则保持不可变修订，历史绑定无法证明时标为 UNBOUND。

## 设计到指南

治理事项、进度和聚合分别承接历史 DEV-006A、DEV-006B、DEV-006C 的接口范围，当前设计以本文件为准。启动、认证及查询示例见 Operations，界面行为见 UiuxDesign；外部 DSH HTTP 接入同样调用 Application，不另设发布通道。


文档关系：[设计目录](../README.md)负责代码与设计定位；[开发指南](../../Development.md)说明修改和交付步骤。

## 本地发布与固定模块启动

远程 `/api/` 请求统一要求 Bearer 访问令牌；以下产品路由即使从回环地址调用也要求认证。静态 Console 与 `/health` 可公开读取。所有写操作要求 `Idempotency-Key`，持久收据仅保存命令摘要和脱敏结果。

| 方法和路由 | 输入与结果 |
| --- | --- |
| `GET /api/v1/server-directories?path=...` | 返回授权服务器目录、上级和最多 200 个可见子目录；拒绝越界与符号链接逃逸 |
| `POST /api/v1/runs/markdown-lite` | `{repositoryRoot}`；服务端固定场景启动，202 返回运行句柄 |
| `GET /api/v1/publications/settings` | 知识目录、Git 开关/仓库/分支及 tokenConfigured；无明文令牌 |
| `PUT /api/v1/publications/settings` | `{directory?, git?: {enabled,remote,branch,token?,clearToken?}}` |
| `GET /api/v1/publications` | 返回已授权发布收据，区分 PENDING / PUBLISHED |
| `GET /api/v1/publications/:publicationKey` | 返回正文、来源材料与收据 |
| `POST /api/v1/publications/recover` | 空对象；恢复已有 PENDING 发布 |
| `POST /api/v1/publications/sync` | 空对象；手动同步已发布知识，失败保留本地版本 |

PENDING、Git 关闭、Git 冲突及认证失败使用可定位的错误码。API 不暴露手工将候选升级为本地发布的入口。操作说明见 [Linux 安装与本地发布](../../LinuxInstall.md)。
