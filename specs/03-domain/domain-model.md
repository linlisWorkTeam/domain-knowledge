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

## 枚举

- RunState：`CREATED, PLANNED, GENERATING, EVALUATING, REVIEWING, ITERATING, ROLLING_BACK, PUBLISHING, VERIFIED, LOW_CONFIDENCE, FAILED, CANCELLED`。
- GateOutcome：`PASS, ITERATE, ROLLBACK, STOPPED`。
- KnowledgeStatus：`CANDIDATE, VERIFIED, LOW_CONFIDENCE, SUPERSEDED`。

## 领域事件

`RunCreated, NodeStarted, ArtifactCommitted, EvaluationCompleted, CorrectionProposed, GateDecided, KnowledgePublished, RunTerminated, AccessDenied` 共用 `event.schema.json` 信封。事件至少包含 eventId、eventType、schemaVersion、runId、occurredAt、causationId、payload。

## 纯净核心规则

核心中不得出现 DSH session/tool 类型、LangGraph state、Temporal workflow handle、GLM response、数据库 row、C/C++ AST、编译命令或头文件结构。上述信息只能作为 Adapter 私有类型，转成这里的值对象或 ArtifactRef。
