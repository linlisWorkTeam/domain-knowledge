<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明Knowledge Flywheel 规范集。
-->
# Knowledge Flywheel 规范集

**规范状态：Accepted｜版本：1.8.0｜基线日期：2026-09-04**

本目录是 domain-knowledge 的唯一规范性事实源。`KF-SYS-*` 与 `KF-UI-*` 使用独立命名空间，避免与历史实现中的需求编号冲突。本文档定义需求、产品、架构、领域、工作流、Agent 契约、评测、安全与验收；需求级实现状态由追踪矩阵明确标记，项目阶段、当前任务和后续顺序统一从[开发状态](../docs/DEVELOPMENT-STATUS.md)查看。关键词“必须 / 不得 / 应当 / 可以”分别表示强制、禁止、推荐和可选。

<details lang="en">
<summary>English summary</summary>

This directory is the normative source for Knowledge Flywheel behavior. Requirements use stable `KF-SYS-*`, `KF-UI-*`, and `NFR-*` identifiers and must map to acceptance criteria, implementation units and tests. LangGraph controls execution; domain-knowledge remains authoritative for business state, evidence, publication gates and `VERIFIED` knowledge.

</details>

## 目录树与用途

以下按当前仓库结构列出目录与文件，行尾注释说明用途；新增、移动或删除文档时同步更新。规范按主题组织，单项功能变更使用 `changes/active/` 下的目录与模板。

```text
specs/                                                                      # 规范性事实源：需求、行为、契约与验收
├── README.md                                                               # 规范入口、阅读顺序与规范规则
├── glossary.md                                                             # 统一领域术语与缩写
├── 01-requirements/                                                        # 系统功能需求与非功能约束
│   ├── non-functional-requirements.md                                      # 非功能需求
│   └── system-requirements.md                                              # 系统需求
├── 02-architecture/                                                        # 系统边界、外部依赖与架构视图
│   ├── 4plus1-views.md                                                     # 4+1 架构视图
│   └── system-context.md                                                   # 系统上下文
├── 03-domain/                                                              # 领域实体、值对象、状态与规则
│   └── domain-model.md                                                     # 领域模型
├── 04-product/                                                             # 前台产品设计、交互与页面验收要求
│   └── frontend-product-design.md                                          # 知识飞轮前台产品设计
├── 05-workflows/                                                           # 工作流、用户时序、恢复与真实源码验收
│   ├── checkpoint-and-recovery.md                                          # Checkpoint 与恢复
│   ├── knowledge-flywheel-workflow.md                                      # 知识飞轮工作流
│   ├── real-source-acceptance.md                                           # 真实源码验收工作流
│   └── user-use-cases.md                                                   # 用户用例与交互时序
├── 06-agents/                                                              # Agent 职责、输入输出与协作约束
│   ├── README.md                                                           # Agent 规范索引与固定节点、定制边界
│   ├── code-and-check-agents.md                                            # CodeAgent 与 CheckAgent 的代码生成、检查职责
│   ├── documentation-agents.md                                             # DocGenAgent 与 DocWorkerAgent 的知识生产职责
│   ├── knowledge-writing-style.md                                          # 知识正文写作规则与质量检查要求
│   ├── orchestration-agents.md                                             # OrchestratorAgent 的编排职责与约束
│   ├── review-agent.md                                                     # ReviewAgent 的评审与修订指令
│   ├── search-agent.md                                                     # SearchAgent 的已发布知识检索设计（待实现）
│   └── test-generation-agent.md                                            # TestGenAgent 的测试生成职责
├── 07-language-plugins/                                                    # 语言检测、插件契约与 C++ 插件规范
│   ├── cpp-plugin.md                                                       # C++ 语言插件
│   ├── language-detection.md                                               # 语言检测
│   └── language-plugin-contract.md                                         # 语言插件契约
├── 08-evaluation/                                                          # 确定性评测模型与知识发布门禁
│   ├── evaluation-model.md                                                 # 评测模型
│   └── knowledge-publication-gate.md                                       # 知识发布门禁
├── 09-security/                                                            # 数据安全、信任边界与隔离约束
│   └── data-boundaries.md                                                  # 数据边界与权限矩阵
├── 10-interfaces/                                                          # HTTP 接口、路由及实现映射
│   └── http-api.md                                                         # Preview HTTP API 规范
├── 13-verification/                                                        # 验收场景、需求追踪与规范校验工具
│   ├── acceptance-plan.md                                                  # 验收场景、阶段门与评审清单
│   ├── traceability-matrix.md                                              # 需求到验收、实现、测试的映射与状态
│   ├── traceability-validator.ts                                           # 检查追踪矩阵的状态、列格式与实现及测试路径
│   └── validate-specs.ts                                                   # 校验 Schema、契约夹具、文档链接与追踪矩阵
├── adr/                                                                    # 架构决策及其背景、后果与取代关系
│   ├── README.md                                                           # 架构决策索引与维护约定
│   ├── ADR-001-typescript-hexagonal-core.md                                # TypeScript 平台与六边形边界
│   ├── ADR-002-langgraph-workflow.md                                       # LangGraph V1 编排与可替换端口
│   ├── ADR-003-artifact-handoffs.md                                        # Artifact 交接与内容寻址
│   ├── ADR-004-deterministic-gate.md                                       # 确定性评测和发布权分离
│   ├── ADR-005-standard-protocols.md                                       # 标准协议与 Adapter
│   ├── ADR-006-embedded-domain-knowledge-infrastructure.md                 # 内嵌 domain-knowledge 基础设施
│   ├── ADR-007-ddd-layered-source-layout.md                                # 按领域驱动设计收敛源码目录
│   ├── ADR-008-reserve-rollback-state.md                                   # 回滚能力显式降级
│   ├── ADR-009-repository-split.md                                         # 运行仓库与知识仓库分离
│   ├── ADR-010-application-domain-service-boundaries.md                    # Application App 与 Domain Service 边界
│   └── ADR-011-agent-contract-and-run-configuration-snapshot.md            # Agent 运行契约与 Run 配置快照
├── changes/                                                                # 功能变更提案、实施计划与验收证据
│   ├── active/                                                             # 当前变更与新建变更模板
│   │   ├── DEV-019-dsh-agent-foundation/                                   # DSH 公共底座与角色开发变更
│   │   │   ├── acceptance.md                                               # 验收场景、步骤与完成判据
│   │   │   ├── evidence.md                                                 # 验证命令、结果、证据与未验证边界
│   │   │   ├── plan.md                                                     # 技术实施计划、阶段与退出条件
│   │   │   ├── proposal.md                                                 # 变更背景、目标、范围与风险
│   │   │   ├── spec-delta.md                                               # 本次规范增量与受影响边界
│   │   │   └── tasks.md                                                    # 可执行任务列表与完成状态
│   │   └── DEV-xxx-feature/                                                # 新功能变更模板，复制后替换编号与主题
│   │       ├── acceptance.md                                               # 验收场景、步骤与完成判据
│   │       ├── evidence.md                                                 # 验证命令、结果、证据与未验证边界
│   │       ├── plan.md                                                     # 技术实施计划、阶段与退出条件
│   │       ├── proposal.md                                                 # 变更背景、目标、范围与风险
│   │       ├── spec-delta.md                                               # 本次规范增量与受影响边界
│   │       └── tasks.md                                                    # 可执行任务列表与完成状态
│   └── archive/                                                            # 已归档变更存放处（当前仅占位文件）
│       └── .gitkeep                                                        # 让 Git 保留空的归档目录
└── schemas/                                                                # 可机器校验的 JSON Schema 数据契约
    ├── README.md                                                           # Schema 索引、版本规则与校验方式
    ├── action-item.schema.json                                             # 持久化治理事项
    ├── activity.schema.json                                                # 跨批次脱敏活动
    ├── agent-command.schema.json                                           # 全部 Agent 输入信封与角色 payload
    ├── agent-result.schema.json                                            # 全部 Agent 输出信封
    ├── artifact-ref.schema.json                                            # 不可变 Artifact 引用
    ├── component-status.schema.json                                        # 固定组件健康状态
    ├── correction.schema.json                                              # Review → DocGen 修订指令
    ├── evaluation-report.schema.json                                       # 确定性评测报告
    ├── evaluation-rule.schema.json                                         # 不可变评测规则 revision
    ├── evaluation-summary.schema.json                                      # 跨批次评测读模型
    ├── event.schema.json                                                   # 领域事件信封
    ├── knowledge-diff.schema.json                                          # 结构化 Markdown 差异与范围校验
    ├── knowledge-health.schema.json                                        # 带口径与样本范围的知识健康度
    ├── knowledge-lineage.schema.json                                       # 知识版本血缘与反向关系
    ├── language-plugin.schema.json                                         # 插件能力、请求和标准化结果
    ├── run-progress.schema.json                                            # 可证明批次进度
    └── source.schema.json                                                  # 持久化来源注册（不含凭据正文）
```

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

2026-09-08 新增 [SearchAgent 设计](06-agents/search-agent.md)及 `KF-SYS-043`：目标为七个飞轮角色加一个独立检索角色，Application 直接调度 SearchAgent，只读取治理后已发布的 `VERIFIED` 文档，不经过 OrchestratorAgent / LangGraph。该能力为 Planned；已有七角色枚举、Run 信封和批次图规则仍只适用于飞轮。调用流程见 [Agent 治理与检索关系](05-workflows/knowledge-flywheel-workflow.md#agent-治理与检索关系)。

2026-09-07 确认的后续方向为 LangGraph 编排、DSH 直接运行角色，先完成外部底座与 CPU 小模块范例，再开发七角色完整闭环；CodeAgent CLI 适配后置。变更提案见 [DEV-019](changes/active/DEV-019-dsh-agent-foundation/proposal.md)。R1 已实现默认 DSH、通用场景输入和旧 Pi 只读兼容，相关 baseline 随实现同步；范围与证据见 `spec-delta.md` 和 `evidence.md`。R2 live 范例已通过本地验收（PR #26 待审查）；R3/R4 完整闭环尚未验收。

P0-A Spec 已 Accepted；这只表示需求、契约和验收基线可进入实现验证，不代表 P0-B 或生产能力已经完成。P0-B 的当前实现范围、验证证据、下一工作项和未测边界统一记录在[开发状态](../docs/DEVELOPMENT-STATUS.md)，本规范入口不再维护一份会随开发变化的平行进度摘要。

需求级状态仍以[追踪矩阵](13-verification/traceability-matrix.md)为准。Application App、Domain Service、固定七 Agent、LangGraph 与持久化的约束分别由 ADR-006、ADR-010、ADR-011 和对应验收场景定义，不因进度文档调整而改变。

前台交付 F1–F5 与系统实施 Phase 1–4 是两条独立编号轴。B1–B4 已完成实现与自动门禁；F2 已由用户按当前版本验收，HCP-1=`Accepted`，最终七页信息架构与 UI/UX 已冻结，F3–F5 已接入对应服务端事实。F1 八入口结构只作为历史记录，不再具有设计效力。原型中的模拟 Health、ETA、Activity、Action Item、Workspace 与用户身份不构成产品能力；Graph 只允许展示注册中的真实 Agent 节点投影，新增后端或领域语义必须另行通过 Spec 对齐。
