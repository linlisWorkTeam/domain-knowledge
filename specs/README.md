# Knowledge Flywheel 规范集

**规范状态：Accepted｜版本：1.7.2｜基线日期：2026-09-03**

本目录是 domain-knowledge 的唯一规范性事实源。`KF-SYS-*` 与 `KF-UI-*` 使用独立命名空间，避免与历史实现中的需求编号冲突。本文档定义需求、产品、架构、领域、工作流、Agent 契约、评测、安全与验收；需求级实现状态由追踪矩阵明确标记，项目阶段、当前任务和后续顺序统一从[开发状态](../docs/DEVELOPMENT-STATUS.md)查看。关键词“必须 / 不得 / 应当 / 可以”分别表示强制、禁止、推荐和可选。

<details lang="en">
<summary>English summary</summary>

This directory is the normative source for Knowledge Flywheel behavior. Requirements use stable `KF-SYS-*`, `KF-UI-*`, and `NFR-*` identifiers and must map to acceptance criteria, implementation units and tests. LangGraph controls execution; domain-knowledge remains authoritative for business state, evidence, publication gates and `VERIFIED` knowledge.

</details>

## 阅读顺序与目录

1. [术语表](glossary.md)
2. [系统需求](01-requirements/system-requirements.md)与[非功能需求](01-requirements/non-functional-requirements.md)
3. [系统上下文](02-architecture/system-context.md)与[4+1 视图](02-architecture/4plus1-views.md)
4. [领域模型](03-domain/domain-model.md)
5. [前台产品设计](04-product/frontend-product-design.md)
6. [知识飞轮工作流](05-workflows/knowledge-flywheel-workflow.md)、[用户用例与交互时序](05-workflows/user-use-cases.md)、[断点恢复](05-workflows/checkpoint-and-recovery.md)与[真实源码验收](05-workflows/real-source-acceptance.md)
7. [Agent 规范](06-agents/README.md)、[知识写作风格](06-agents/knowledge-writing-style.md)、[语言插件](07-language-plugins/language-plugin-contract.md)、[评测与发布门禁](08-evaluation/evaluation-model.md)
8. [数据边界](09-security/data-boundaries.md)与 [Preview HTTP API](10-interfaces/http-api.md)
9. [验收计划](13-verification/acceptance-plan.md)和[追踪矩阵](13-verification/traceability-matrix.md)
10. [ADR](adr/README.md)与可机器校验的 [JSON Schema](schemas/README.md)

## 规范规则

- 需求 ID 永不复用；废弃需求保留 ID 并标为 `Retired`。
- 所有 P0 需求必须映射至少一个 `AC-*` 验收场景、一个计划实现单元和一个测试。
- `KF-UI-*` 与系统和非功能需求使用同一追踪矩阵及机器校验规则；视觉原型不得绕过领域状态或 API 能力边界。
- Console 的规范性 HTTP 路由、实现映射和页面缺口只在 [Preview HTTP API](10-interfaces/http-api.md)维护；产品文档只引用，不复制平行清单。
- Agent 交接只使用 `schemas/` 中的 JSON Schema；Markdown、源码等大对象通过不可变 Artifact 引用传递。
- 领域核心只认识 `LanguageId`、Artifact 与端口，不包含 C/C++ AST、编译器选项或 DSH SDK 类型。
- `Accepted` 文档不得含阻塞性占位标记；待实验项必须有明确默认行为，并记录为 P0-B Spike 假设。
- Spec、实现、验收 fixture、测试与运维文档必须位于 domain-knowledge；知识正文、研究和运行证据保存在独立 wpKnowledge 仓库。

## 阶段门

P0-A Spec 已 Accepted；这只表示需求、契约和验收基线可进入实现验证，不代表 P0-B 或生产能力已经完成。P0-B 的当前实现范围、验证证据、下一工作项和未测边界统一记录在[开发状态](../docs/DEVELOPMENT-STATUS.md)，本规范入口不再维护一份会随开发变化的平行进度摘要。

需求级状态仍以[追踪矩阵](13-verification/traceability-matrix.md)为准。Application App、Domain Service、固定七 Agent、LangGraph 与持久化的约束分别由 ADR-006、ADR-010、ADR-011 和对应验收场景定义，不因进度文档调整而改变。

前台交付 F1–F5 与系统实施 Phase 1–4 是两条独立编号轴。B1 已完成实现与自动门禁；F2 首轮 HCP-1=`Rework required`，视觉返工通过复验前不得进入 B2/B3 前台接线。原型中的模拟 Health、ETA、Activity、Action Item、Workspace 与用户身份不构成产品能力；Graph 只允许展示 Registry 中的真实 Agent 节点投影，新增后端或领域语义必须另行通过 Spec 对齐。
