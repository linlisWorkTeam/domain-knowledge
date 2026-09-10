<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：Preview HTTP API 规范。
-->
# Preview HTTP API 规范

代码位置：[src/interfaces/uiApi/UiApi.ts](../../../src/interfaces/uiApi/UiApi.ts)、[src/interfaces/runner/Server.ts](../../../src/interfaces/runner/Server.ts)、[src/interfaces/runner/Composition.ts](../../../src/interfaces/runner/Composition.ts)、[src/interfaces/dsh/Dsh.ts](../../../src/interfaces/dsh/Dsh.ts)。


## 入口与响应

UiApi 启动本地服务；Server 解析请求并通过 Application App 执行用例，Composition 装配存储、模型、工作流与评测器。Preview 路由使用 system、runs、knowledge、evaluations、sources、graph、agents 资源组，新增字段与消费者在同一变更同步。

内部 transition、evaluate、publish 不作为任意 HTTP 动作开放。写请求在配置令牌时验证令牌；直接本机无令牌访问或显式免登录部署可直接写入，仍拒绝跨站浏览器请求。只读接口返回业务投影，不能泄漏凭据、Prompt 正文或 checkpoint 私有表。

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
| `POST /api/v1/repository-analyses` | Available | directory 与可选 revision（默认 HEAD）；只读固定 Git 提交，返回源码清单、模块候选、工具版本、资源和 CAS manifestRef。不启动生成。 |
| `POST /api/v1/projects` | Available | directory、revision、moduleIds及声明式build；固定选定源码正文和构建配置，返回不可变workbench-project-v1快照。同输入复用，不启动生成。 |
| `GET /api/v1/projects` | Available | snapshots输入历史，可按projectId过滤，最新保存优先；不读取源码正文。 |
| `GET /api/v1/projects/:snapshotId` | Available | 读取明确输入版本，不跟随HEAD或覆盖历史。 |
| `POST /api/v1/generations` | Available | snapshotId及可选scopes（以moduleId为键，entryPath/astFilter/symbols）；冻结模型配置，启动或复用C/C++ GENERATE任务，返回task。已有卡片可立即读取；任务状态、取消和同输入恢复共用stage-tasks。 |
| `POST /api/v1/reconstructions` | Available | snapshotId、versionIds；冻结模型与实际工具链身份，启动或复用FLYWHEEL中的代码重建及接口比较。返回阶段任务，行为评测与知识修订仍未接线，结果不具有发布资格。 |
| `GET /api/v1/stage-tasks/:taskId/artifacts/:sha256` | Available | 仅下载该任务结果或成功检查点直接引用的工件；无关系的CAS摘要返回404。沿用免登录或令牌访问规则，不提供任意CAS读取。 |
| `POST /api/v1/native-evaluations` | Available | reconstructionTaskId；绑定成功重建的结果摘要、配置、工具链与卡片版本，启动或复用EVALUATE。候选参考失败以TEST_CANDIDATE_REJECTED结束，可同输入恢复生成新候选；行为失败保存报告，不授予发布资格。 |
| `GET /api/v1/native-evaluations/:taskId/revision-evidence` | Available | 只读派生native-revision-evidence-v1，核验成功评测的参考oracle、固定正文及当前H2绑定。返回Review候选、失败数及未解决诊断，不授权改卡片；未完成评测或证据不匹配409。 |
| `POST /api/v1/knowledge-revisions` | Available | evaluationTaskId；冻结可信证据、卡片和配置，以FLYWHEEL/KNOWLEDGE_REVISION独立执行Review、DocGen和受影响索引刷新。返回标准stage task，可同输入恢复/取消。结果区分REVISED_INDEXED、QUALITY_REJECTED、UNRESOLVED，不发布。 |
| `POST /api/v1/index-builds` | Available | 可选 versionIds，必须是当前版本；冻结输入后创建或复用 INDEX 任务。200 表示 reusedTask，202 表示已接受；restored 为恢复文件数。 |
| `GET /api/v1/knowledge-index?q=` | Available | 摘要命中、原因、正文入口及 stale/missing 数量；不加载正文。 |
| `GET /api/v1/knowledge-index/:cardId` | Available | YAML 预览、工件引用及 stale 标记。 |
| `GET /api/v1/stage-tasks` | Available | projectId 筛选与分页；当前 GENERATE、INDEX、FLYWHEEL重建部分及EVALUATE行为部分接通公开启动。 |
| `GET /api/v1/stage-tasks/:taskId` | Available | 冻结输入、状态、累计用量、检查点与审计事件。 |
| `POST /api/v1/stage-tasks/:taskId/resume` | Available | inputDigest 必须匹配；旧契约/输入变化/预算耗尽返回409。 |
| `POST /api/v1/stage-tasks/:taskId/cancel` | Available | 幂等请求取消；运行中清理完成前不释放槽位。 |
| `GET /api/v1/cards` | Available | `contractVersion=1.0`；当前卡片目录，支持 `q/status/versionId/limit/cursor`，`versionId` 可定位某历史版本所属卡片。返回稳定 `cardId`、当前 `versionId`、`versionCount/history`、`identitySource`、`matchedTerms/matchReason`。仅检索摘要元数据，不读取正文；状态筛选作用于当前版本。 |
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
| `POST /api/v1/provider-settings/verify` | Available | 用户主动验证时使用服务端凭据读取模型列表，再通过生产 DSH 执行一次最多 64 输出 token 的最小生成；返回两阶段 checks。成功 reasonCode 为 GENERATION_READY，失败保持关闭；HTTP 断连传递取消，无后台验证或自动重试。 |
| `GET /api/v1/metrics/runs?window=<window>` | Available | 返回批次、节点与排队耗时 P50/P95、调用、`providerCalls.retries`、`workflowNodeRetries`、Token、可空估算成本、Provider/节点分组和样本量；当前内置 Adapter 没有可信定价源，因此成本保持 `null`。 |
| `GET /api/v1/metrics/governance?window=<window>` | Available | 返回首次自动修订通过率、三轮收敛率、人工介入比例、平均处理时间与七日复发率。 |

## 批次业务阶段与执行状态

Run 列表及详情的 `run` 保留领域 `state`，额外返回 `executionStatus`、`executionFailure: {code,nodeId} | null`、`recovery: {canResume,reasonCode}`、`isActive` 和 `canCancel`。失败节点可恢复时，执行状态可以为 `FAILED` 而业务阶段仍为 `GENERATING`；读接口不将业务状态改为 FAILED。仅执行状态 RUNNING 且业务未终结时计入活动数量并允许取消。

`status` 查询参数继续筛选业务状态；新增 `executionStatus` 单独筛选执行状态，均允许逗号分隔。没有 checkpoint 时返回 NOT_TRACKED；读取执行事实失败时返回 UNAVAILABLE，两者都不能推测正在运行或可恢复。失败摘要只含受控错误码和节点，不透传模型/连接原始错误。

恢复展示检查原有剩余预算、失败节点和 RunConfiguration 当前执行版本及冻结配置；旧版本、缺预算或预算耗尽分别给出不可恢复原因。恢复命令仍执行最终授权和账本检查，ACCEPTANCE_LIMIT_REACHED、WORKFLOW_BUDGET_EXHAUSTED、WORKFLOW_NOT_RECOVERABLE 返回 409，不能通过手动恢复重置预算。历史节点 RUNNING 投影继续可读，不作为活动执行证据。

验证见 `tests/integration/RunExecutionHttp.test.ts`、`tests/integration/ProviderVerificationAbort.test.ts`。

## 命令、并发和实时读取

事项状态为 OPEN → ACKNOWLEDGED → RESOLVED。写命令使用 Idempotency-Key 去重；expectedRevision 防止覆盖并发编辑，相同请求重放返回原结果，键冲突或修订冲突返回 409。RETRY 只恢复合法 checkpoint，REGENERATE 创建带父关联的新批次，不能重写既有 Gate 或 publication。

操作中心只能从 `FAILED`、`LOW_CONFIDENCE` 等持久事实投影可处理动作；还需检查当前事项 allowedActions 和 Run 可恢复条件，不能仅凭状态按钮直接调用任意内部阶段。

事件以 event_seq 作为续传游标；失效游标返回 409 CURSOR_EXPIRED 并要求重新读取快照。进度无法证明固定总量时使用 mode=INDETERMINATE，不返回猜测百分比或 ETA。评测规则保持不可变修订，历史绑定无法证明时标为 UNBOUND。

## 设计到指南

治理事项、进度和聚合分别承接历史 DEV-006A、DEV-006B、DEV-006C 的接口范围，当前设计以本文件为准。启动、认证及查询示例见 Operations，界面行为见 UiuxDesign；外部 DSH HTTP 接入同样调用 Application，不另设发布通道。


文档关系：[设计目录](../README.md)负责代码与设计定位；[开发指南](../../Development.md)说明修改和交付步骤。

## 本地发布与固定模块启动

`WP_KNOWLEDGE_NO_LOGIN=1` 显式启用单用户免登录部署，远程也直接编辑。默认直接本机且未配置令牌可编辑；其余远程 `/api/` 请求使用 Bearer 访问令牌。产品路由遵循同一规则，不额外要求本机登录。静态 Console 与 `/health` 可公开读取。所有写操作要求 `Idempotency-Key`，持久收据仅保存命令摘要和脱敏结果。

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

上述工作台路由复用 directEditing / Bearer 边界；免登录仍拒绝跨站浏览器写入。当前未开放通用 JSON 阶段启动入口，后续代码仓界面将通过服务端分析构造其他阶段输入。

`POST /api/v1/associations {versionIds}` 启动冻结卡片的 ASSOCIATE 阶段，沿用阶段状态/取消/恢复和工件下载。`GET /api/v1/associations/:cardId` 读取与当前卡片有关的有效关系、引用证据及失效任务数。未选材料时 scope=INTERNAL_ONLY、externalMaterials=0；选材后 scope=INTERNAL_AND_EXTERNAL。符号提及关系不保证可替代性。

### 五阶段一键执行

- `POST /api/v1/workbench-pipelines {snapshotId, scopes?, materialIds?}`：冻结生成输入并创建或复用knowledge-pipeline-v13协调记录，返回`{pipeline}`，202或已成功时200。
- `GET /api/v1/workbench-pipelines`：读取协调记录列表；`GET /api/v1/workbench-pipelines/:id`返回`pipeline`、当前阶段及历史轮次去重后的`tasks`、累计`usage`及`publicationVerified:false`。
- `POST /api/v1/workbench-pipelines/:id/cancel {}`：取消协调和当前子任务；`POST .../resume {inputDigest}`只恢复同契约输入，累计子任务用量不重置。契约/输入冲突为409，不存在为404。
- 所有入口使用现有匿名部署授权策略，无新增登录。旧契约可读，不能跨契约恢复。逐阶段状态、证据和下载继续复用stage-tasks接口。

### 外部材料快照

`POST /api/v1/external-materials` 接受已登记 `sourceId` 和非空 `applicability`，校验固定来源修订，捕获 UTF-8 文本/Markdown/HTML/JSON（正文上限 2 MiB）；返回 `material`。不搜索、不递归读取链接。`GET /api/v1/external-materials` 返回不可变快照列表，`GET /api/v1/external-materials/:id` 返回材料及转换正文。原始和转换工件保存于 CAS；同修订/条件重复捕获返回相同标识，来源变动需先确认新修订。来源限制沿用既有策略，材料格式/编码/容量错误为 422，不存在为 404。

关联启动 `POST /api/v1/associations` 可附加 `materialIds`（最多32个且不重复），冻结选定快照，返回实际内外部关系数量。候选响应增加 `externalRelations`，不将其当替代卡片。`GET /api/v1/external-materials/:id/artifacts/:sha256` 只下载该快照绑定的原文或转换正文，校验 CAS 后返回附件。

### 行为失败后的重建重试

`POST /api/v1/reconstructions` 可附加 `retryEvaluationTaskId`。必须是同项目、源码、配置和同一卡片集合的已完成失败行为评测；卡片版本允许修订。输入冻结 `native-reconstruction-retry-v1`、原评测输入和结果摘要，改变 Code 尝试身份，阻止复用上一轮失败代码。标识与隐藏报告不交给 Code。非法绑定返回 `RECONSTRUCTION_RETRY_INVALID`。

v4 流程详情返回 `iterations` 与 `activeTaskId`，每轮包含冻结卡片版本、重建/评测/修订任务引用和可信行为进展。`tasks` 与累计用量按任务编号去重。`PIPELINE_NO_BEHAVIOR_PROGRESS`、`PIPELINE_REVISION_QUALITY_REJECTED`、`PIPELINE_REVISION_UNRESOLVED` 保留前序证据并停止后续关联；恢复不清空历史及额度。v3 及更早执行只读。


v5 在已有生成结果存在时，冻结同源码快照内当前后代卡片版本；修订集合进入流程身份。详情 `initialVersionIds` 表示替代原生成版本的冻结集合，首次索引和重建均使用它。重复启动未变输入复用任务；恢复不读取新头。跨源码快照或无有效血缘分别返回409 `PIPELINE_CARD_SNAPSHOT_CHANGED` / `PIPELINE_CARD_LINEAGE_CHANGED`。v4及更早仅可读。


当前修订执行使用 knowledge-revision-v5，流程使用 knowledge-pipeline-v13；v4及更早修订、v12及更早流程只读。Review 材料包含固定参考和生成代码，DocGen 只接收已标准化且绑定当前任务/原输出的纠正意见。前端风险状态仍不允许以未知归因或质量拒绝推进。

修订源码复核拒绝以 `UNRESOLVED` 结果保留 `REVISION_SOURCE_REVIEW_REJECTED` 和 `draftRef`；不产生新版本，不刷新该草稿索引。成功版本 metadata 绑定 `sourceReviewResultRef`，仍不表示发布门禁已通过。

阶段详情 `events` 的 `role-stage-attempt` 记录绑定角色、任务尝试和语义阶段，`artifactRef` 可经同任务 evidence 下载端点读取原输出/校验反馈；别的任务不能仅凭摘要访问。此审计记录不代表角色通过，也不改变旧任务的成功检查点或累计用量。

源码复核的 evaluationReportRef 指向明确标识 PINNED_REFERENCE 的可信参考观察投影；旧生成实现报告仍通过原评测任务读取，两者不得混用。

`POST /api/v1/source-verifications` 接受 `{evaluationTaskId}`，返回202阶段任务。输入必须是成功的普通原生评测；行为通过时也允许启动。读取、取消、同版本恢复和材料下载复用 stage-tasks 接口。结果逐卡返回冻结版本、正文摘要、来源结论和角色证据；publicationVerified 始终为 false。未知来源复核契约不可恢复。

`POST /api/v1/source-revisions` 接受 `{sourceVerificationTaskId}`，返回202独立 FLYWHEEL 任务（KNOWLEDGE_SOURCE_REVISION）。缺少明确来源矛盾返回409；原始角色证据失配拒绝执行。取消、恢复及产物下载沿用 stage-tasks。新版本重建以新版本集合直接启动，不冒充行为失败重试。

当前独立来源执行使用 knowledge-source-verification-v4 与 knowledge-source-revision-v4；v3及更早只读。整卡结果包含逐H2结果与引用，恢复只继续未完成章节。一键v13轮次包含sourceVerification与sourceRepairs，来源未通过不能进入关联；阶段详情包含这些子任务和累计用量。

`POST /api/v1/fixed-evaluations` 接收 reconstructionTaskId 与 suites（每项moduleId/suite），创建 fixed-native-evaluation-v1 独立评测任务。由现有stage-tasks接口读取进度/取消/同版本恢复，覆盖必须等于重建模块全集；参考失败返回质量拒绝，不授予知识或发布结论。免登录规则与其他工作台接口一致。

来源材料 v3 与流程 v11 不跨版本恢复；v2/v10 及更早记录只读。逐章参考报告标明 EXACT_CARD_SECTION 和 DIRECT_BEHAVIOR_EVIDENCE / NO_DIRECT_BEHAVIOR_EVIDENCE，后者不代表该章节已通过源码核验。

仓库分析响应可包含 `buildCandidates[]`：`origin`、`record`、`sourcePath`、`build`、`issues`，来自固定提交编译数据库。它是可审核候选，不自动改变项目快照；项目创建仍校验声明式 `build`。

来源v4冻结priorFindingsRef；继承章节返回carriedForward与originEvidence（原任务、检查点、结果摘要），明确区分既有意见与本次模型执行。旧v3/v11只读。来源修订重新验证历史原命令与冻结证明后才能授权。

一键流程POST可含fixedSuites:[{moduleId,suite}]。suite先冻结CAS，固定子任务在每轮可信评测通过后执行；查询的iterations包含fixedEvaluation并计入tasks/usage。流程v13身份包含固定suite摘要，改用例创建新流程，不能覆盖旧预期。v12只读。固定失败暂停评测且不进入来源/关联。
