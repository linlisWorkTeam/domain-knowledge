# 术语表

| 术语 | 稳定定义 |
|---|---|
| Artifact | 内容寻址、不可变的运行产物；由 `artifactId`、媒体类型、SHA-256 和存储引用标识。 |
| Candidate Knowledge | 尚未通过发布门禁的知识版本。 |
| Checkpoint | 在确定性节点边界持久化的工作流状态快照，不等于正在运行的进程。 |
| Core Gate Test Set | 跨轮稳定、用于可比评分和关键行为门禁的测试集。 |
| Correction | ReviewAgent 产生的可执行修订指令，包含 ID、`knowledgePath`、判据和证据。 |
| GenerationKey | `runId + moduleId + iteration + agentType + promptHash + modelConfigHash` 的幂等键。 |
| Knowledge Version | 带来源、父版本、状态和验证结果的不可变知识版本。 |
| Language Plugin | 把特定语言的发现、构建、执行、覆盖率能力接入核心端口的适配器。 |
| Oracle | 经参考实现真实执行验证的期望行为，禁止由 LLM 猜测后直接进入门禁。 |
| Run | 一次知识飞轮执行实例，拥有稳定 `runId`。 |
| Verification Score | 由确定性证据组合而成的知识质量结果；不等于测试通过率，不由 LLM 自评。 |
| historical best | 当前 Run 中按稳定 Core Gate 证据选出的最佳已验证候选。 |
| LOW_CONFIDENCE | 预算耗尽或停滞后仍不满足门禁、必须转人工治理的终态。 |

领域枚举的规范拼写见[领域模型](03-domain/domain-model.md)；同一术语在 Agent、工作流和事件 Schema 中不得另造同义状态。
