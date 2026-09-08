<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：总体需求与交付范围。
-->
# 总体需求与交付范围

系统把显式项目材料转为可复验的知识候选，通过独立评测和确定性发布形成可查询的知识版本。代码位于 `src/domain/`、`src/application/`、`src/infrastructure/`、`src/interfaces/`，前台位于 `web/`，项目网站位于 `site/`。

这里保留已有需求 ID，作为评审和历史证据的稳定坐标。需求表达应达到的行为，当前覆盖程度由 [验收追踪](Verification.md) 的 Implemented / Partial / Planned 列明。Implemented 表示已有实现和对应测试文件，不表示每次文档提交都重新执行过测试。

## 当前设计边界

- 七角色统一入口，各角色拥有材料契约、提示词、模型调用步骤及结果转换；Application 负责加载和提交。
- Domain Workflow 定义跨角色流转，LangGraph 执行固定图，DSH 执行角色内部授权工具。
- 质量合格、行为门禁通过和已发布是三个不同事实；候选不能通过模型自评或人工标记成为 VERIFIED。
- 对外只开放用例级动作；运行状态、知识版本、评测和回执只有一套业务存储。
- LanguagePlugin、C++ 专用插件、SearchAgent 及完整 oracle 晋升流程尚未实现，详见对应模块设计。回滚枚举为兼容保留，当前 Gate 不产生自动回滚决定。

## 功能需求

| ID | 优先级 | 需求 | 验收场景 |
| --- | --- | --- | --- |
| KF-SYS-001 | P0 | 系统必须以确定性工作流编排源码分析、知识生成、测试生成、代码生成、检查、评测、归因、修订与发布。 | AC-FLOW-001 |
| KF-SYS-002 | P0 | DocGenAgent 必须是知识正文的唯一自动执笔者；评测者不得修改知识或实现。 | AC-AGENT-001 |
| KF-SYS-003 | P0 | CodeAgent 必须只读取知识、公开接口和自己的工作区，不能读取参考源码或门禁测试。 | AC-SEC-001 |
| KF-SYS-004 | P0 | TestGenAgent 的候选 oracle 必须由参考源码真实执行验证后才能进入门禁集。 | AC-EVAL-001 |
| KF-SYS-005 | P0 | EvalRunner 必须执行编译、稳定测试和关键行为门禁；相似度只能用于归因。 | AC-EVAL-002 |
| KF-SYS-006 | P0 | 每轮必须产出不可变 Artifact、血缘、事件和评测证据，并能按 `runId` 审计。 | AC-OBS-001 |
| KF-SYS-007 | P0 | 门禁失败时 ReviewAgent 必须输出可定位、可验证、有证据的 Correction，随后只增量修订受影响知识。 | AC-FLOW-002 |
| KF-SYS-008 | P0 | 系统必须保留 historical best；关键回归立即回滚，停滞或预算耗尽转 `LOW_CONFIDENCE`。 | AC-FLOW-003 |
| KF-SYS-009 | P0 | 仅满足知识发布门禁的版本可成为 `VERIFIED`；人工修改也必须重新生成代码并走完整门禁。 | AC-PUB-001 |
| KF-SYS-010 | P0 | 工作流必须支持进程退出后的 checkpoint 恢复，所有外部副作用必须按幂等键去重。 | AC-REC-001 |
| KF-SYS-011 | P0 | Agent 输入输出必须逐一匹配版本化 JSON Schema；Schema 校验失败不得调度下游。 | AC-SCHEMA-001 |
| KF-SYS-012 | P0 | 核心必须通过语言插件端口支持语言能力；语言专属结构不得进入核心领域或通用 Agent 契约。 | AC-LANG-001 |
| KF-SYS-013 | P0 | 系统必须执行完整的主体×资源×动作权限矩阵，未列出的访问默认拒绝并留审计事件。 | AC-SEC-002 |
| KF-SYS-014 | P0 | V1 必须提供 C++ 插件，完成发现、构建、测试执行、超时和资源限制结果的标准化。 | AC-LANG-002 |
| KF-SYS-015 | P0 | OrchestratorAgent 只负责计划、委派和汇总；当前支持的 `pass/iterate/stopped` 必须由确定性门禁规则决定。回滚状态只为兼容迁移保留，不属于当前 Gate 能力。 | AC-AGENT-002 |
| KF-SYS-016 | P0 | 根目录 `fw.mjs` 必须作为旧命令的兼容层保留；兼容层不得维护第二套知识状态、评分权威或写入路径。 | AC-COMPAT-001 |
| KF-SYS-017 | P0 | 发布前必须以固定 commit 的真实可运行源码完成一次可复验闭环：参考门禁通过、首轮生成失败、Review 产生 Correction、DocGen 增量修订、CodeAgent fresh 再生成、独立 EvalRunner 全门禁通过、确定性发布并可按 runId 审计。 | AC-E2E-001 |
| KF-SYS-018 | P1 | DocGenAgent 生成中文知识时必须遵循面向工程师的自然写作约束：直接说明结论和适用条件，用具体证据代替宣传或模糊归因，并保留术语、限定条件与不确定性；Quality Gate 应报告模板腔和超长段落，但文风不得覆盖事实、Schema 或行为门禁。 | AC-DOC-001 |
| KF-SYS-019 | P0 | LangGraph 必须以内嵌 infrastructure 模块运行；domain-knowledge 的 Domain/Application 与 Knowledge Registry 是 Run、知识版本、评测和发布的唯一运行时事实源。 | AC-ARCH-002 |
| KF-SYS-020 | P0 | 每个 LangGraph Agent 节点必须向 Console 投影状态、轮次、尝试次数和时间；前台不得直接读取 graph checkpoint 数据库。 | AC-OBS-002 |
| KF-SYS-021 | P0 | 系统必须展示全部 Agent 的固定职责、输入、输出和基础提示词，并只允许受信操作者修改追加提示词；拓扑、职责、Schema 和工具权限不得由前台替换。 | AC-AGENT-003 |
| KF-SYS-022 | P0 | 通用自动工作流以版本化场景声明项目材料、允许生成路径和测试命令；固定项目仅作为显式验收数据。不同目录和模块使用同一业务接线，验证节点可观察、失败迭代、真实项目评测与 KnowledgeVersion 原子发布。历史场景不成为默认生产输入。 | AC-E2E-002 |
| KF-SYS-023 | P1 | 大规模特性变更必须同时评估并更新 Console、GitHub Pages、工程文档、Spec、追踪矩阵和验收证据。 | AC-DOC-002 |
| KF-SYS-024 | P1 | 仓库解释性文档必须以中文为主；项目目标、快速启动、架构边界、安全限制和贡献入口等关键内容必须提供结构化 English summary，代码标识符和协议值保持源码拼写。 | AC-DOC-003 |
| KF-SYS-025 | P0 | LangGraph 编排业务节点，DSH 独占角色模型、会话与工具运行；节点通过业务端口传入命令和授权材料，输出通过闭合 JSON Schema 后才能写入 CAS。调用审计关联任务/session，不保存密钥或 Prompt 正文；不得另建通用 Agent 运行框架。 | AC-E2E-003 |
| KF-SYS-026 | P0 | 候选知识未通过 Quality Gate 时，系统必须跳过 CodeAgent，把 score、signals 和 weak points 自动反馈给下一轮 DocGen；不得把内容质量失败误报为基础设施终态。 | AC-FLOW-005 |
| KF-SYS-027 | P0 | 每次治理 Run 必须可导出脱敏 Demo 报告，覆盖业务状态、全部节点尝试、KnowledgeVersion、评测、Gate、发布、事件、Checkpoint、Agent 调用摘要和 Artifact 完整性；不得导出 Prompt 正文、模型正文、Session 日志或凭据。 | AC-OBS-003 |
| KF-SYS-028 | P1 | 官网和控制台的用户可见文案必须使用自然、统一的中文；除固定标题 `WORKPANEL · KNOWLEDGE FLYWHEEL` 外，不得使用中英文拼接的栏目名、状态名或说明句。源码标识符、项目名、命令和环境变量作为技术值原样保留。 | AC-DOC-004 |
| KF-SYS-029 | P0 | 本地服务必须提供可提交的写入令牌配置样例、默认忽略的本地配置文件和页面内配置说明；未配置时继续默认拒绝写入，但必须告诉用户如何启用并重启服务。 | AC-SEC-004 |
| KF-SYS-030 | P0 | 运行代码、Spec、测试和前台必须只在 domain-knowledge 演进；wpKnowledge 只能保存知识正文、研究、设计、证据与索引，不得保留可运行副本。 | AC-ARCH-003 |
| KF-SYS-031 | P0 | UI/API 必须只通过 Orchestrator、Flywheel、EvalRunner、KnowledgeSearch、KnowledgeDiscovery、ContentGovernance、ProviderOperations 和 OperationalMetrics Application App 进入系统；领域规则由 Flywheel、EvalRunner 和 Association Domain Service 持有，LangGraph、Provider SDK、秘密持有、数据库与 Redis 实现只能位于 Infrastructure。 | AC-ARCH-004 |
| KF-SYS-032 | P1 | Preview HTTP API 必须按 system、runs、knowledge、evaluations、sources、graph、agents 资源分组；迁移必须原子更新 Server、Console、DSH Adapter、测试和文档，首个 Release 前不得保留旧路由别名。 | AC-API-001 |
| KF-SYS-033 | P1 | 系统必须提供持久化 Action Item 治理能力，能够从运行、评测、来源和安全事实确定性地产生、去重、处理和审计事项；治理动作不得改写既有 GateDecision 或 publication。 | AC-API-002 |
| KF-SYS-034 | P1 | Run 必须提供可证明的进度、合法重试和可断线续传的实时事件；无法从固定工作单元计算时不得输出百分比或 ETA。 | AC-API-003 |
| KF-SYS-035 | P1 | 系统必须提供分组件健康、跨 Run Activity 和有明确数据口径的 Knowledge Health；模型自评或无样本范围的聚合不得成为产品指标。 | AC-API-004 |
| KF-SYS-036 | P1 | KnowledgeVersion 必须可查询版本血缘、结构化 Diff 和带 provenance 的关系，且能反向定位 Run、Correction、Evaluation 与 publication。 | AC-API-005 |
| KF-SYS-037 | P1 | 系统必须提供跨 Run Evaluation 读模型、证据查询和版本化 Evaluation Rule 管理；规则修改必须校验权限并保留不可变审计历史。 | AC-API-006 |
| KF-SYS-038 | P1 | 系统必须提供持久化 Source Registry，管理来源身份、固定版本、同步状态、漂移、刷新任务、访问边界及其与知识的关联。 | AC-API-007 |
| KF-SYS-039 | P1 | Console 必须为选定 Run 提供只读 Agent 工作流执行图，使用 Knowledge Registry 中的固定拓扑、WorkflowNodeProjection、Run snapshot 与事件展示节点状态、轮次、尝试和时间；不得读取 graph checkpoint、修改拓扑或人工推进节点。 | AC-API-008 |
| KF-SYS-040 | P1 | Agent Settings 必须能够读取 Provider 可用性、认证状态、模型标识和受控错误摘要，但不得返回凭据或允许修改固定 Agent 契约。 | AC-API-009 |
| KF-SYS-041 | P1 | 本地管理员必须能通过服务端安全配置、脱敏读取并无副作用验证模型 API URL 与 API Key；启用后新批次默认使用 DSH 原生 SDK；运行中配置冻结，旧 Pi Run 可读但不跨后端恢复，完整凭据不得进入浏览器持久化、URL、日志或运行快照。 | AC-API-010 |
| KF-SYS-042 | P1 | 系统必须按批次、节点、Provider 和模型记录排队与执行耗时、调用与重试、Token、可空估算成本、自动修订收敛和人工治理处理数据，并提供 P50/P95 聚合；缺少可信定价源时成本必须为 `null`，指标不得包含凭据、Prompt、模型正文或未脱敏上游错误。 | AC-OBS-004 |
| KF-SYS-043 | P1 | 用户检索必须由 Application 的 KnowledgeSearchApp 直接调度 SearchAgent，不经过 OrchestratorAgent 或 LangGraph，不创建或推进 FlywheelRun。Agent 只能读取和返回经飞轮治理、原子发布、当前状态为 VERIFIED 且正文完整性有效的文档及授权元数据；结果包含版本、来源和 Artifact 引用，无命中不得自动生成知识或启动治理。 | AC-SEARCH-001 |

## 非功能需求

以下约束由各职责模块落实，不再建立独立 security 章节。角色材料范围见 Agents 和 Workspace；凭据和网络行为见对应 Adapter；HTTP 写入约束见接口设计。资源隔离或权限矩阵的未完成部分保留 Partial / Planned 状态。

| ID | 优先级 | 可测约束 | 验收场景 |
| --- | --- | --- | --- |
| NFR-001 | P0 | 安全：默认拒绝；越权、路径穿越、符号链接逃逸和网络访问均失败且记录主体、资源、原因。 | AC-SEC-002 |
| NFR-002 | P0 | 可恢复：任一持久化节点边界后杀进程，恢复不得丢失已提交 Artifact，也不得重复发布。 | AC-REC-001 |
| NFR-003 | P0 | 幂等：相同 GenerationKey 和发布键重复提交仅产生一个逻辑结果。 | AC-REC-002 |
| NFR-004 | P0 | 可审计：所有状态转换、权限拒绝、模型调用、Artifact 血缘和门禁决定可按 runId 导出。 | AC-OBS-001 |
| NFR-005 | P0 | 可移植：更换模型、Agent runtime、Artifact Store 或编排器只修改对应 Adapter，不修改领域实体。 | AC-ARCH-001 |
| NFR-006 | P0 | Schema 兼容：事件和命令包含 `schemaVersion`；首个 Release 前的 Preview 变更可以在同一原子提交中同步修改 v1 Schema、生产者、消费者、fixture、迁移与测试，首个 Release 后的破坏性变化必须升主版本并提供迁移器。 | AC-SCHEMA-001 |
| NFR-007 | P0 | 资源治理：每个 Agent/构建/测试具有可配置 wall time、CPU、内存、输出大小和并发上限；超限为结构化失败。 | AC-LANG-002 |
| NFR-008 | P0 | 可复现：评测报告记录工具链、插件、测试集、模型配置、prompt 与输入 Artifact 的摘要。 | AC-EVAL-003 |
| NFR-009 | P0 | 隐私：日志不得包含源码正文、密钥或完整 prompt；敏感 Artifact 按边界授权。 | AC-SEC-003 |
| NFR-010 | P0 | 本地 V1 在 5 个并行 worker 上限内不得因并发产生同路径写冲突；冲突必须在调度前拒绝。 | AC-FLOW-004 |
| NFR-011 | P0 | 真实源码验收必须记录仓库 URL、本地路径、commit、脏状态、运行时版本、逐条 argv、退出码、截断后的 stdout/stderr 摘要与完整证据 Artifact 摘要；验收不得依赖修改原工作区。 | AC-E2E-001 |
| NFR-012 | P1 | 控制台必须支持键盘导航、可见焦点、语义名称、非纯颜色状态表达、WCAG AA 文字对比度和 200% 缩放下的核心读取路径；默认页面资源必须同源提供。 | AC-UI-012 |

需求变化需要同时更新模块设计、对应实现和验收追踪，不能只修改本表。运行及接入方式见 [快速开始](../../GettingStarted.md)。
