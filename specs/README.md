# Knowledge Flywheel 规范集

**状态：Accepted（P0-A）+ P0-B 实现中｜版本：1.3.0｜基线日期：2026-09-01**

本目录是 domain-knowledge 的唯一规范性事实源。`KF-SYS-*` 使用独立命名空间，避免与历史实现中的需求编号冲突。本文档定义需求、产品、架构、领域、工作流、Agent 契约、评测、安全与验收；实现进度由追踪矩阵明确标记。关键词“必须 / 不得 / 应当 / 可以”分别表示强制、禁止、推荐和可选。

<details lang="en">
<summary>English summary</summary>

This directory is the normative source for Knowledge Flywheel behavior. Requirements use stable `KF-SYS-*` and `NFR-*` identifiers and must map to acceptance criteria, implementation units and tests. LangGraph controls execution; domain-knowledge remains authoritative for business state, evidence, publication gates and `VERIFIED` knowledge.

</details>

## 阅读顺序与目录

1. [术语表](glossary.md)
2. [系统需求](01-requirements/system-requirements.md)与[非功能需求](01-requirements/non-functional-requirements.md)
3. [系统上下文](02-architecture/system-context.md)与[4+1 视图](02-architecture/4plus1-views.md)
4. [领域模型](03-domain/domain-model.md)
5. [前台产品设计](04-product/frontend-product-design.md)
6. [知识飞轮工作流](05-workflows/knowledge-flywheel-workflow.md)、[用户用例与交互时序](05-workflows/user-use-cases.md)、[断点恢复](05-workflows/checkpoint-and-recovery.md)与[真实源码验收](05-workflows/real-source-acceptance.md)
7. [Agent 规范](06-agents/README.md)、[知识写作风格](06-agents/knowledge-writing-style.md)、[语言插件](07-language-plugins/language-plugin-contract.md)、[评测与发布门禁](08-evaluation/evaluation-model.md)
8. [数据边界](09-security/data-boundaries.md)、[验收计划](13-verification/acceptance-plan.md)和[追踪矩阵](13-verification/traceability-matrix.md)
9. [ADR](adr/README.md)与可机器校验的 [JSON Schema](schemas/README.md)

## 规范规则

- 需求 ID 永不复用；废弃需求保留 ID 并标为 `Retired`。
- 所有 P0 需求必须映射至少一个 `AC-*` 验收场景、一个计划实现单元和一个测试。
- Agent 交接只使用 `schemas/` 中的 JSON Schema；Markdown、源码等大对象通过不可变 Artifact 引用传递。
- 领域核心只认识 `LanguageId`、Artifact 与端口，不包含 C/C++ AST、编译器选项或 DSH SDK 类型。
- `Accepted` 文档不得含阻塞性占位标记；待实验项必须有明确默认行为，并记录为 P0-B Spike 假设。
- Spec、实现、验收 fixture、测试与运维文档必须位于 domain-knowledge；知识正文、研究和运行证据保存在独立 wpKnowledge 仓库。

## 阶段门

P0-A Spec 已进入实现验证。当前 P0-B 已落地纯领域边界、Artifact CAS、SQLite Registry、幂等业务副作用、确定性 Gate、原子发布、旧 OKF 迁移、产品控制台和 DSH 查询适配器。LangGraph 已按 ADR-006 以内嵌 `domain-knowledge` infrastructure 接入；默认 Provider 仍是 deterministic fixture，live 路径已切换到 DeepSeek Harness 官方 stdio JSON-RPC SDK，并为七个角色建立文件白名单工作区。Linux 上的 Bubblewrap 会让代码生成角色看不到参考源码，Prompt 也不再进入 argv。Headless 样例完成过候选质量 65→98、295/295 独立评测与发布；官方 SDK 样例完成了失败恢复、1/1 确定性评测、唯一发布和 12/12 工件校验。这里的 `code` 是图节点角色，不是独立的 CodeAgent CLI；一次成功样例也不能外推为模型稳定性。敌对代码执行沙箱、完整权限拒绝审计与四点崩溃注入仍待完成。
