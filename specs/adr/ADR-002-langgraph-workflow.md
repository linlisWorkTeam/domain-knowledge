# ADR-002：LangGraph V1 编排与可替换端口

- 状态：Superseded by ADR-006
- 日期：2026-08-31

## 决策

本 ADR 最初把 LangGraph StateGraph/SQLite Checkpointer 作为候选 Adapter。架构隔离、图执行与固定场景验证完成后，具体采用方式先由 [ADR-006](ADR-006-embedded-domain-knowledge-infrastructure.md) 接替，随后由 [ADR-009](ADR-009-repository-split.md) 将完整运行时收口到 domain-knowledge。

## 后果

原有不变量继续有效：领域和应用契约不绑定工作流 SDK，节点副作用必须幂等，GraphState 不能取代 Artifact 完整性、事件审计、GenerationKey 去重和原子发布约束。
