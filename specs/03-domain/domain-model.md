# 领域模型

## 聚合与值对象

| 类型 | 关键字段 | 不变量 |
|---|---|---|
| `FlywheelRun` | runId, policyId, state, iteration, bestVersionId | 状态只能按工作流转换；iteration 不回退。 |
| `Module` | moduleId, languageId, sourceSnapshotRef, publicInterfaceRefs | `languageId` 是不透明字符串；不含 AST。 |
| `ArtifactRef` | artifactId, mediaType, sha256, size | 内容不可变；ID 与摘要绑定。 |
| `KnowledgeVersion` | versionId, moduleId, parentVersionId, bodyRef, provenance[], status | 发布版本有完整来源和通过的 gateDecisionId。 |
| `EvaluationReport` | reportId, inputRefs, toolchainFingerprint, criticalResults, testSummary, stability | 原始证据不可被 Agent 修改。 |
| `Correction` | correctionId, knowledgePath, criterion, evidenceRefs[] | 三字段均非空；只能由 Review 输出、DocGen 消费。 |
| `GateDecision` | decisionId, outcome, reasonCodes[], evidenceRefs[] | outcome 由确定性策略计算。 |
| `ActionItem` | actionItemId, type, severity, status, fingerprint, subjectRefs[], evidenceRefs[], createdAt | 由服务端事实确定性产生；相同 fingerprint 的开放事项不得重复；处理动作只追加历史。 |
| `Source` | sourceId, kind, locator, revision, status, accessPolicyRef, lastSyncAt | locator 与凭据分离；revision 可复验；刷新不直接产生 VERIFIED 知识。 |
| `EvaluationRule` | ruleId, revision, scope, config, enabled | revision 不可变；修改创建新 revision，不覆盖历史评测所引用的版本。 |
| `KnowledgeRelation` | relationId, fromVersionId, toNodeId, relationType, evidenceRefs[], confidenceBasis | 关系必须可追溯至版本和证据；confidenceBasis 不接受 Agent 自评分。 |

`RunProgress`、`SystemComponentHealth`、`ActivityEntry`、`KnowledgeHealthSnapshot`、`EvaluationSummary` 和 `GraphProjection` 是从上述聚合、事件与审计记录生成的只读投影，不是新的写侧事实源。

## 枚举

- RunState：`CREATED, PLANNED, GENERATING, EVALUATING, REVIEWING, ITERATING, ROLLING_BACK, PUBLISHING, VERIFIED, LOW_CONFIDENCE, FAILED, CANCELLED`。
- GateOutcome：`PASS, ITERATE, ROLLBACK, STOPPED`。
- KnowledgeStatus：`CANDIDATE, VERIFIED, LOW_CONFIDENCE, SUPERSEDED`。
- ActionItemStatus：`OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED`。
- ActionItemSeverity：`LOW, MEDIUM, HIGH, CRITICAL`。
- SourceStatus：`ACTIVE, DEGRADED, STALE, DISABLED`。

## Console 最终能力的所有权与计算规则

| 能力 | 权威输入 | 规则 |
|---|---|---|
| Action Item | Run、GateDecision、EvaluationReport、AccessDenied、Source 状态 | 产生规则由 Domain Service 版本化；resolve/dismiss 不删除原始证据。 |
| Run progress | 冻结 Run plan、节点投影、attempt | `completedUnits / totalUnits` 只统计启动时可枚举的工作单元；重试增加 attempt，不增加 completedUnits；未知总量返回阶段而非百分比。 |
| ETA | 同 profile 的历史完成样本 | 样本不足、执行计划变化或重试中返回 `null`；前台不得自行估算。 |
| Activity | 领域事件与审计事件 | 按 `(occurredAt, eventId)` 稳定排序，依据调用者权限过滤。 |
| Knowledge Health | KnowledgeVersion、Source、EvaluationReport | 每个指标必须返回 numerator、denominator、窗口、样本时间与规则版本；无分母返回 unavailable，不返回 0。 |
| Evaluation 列表 | 不可变 EvaluationReport 与 GateDecision | 读模型不得修改原报告；Rule revision 必须可回溯。 |
| Source health | Source revision、刷新任务和访问结果 | 扫描候选只有持久化并验证访问边界后才成为 Source。 |
| Graph | KnowledgeRelation 与 KnowledgeVersion | 图只是可重建投影；边必须含 relationType 与 evidenceRefs，查询必须限制 depth 和节点数。 |
| Provider status | Provider Adapter 的受控探针 | 只暴露 available/auth state/model/checkedAt/reasonCode，不暴露 token、session 或 Prompt。 |

## 领域事件

`RunCreated, NodeStarted, ArtifactCommitted, EvaluationCompleted, CorrectionProposed, GateDecided, KnowledgePublished, RunTerminated, AccessDenied` 共用 `event.schema.json` 信封。事件至少包含 eventId、eventType、schemaVersion、runId、occurredAt、causationId、payload。

## 纯净核心规则

核心中不得出现 DSH session/tool 类型、LangGraph state、Temporal workflow handle、GLM response、数据库 row、C/C++ AST、编译命令或头文件结构。上述信息只能作为 Adapter 私有类型，转成这里的值对象或 ArtifactRef。
