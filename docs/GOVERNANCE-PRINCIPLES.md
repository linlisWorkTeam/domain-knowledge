# 工程治理原则

## 唯一事实源

- 产品行为：`specs/`
- 项目进度：`docs/DEVELOPMENT-STATUS.md`
- 需求实现状态：`specs/13-verification/traceability-matrix.md`
- 架构决策：`specs/adr/`
- 运行时业务事实：SQLite Registry
- 知识正文和研究证据：`wpKnowledge`

## 单一实现原则

不得建立第二套 Registry、Workflow、Gate 或发布路径，也不得恢复已经废弃的 Runner 包装目录。

## 状态真实性

`Implemented` 必须有代码和自动化验证；`Partial` 和 `Planned` 不得表达为已完成。Deterministic fixture 证明框架链路，不等于真实模型质量；不得手工把 `CANDIDATE` 改为 `VERIFIED`。

## 变更同步

行为变化至少同步 Spec、实现、测试和追踪矩阵；影响使用、开发、运维或项目阶段时，还要同步对应文档和开发状态。

## Agent 与执行边界

Agent 输入输出遵循 JSON Schema，大对象通过 ArtifactRef 传递；外部命令限制路径、环境、权限、超时和输出；不受信代码执行能力未完成前必须 fail closed。
