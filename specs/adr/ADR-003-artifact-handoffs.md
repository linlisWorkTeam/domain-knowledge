# ADR-003：Artifact 交接与内容寻址

- 状态：Accepted
- 日期：2026-08-31

## 决策

Agent 间只传 Schema 消息和不可变 ArtifactRef；Artifact 以 SHA-256 内容寻址、校验后原子提交，大正文不进 checkpoint。

## 后果

交接可审计、去重、恢复且避免上下文隐式共享；需实现垃圾回收和引用完整性检查。
