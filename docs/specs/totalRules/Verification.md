<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：验收设计与需求追踪。
-->
# 验收设计与需求追踪

本文件集中保存验收场景和需求到实现、测试的映射；UI 场景定义在 [UiuxDesign](UiuxDesign.md)。编号继续用于历史证据，删除旧目录不会删除失败、取消、幂等或材料隔离的验收要求。

`Implemented` 表示已有实现及测试入口；`Partial` 表示只覆盖部分设计；`Planned` 不声明实现或测试。下表是覆盖设计，不是本次执行报告。真实模型效果必须单独记录，Fixture、受控 Provider 和历史 live 范例不能替代当前七角色效果验收。

## 验收场景

| ID | 场景 |
| --- | --- |
| AC-SPEC-001 | Given 本规范集，When 执行 spec lint，Then 每个 SYS/UI/NFR P0 ID 在追踪矩阵中恰有一行且关联验收场景；非 Planned 行的实现和测试路径非空。 |
| AC-SCHEMA-001 | Given 七类 Agent 的合法/非法 fixture 和已冻结的 Run 配置，When 运行真实节点契约边界，Then 合法 AgentCommand/AgentResult 通过，未知字段、缺字段、错误版本和角色错配在 Provider 或下游执行前失败；同一 Run 始终使用启动时的配置快照。 |
| AC-FLOW-001 | Given 一个受支持模块，When 执行 Run，Then 状态按定义顺序完成两条独立生成链并以确定性 Gate 到达终态。 |
| AC-FLOW-002 | Given 一个可归因失败，When Review 完成，Then Correction 含路径、判据、证据，DocGen 仅改影响范围且 Code fresh 重生成。 |
| AC-FLOW-003 | Given critical regression 或预算耗尽，When Gate 决策，Then 分别回滚 historical best 或产生 LOW_CONFIDENCE 治理包。 |
| AC-FLOW-004 | Given 冲突写声明和六个并行 worker，When 规划，Then 冲突在执行前拒绝且同时运行数不超过五。 |
| AC-FLOW-005 | Given DocGen 产出的正文缺少结构或验证证据，When Quality Gate 拒绝候选，Then 本轮不调用 CodeAgent，下一轮 DocGen 收到结构化质量反馈，预算耗尽时转 LOW_CONFIDENCE。 |
| AC-AGENT-001 | Given 全角色能力令牌，When 尝试写知识，Then 只有 DocGen 可创建候选，任何评测/评审写入均拒绝。 |
| AC-AGENT-002 | Given Orchestrator 输出主观 PASS，When 处理结果，Then 该字段因 Schema/权限失败，状态只接受 GateDecision。 |
| AC-SEC-001 | Given CodeAgent 本轮授权卡片与裁剪配置，When 读取原始实现、独立接口文件、参考测试、其他角色/运行文件，或通过绝对路径、路径穿越、符号链接与未授权工具尝试绕过，Then 全部拒绝并记录角色、Run 和原因；向上游材料或整份场景注入相同禁读内容也不能进入模型 Prompt。真实运行必须验证进程隔离，缺少必要隔离不得静默降级。 |
| AC-SEC-002 | Given 矩阵内外访问组合，When 执行权限参数化测试，Then 所有列明动作符合矩阵，未定义组合默认拒绝。 |
| AC-SEC-003 | Given 含源码、密钥和超长输出的任务，When 导出日志，Then 仅保留脱敏摘要/ArtifactRef 且输出受限。 |
| AC-SEC-004 | Given 新检出的仓库没有写入令牌，When 用户打开控制台设置，Then 页面说明如何把 `.env.example` 复制为被忽略的 `.env.local`、配置 `WP_KNOWLEDGE_WRITE_TOKEN` 并重启服务；When 未配置时，所有写接口仍默认拒绝。 |
| AC-EVAL-001 | Given LLM 猜测的错误 expected，When oracle 验证，Then 用例不能进入 Gate Test Set。 |
| AC-EVAL-002 | Given critical 失败、高相似度或五次中一次波动，When Gate，Then 均不能 PASS；报告保留全部重复结果。 |
| AC-EVAL-003 | Given 同一报告，When 审计，Then 能重建输入、测试集、策略、插件、工具链、prompt/model 配置摘要。 |
| AC-PUB-001 | Given Agent 或人工修改的候选，When 请求发布，Then 只有完整 fresh generation + Gate PASS 能原子生成唯一 receipt。 |
| AC-REC-001 | Given 四个崩溃注入点，When 重启恢复，Then 无悬空 Artifact、丢失状态或重复发布。 |
| AC-REC-002 | Given 相同 GenerationKey/发布键并发重试，When 完成，Then 只有一个逻辑生成结果和一个 receipt。 |
| AC-OBS-001 | Given 任一 Run，When 按 runId 导出，Then 状态、模型调用摘要、访问拒绝、Artifact 血缘和 Gate 证据完整。 |
| AC-ARCH-001 | Given 替代假 Provider/Store/Workflow Adapter，When 跑契约套件，Then Domain/Application 不变且测试通过。 |
| AC-ARCH-002 | Given 内嵌 domain-knowledge LangGraph runtime，When 扫描依赖并执行图，Then SDK 只存在于 infrastructure，且 Run、知识、评测和发布事实只写 Knowledge Registry。 |
| AC-ARCH-003 | Given 两个仓库的默认分支，When 检查目录和入口，Then domain-knowledge 拥有唯一运行时、Spec、测试与前台，wpKnowledge 只含知识内容和仓库说明。 |
| AC-ARCH-004 | Given uiApi、八个 Application App 和三个 Domain Service，When 扫描依赖与组合根，Then UI 只调用 App、App 只依赖 Domain/Port、Domain 不导入 SDK/数据库，七个 Agent 节点保持完整，Provider 设置、指标与 Redis 边界不成为第二业务事实源。 |
| AC-OBS-002 | Given 一个自动 Run，When LangGraph 节点开始、完成或失败，Then Console 可按 runId 读取节点、角色、轮次、尝试和时间投影，且不读取 graph checkpoint。 |
| AC-OBS-003 | Given 一个成功或失败的自动 Run，When 执行 `workflow-report --run`，Then 报告按 runId 导出 Registry 事实、脱敏 Agent 摘要并逐一校验引用的 CAS Artifact，且注入审计文件的 Prompt/凭据字段不会出现在报告中。 |
| AC-AGENT-003 | Given 七个固定 Agent，When 查看和修改配置，Then 全部契约可查，只有受信操作者能改 `promptAddon`，任何职责、Schema、拓扑、输入输出或工具字段均拒绝。 |
| AC-LANG-001 | Given 非 C++ 假插件，When 运行发现与标准化契约测试，Then 核心成功且通用消息无 C/C++ 专属字段。 |
| AC-LANG-002 | Given C++ 示例及 CPU/内存/超时/进程树攻击，When 沙箱执行，Then正常结果标准化、超限终止并审计。 |
| AC-COMPAT-001 | Given 旧 Runner 的 init/ingest/query/status/scan/feedback 调用，When 通过兼容入口执行，Then 参数被确定性映射到新 CLI、所有持久状态仅写入同一 SQLite/CAS，已退休且会错误表达发布权威的 score/eval/harvest 调用明确失败。 |
| AC-E2E-001 | Given 场景指定固定 commit 且基线门禁通过的可信项目源码，When 在仓库外隔离副本运行两轮知识驱动再生成，Then 首轮真实测试失败并形成带证据 Correction，第二轮 fresh 生成通过场景要求的全部测试、稳定性与构建检查，最终只发布第二版且 run 审计包含全部节点、评测与发布证据。 |
| AC-E2E-002 | Given 显式可信项目场景，When 内嵌 LangGraph 执行全部 Agent、一次失败迭代和真实项目评测，Then 同一 runId 下保留七类节点投影、两版知识 lineage、PASS decision 和唯一 publication receipt。 |
| AC-E2E-003 | Given 配置好的 DeepSeek Harness AgentProvider 与场景指定的固定源码 commit，When 运行自动治理并从 Agent 输出错误恢复，Then 七类 live Agent 输出均经过 Schema 校验、调用摘要脱敏、质量反馈自动迭代，最终行为证据与发布仍由 Knowledge Gate 决定。 |
| AC-API-001 | Given Preview API 迁移变更，When 扫描 Server、Console、DSH Adapter、测试和文档并执行契约测试，Then 只存在规范资源路径，旧 HTTP 路由返回 404，内部 transition/evaluate/publish 不可通过 HTTP 调用。 |
| AC-API-002 | Given 相同 `type + subject + reasonCode` 的失败事实被重复投影，When 创建并处理待处理事项，Then 同时只有一个非 RESOLVED 事项、重放不重复创建；ACKNOWLEDGE/RESOLVE 严格遵循 revision 和幂等键，RETRY 只恢复可恢复 checkpoint，REGENERATE 创建带 parentRunId 的新批次，既有 GateDecision 和 publication 字节不变。 |
| AC-API-003 | Given 固定七节点、增加迭代和不可证明工作单元三种批次，When 查询进度并从已持久化 event_seq 中断后续传，Then completed/total 可由 snapshot 重建、重试 attempt 不扩大 total、迭代先扩展 total、不可证明计划返回 INDETERMINATE 且无 ETA；SSE 游标之后的持久化事件按序完整到达，过期游标要求重读 snapshot。 |
| AC-API-004 | Given 组件正常、降级、不可用、检查超时和跨批次事件，When 查询组件与活动列表并连接活动 SSE，Then 每项包含稳定状态、reasonCode 与采样时间，UNKNOWN 不显示为健康；活动 ID 可确定性重建、全局 cursor 可续传，响应不包含凭据、Prompt、Session、路径或上游原始错误。Knowledge Health 继续留在 B3，不属于 DEV-006。 |
| AC-API-005 | Given 多版知识及其 Run、Correction、Evaluation 和 publication，When 查询 lineage 与 diff，Then 双向链接完整、Diff 范围可验证且能反向定位对应运行和证据。 |
| AC-API-006 | Given 跨 Run Evaluation 和规则修订，When 查询报告、下载授权证据并更新规则，Then 原报告不可变、秘密不泄露、过期 revision 冲突、新 revision 只影响后续评测且全程可审计。 |
| AC-API-007 | Given 扫描候选、合法来源和越界/漂移来源，When 创建、修改和刷新 Source，Then 只有通过访问校验的候选被持久化，revision 固定，越界默认拒绝，状态和关联统计可复验。 |
| AC-API-008 | Given 一个含并行、迭代和失败 attempt 的 Run，When 打开 Graph 并选择节点，Then 固定七 Agent 的节点与依赖边稳定，状态、iteration、attempt、时间、ArtifactRef 和错误摘要来自 Registry 投影；刷新和 SSE 续传后状态一致，且页面不能读取 checkpoint、修改拓扑或人工推进节点。 |
| AC-API-009 | Given Provider 可用、未认证、过期和故障状态，When 打开 Agent 设置，Then 返回稳定状态、模型、检查时间和受控原因，不返回凭据、会话或提示词，也不能修改固定 Agent 契约。 |
| AC-API-010 | Given 本地管理员提交合法、非法、不可达和受限网络地址的 API URL 与可选 API Key，When 保存、读取和验证 Provider 配置，Then 只有通过地址与权限校验的配置被服务端加密或受限持有，读取只返回脱敏状态，验证无生成副作用；启用后新批次冻结 DSH 原生协议、地址、模型、Token/上下文上限和 Schema 尝试上限的摘要但不冻结完整 Key，恢复时任一非秘密执行参数变化均失败关闭。 |
| AC-OBS-004 | Given 真实与 fixture 批次、重试、自动修订和人工治理事项，When 查询 24 小时与 7/30 天观测窗口，Then 返回有样本量的节点/批次 P50/P95、Token、可空估算成本、首次修订通过率、三轮收敛率、人工介入比例、平均处理时间和短期复发率；无样本或无可信定价源时成本返回空值，任何响应不含 Prompt、正文、凭据、Session 或上游原始错误。 |
| AC-SEARCH-001 | Given 同时存在已发布 VERIFIED、仅 Quality ACCEPTED 的候选、LOW_CONFIDENCE、SUPERSEDED 和缺少发布回执的版本，When 用户经 Application / KnowledgeSearchApp 调用 SearchAgent，Then 仅合法已发布文档能进入 Agent 上下文和结果，且每项包含可验证的版本、provenance 和正文 Artifact 引用；显式请求其他状态或直接读取候选 versionId 同样不能绕过限制。 |
| AC-DOC-001 | Given DocGenAgent 首次生成或按 Correction 修订中文知识，When Orchestrator 发送生成请求并执行 Quality Gate，Then 两轮 Prompt 都包含自然写作约束，模板化填充、无来源宣传词和超长段落会降低 `humanReadability` 并形成 weak point；任何润色都不得改变事实、来源、验收条件或安全边界。 |
| AC-DOC-002 | Given 一个跨层大规模特性，When 准备合入，Then Console、GitHub Pages、工程文档、Spec、追踪矩阵和自动化验收均已更新或在 PR 中明确说明不适用。 |
| AC-DOC-003 | Given 仓库中已跟踪的 Markdown 和关键入口文档，When 执行文档契约测试，Then 每份文档都有中文说明，关键入口包含相邻的结构化 English summary，代码标识符和协议值仍可与源码直接互查。 |
| AC-DOC-004 | Given 官网和控制台，When 检查静态文案、状态标签和运行时投影，Then 除品牌、项目名、`Agent`、API/协议缩写、代码字段、枚举原值和技术标识符外，用户看到的栏目、状态与说明均为自然中文；`Registry` 显示为“注册”，名词 `Run` 显示为“批次”。 |
| AC-CONFIG-001 | Given 两个项目配置、同项目不同场景及知识卡片版本，When 选择项目/场景并启动任务、随后修改配置及恢复旧任务，Then 依赖/构建说明留在项目配置，角色只收到必要字段；同项目只换卡片可复用配置，不同项目使用各自配置；本轮卡片/配置版本与摘要、实际生效场景、可读白名单及输出根目录固定可查，旧任务不随修改漂移，冻结版本不可用则明确失败。 |
| AC-CODE-001 | Given 含公开接口的知识卡片和合法项目配置，When 组装并执行 CodeAgent，Then 无须独立 publicInterfaceRefs 或原仓库接口文件，只接收卡片与裁剪出的 C/C++ 标准、依赖和允许输出路径；不传整份场景、参考测试或答案，完整构建配置仅交执行器，返回包含源码 path/content 的 files 列表。 |
| AC-CODE-002 | Given 合法输出及包含绝对路径、越界、重复、未授权文件或符号链接逃逸的输出，When 框架接收 CodeAgent files，Then 先校验整组再落盘，非法输出不写入源码目录；合法 C/C++ 源码只写本轮隔离输出目录并留工件引用，原业务仓库不变，比较、编译和测试由后续执行器完成。 |

## 需求追踪矩阵

实现和测试路径相对仓库根目录。AC-FLOW-003 的自动回滚、AC-FLOW-004 的完整冲突调度、AC-LANG-002 的 C++ 沙箱、AC-EVAL-001 的候选 oracle 晋升仍按 Partial / Planned 审查，不能根据场景措辞推定已实现。2026-09-10 新确认的 CodeAgent 输入和项目配置目标对应 KF-SYS-044、045，保持 Planned；KF-SYS-003 的现有测试只覆盖部分旧边界，不能证明新增接口隔离与 Prompt 材料裁剪已通过。

| 需求 ID | 验收 | 状态 | 实现 | 测试 |
| --- | --- | --- | --- | --- |
| KF-SYS-001 | AC-FLOW-001 | Partial | `src/application/services/ApplicationServices.ts` | `tests/acceptance/PublicationFlow.test.ts` |
| KF-SYS-002 | AC-AGENT-001 | Planned | — | — |
| KF-SYS-003 | AC-SEC-001 | Partial | `src/domain/workspace` + `src/infrastructure/agentAdapters/deepSeekHarness/IsolationLauncher.mjs` | `tests/security/AgentWorkspace.test.ts` + `tests/integration/DeepseekHarnessAgent.test.ts` |
| KF-SYS-004 | AC-EVAL-001 | Planned | — | — |
| KF-SYS-005 | AC-EVAL-002 | Implemented | `src/infrastructure/evaluation/project` + `src/domain/Domain.ts` | `tests/acceptance/RealSourceFlow.test.ts` |
| KF-SYS-006 | AC-OBS-001 | Implemented | `src/infrastructure/sqlite/SqliteCas.ts` | `tests/integration/SqliteCas.test.ts` |
| KF-SYS-007 | AC-FLOW-002 | Implemented | `src/application/services/ProjectFlow.ts` | `tests/acceptance/RealSourceFlow.test.ts` |
| KF-SYS-008 | AC-FLOW-003 | Partial | `src/domain/Domain.ts` | `tests/unit/Domain.test.ts` |
| KF-SYS-009 | AC-PUB-001 | Implemented | `src/application/services/ApplicationServices.ts` + `src/infrastructure/sqlite/SqliteCas.ts` | `tests/acceptance/PublicationFlow.test.ts` |
| KF-SYS-010 | AC-REC-001 | Partial | `src/application/services/ApplicationServices.ts` + `src/infrastructure/sqlite/SqliteCas.ts` | `tests/integration/SqliteCas.test.ts` |
| KF-SYS-011 | AC-SCHEMA-001 | Implemented | `docs/specs/schemas` + `src/application/ports` + `src/infrastructure/agentAdapters/contracts` + `src/application/services/AutomatedProjectWorkflow.ts` | `scripts/ValidateSpecs.ts` + `tests/integration/AgentContracts.test.ts` + `tests/acceptance/AutomatedLanggraphFlow.test.ts` |
| KF-SYS-012 | AC-LANG-001 | Implemented | `src/application/ports/ApplicationPorts.ts` | `tests/contract/Architecture.test.ts` |
| KF-SYS-013 | AC-SEC-002 | Partial | `src/interfaces/runner/Server.ts` | `tests/integration/Server.test.ts` |
| KF-SYS-014 | AC-LANG-002 | Planned | — | — |
| KF-SYS-015 | AC-AGENT-002 | Partial | `src/domain/Domain.ts` | `tests/unit/Domain.test.ts` |
| KF-SYS-016 | AC-COMPAT-001 | Implemented | `src/interfaces/runner/Cli.ts` + `src/domain/migration` | `tests/integration/LegacyRunnerCompat.test.ts` |
| KF-SYS-017 | AC-E2E-001 | Implemented | `src/application/services/ProjectFlow.ts` + `src/infrastructure/evaluation/project` | `tests/acceptance/RealSourceFlow.test.ts` |
| KF-SYS-018 | AC-DOC-001 | Implemented | `src/application/services/KnowledgeWritingGuide.ts` + `src/application/services/QualityPolicy.ts` + `src/application/services/ProjectFlow.ts` | `tests/unit/QualityPolicy.test.ts` + `tests/acceptance/RealSourceFlow.test.ts` |
| KF-SYS-019 | AC-ARCH-002 | Implemented | `src/infrastructure/langgraph` + `src/interfaces/runner/Composition.ts` | `tests/contract/Architecture.test.ts` + `tests/integration/LanggraphInfrastructure.test.ts` |
| KF-SYS-020 | AC-OBS-002 | Implemented | `src/application/services/WorkflowControl.ts` + `src/interfaces/runner/ConsoleReadModel.ts` | `tests/integration/LanggraphInfrastructure.test.ts` + `tests/acceptance/AutomatedLanggraphFlow.test.ts` |
| KF-SYS-021 | AC-AGENT-003 | Implemented | `src/domain/workflow/AgentDefinitions.ts` + `src/application/services/WorkflowControl.ts` + `web/App.js` | `tests/integration/Server.test.ts` + `tests/contract/Site.test.ts` |
| KF-SYS-022 | AC-E2E-002 | Implemented | `src/application/services/AutomatedProjectWorkflow.ts` + `src/infrastructure/langgraph/Graph.ts` | `tests/acceptance/AutomatedLanggraphFlow.test.ts` |
| KF-SYS-023 | AC-DOC-002 | Implemented | `web` + `site` + `docs` + `docs/specs` | `tests/contract/Site.test.ts` + `tests/contract/ComponentLayout.test.ts` |
| KF-SYS-024 | AC-DOC-003 | Implemented | `docs/specs/totalRules/CodeTaste.md` + `README.md` + `CONTRIBUTING.md` | `tests/contract/ComponentLayout.test.ts` + `tests/contract/Site.test.ts` |
| KF-SYS-025 | AC-E2E-003 | Implemented | `src/infrastructure/agentAdapters/deepSeekHarness` + `src/application/services/AutomatedProjectWorkflow.ts` | `tests/integration/DeepseekHarnessAgent.test.ts` + `tests/integration/OpencodeGoConfig.test.ts` |
| KF-SYS-026 | AC-FLOW-005 | Implemented | `src/application/services/AutomatedProjectWorkflow.ts` + `src/infrastructure/langgraph/Graph.ts` | `tests/integration/LanggraphInfrastructure.test.ts` |
| KF-SYS-027 | AC-OBS-003 | Implemented | `src/interfaces/runner/DemoReport.ts` + `src/interfaces/runner/Cli.ts` | `tests/integration/DemoReport.test.ts` |
| KF-SYS-028 | AC-DOC-004 | Implemented | `site/index.html` + `site/App.js` + `web/index.html` + `web/App.js` | `tests/contract/Site.test.ts` |
| KF-SYS-029 | AC-SEC-004 | Implemented | `.env.example` + `package.json` + `web/App.js` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-SYS-030 | AC-ARCH-003 | Implemented | `docs/HistoryEpitaph.md` + `docs/specs/totalRules/Architecture.md` | `tests/contract/ComponentLayout.test.ts` |
| KF-SYS-031 | AC-ARCH-004 | Implemented | `src/domain` + `src/application/apps` + `src/interfaces/uiApi` + `src/infrastructure/redis` | `tests/contract/Architecture.test.ts` + `tests/unit/DddDomainServices.test.ts` + `tests/integration/RedisRuntimeState.test.ts` |
| KF-SYS-032 | AC-API-001 | Implemented | `src/interfaces/runner/Server.ts` + `src/interfaces/dsh/Dsh.ts` + `web/App.js` | `tests/integration/Server.test.ts` + `tests/integration/DshAdapter.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-033 | AC-API-002 | Partial | `src/application/services/ApplicationServices.ts` + `src/infrastructure/sqlite/SqliteActionItems.ts` + `src/infrastructure/sqlite/SqliteCas.ts` + `src/infrastructure/sqlite/SqliteContentGovernance.ts` + `src/interfaces/runner/Server.ts` + `web/App.js` | `tests/integration/Server.test.ts` + `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-034 | AC-API-003 | Implemented | `src/interfaces/runner/ConsoleReadModel.ts` + `src/interfaces/runner/Server.ts` + `web/App.js` | `tests/integration/Server.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-035 | AC-API-004 | Implemented | `src/interfaces/runner/ConsoleReadModel.ts` + `src/infrastructure/sqlite/SqliteContentGovernance.ts` + `src/interfaces/runner/Server.ts` + `web/App.js` | `tests/integration/Server.test.ts` + `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-036 | AC-API-005 | Implemented | `src/domain/knowledge/MarkdownDiff.ts` + `src/infrastructure/sqlite/SqliteContentGovernance.ts` + `src/interfaces/runner/Server.ts` + `web/App.js` | `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-037 | AC-API-006 | Implemented | `src/application/apps/ContentGovernanceApp.ts` + `src/infrastructure/sqlite/SqliteContentGovernance.ts` + `src/interfaces/runner/Server.ts` + `web/App.js` | `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-038 | AC-API-007 | Implemented | `src/infrastructure/sqlite/SqliteContentGovernance.ts` + `src/interfaces/runner/Server.ts` + `web/App.js` | `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-039 | AC-API-008 | Implemented | `src/application/services/WorkflowControl.ts` + `src/interfaces/runner/ConsoleReadModel.ts` + `web/App.js` | `tests/integration/Server.test.ts` + `tests/acceptance/AutomatedLanggraphFlow.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-040 | AC-API-009 | Implemented | `src/application/apps/ProviderOperationsApp.ts` + `src/interfaces/runner/Server.ts` + `web/App.js` | `tests/integration/ProviderObservability.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-041 | AC-API-010 | Implemented | `src/application/apps/ProviderOperationsApp.ts` + `src/infrastructure/agentAdapters/deepSeekHarness` + `src/interfaces/runner/Composition.ts` + `web/App.js` | `tests/security/ProviderSettings.test.ts` + `tests/integration/DshConfiguredProvider.test.ts` + `tests/acceptance/DshConfiguredFlow.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-042 | AC-OBS-004 | Implemented | `src/application/apps/OperationalMetricsApp.ts` + `src/infrastructure/observability/SqliteOperationalMetrics.ts` + `web/App.js` | `tests/integration/OperationalMetrics.test.ts` + `tests/integration/ProviderObservability.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-043 | AC-SEARCH-001 | Planned | — | — |
| KF-SYS-044 | AC-CONFIG-001 | Planned | — | — |
| KF-SYS-045 | AC-CODE-001、AC-CODE-002 | Planned | — | — |
| KF-UI-001 | AC-UI-001 | Implemented | `web/App.js` + `src/interfaces/runner/Server.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-002 | AC-UI-002 | Implemented | `web/App.js` + `src/interfaces/runner/ConsoleReadModel.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-003 | AC-UI-003 | Implemented | `src/application/services/AutomatedProjectWorkflow.ts` + `web/App.js` | `tests/acceptance/AutomatedLanggraphFlow.test.ts` + `tests/contract/Site.test.ts` |
| KF-UI-004 | AC-UI-004 | Implemented | `web/App.js` | `tests/contract/Site.test.ts` |
| KF-UI-005 | AC-UI-005 | Implemented | `web/App.js` + `src/infrastructure/sqlite/SqliteContentGovernance.ts` | `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-UI-006 | AC-UI-006 | Implemented | `web/App.js` + `src/infrastructure/sqlite/SqliteCas.ts` | `tests/integration/Server.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-UI-007 | AC-UI-007 | Implemented | `web/App.js` + `src/interfaces/runner/Server.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-008 | AC-UI-008 | Partial | `web/App.js` + `src/interfaces/runner/Server.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-009 | AC-UI-009 | Implemented | `src/domain/knowledge/MarkdownDiff.ts` + `web/App.js` | `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-UI-010 | AC-UI-010 | Implemented | `web/App.js` + `src/interfaces/runner/Server.ts` | `tests/integration/Server.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-UI-011 | AC-UI-011 | Implemented | `web/App.js` + `src/application/apps/KnowledgeSearchApp.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-012 | AC-UI-012 | Implemented | `web/index.html` + `web/Styles.css` + `web/App.js` | `tests/contract/Site.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-UI-013 | AC-UI-013 | Implemented | `web/App.js` + `web/Styles.css` + `site/App.js` | `tests/contract/Site.test.ts` |
| KF-UI-014 | AC-UI-014 | Implemented | `web/App.js` + `src/domain/workflow/AgentDefinitions.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-015 | AC-UI-015 | Implemented | `web/App.js` + `src/interfaces/runner/Server.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-016 | AC-UI-016 | Implemented | `web/App.js` + `src/interfaces/runner/ConsoleReadModel.ts` | `tests/contract/Site.test.ts` + `tests/acceptance/AutomatedLanggraphFlow.test.ts` |
| KF-UI-017 | AC-UI-017 | Implemented | `web/index.html` + `web/App.js` + `site/index.html` + `site/App.js` | `tests/contract/Site.test.ts` |
| KF-UI-018 | AC-UI-018 | Implemented | `.env.example` + `web/App.js` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-019 | AC-UI-019 | Implemented | `web/index.html` + `web/Styles.css` + `web/App.js` | `tests/contract/Site.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-UI-020 | AC-UI-023 | Planned | — | — |
| KF-UI-021 | AC-UI-024 | Implemented | `src/application/apps/ProviderOperationsApp.ts` + `src/infrastructure/agentAdapters/deepSeekHarness` + `web/App.js` | `tests/security/ProviderSettings.test.ts` + `tests/integration/ProviderObservability.test.ts` + `tests/acceptance/DshConfiguredFlow.test.ts` + `tests/e2e/Console.spec.ts` |
| NFR-001 | AC-SEC-002 | Partial | `src/interfaces/runner/Server.ts` | `tests/integration/Server.test.ts` |
| NFR-002 | AC-REC-001 | Partial | `src/application/services/ApplicationServices.ts` + `src/infrastructure/sqlite/SqliteCas.ts` | `tests/integration/SqliteCas.test.ts` |
| NFR-003 | AC-REC-002 | Implemented | `src/application/services/ApplicationServices.ts` + `src/infrastructure/sqlite/SqliteCas.ts` | `tests/integration/SqliteCas.test.ts` + `tests/acceptance/PublicationFlow.test.ts` |
| NFR-004 | AC-OBS-001 | Partial | `src/infrastructure/sqlite/SqliteCas.ts` | `tests/acceptance/PublicationFlow.test.ts` |
| NFR-005 | AC-ARCH-001 | Implemented | `src/domain` + `src/application/ports` | `tests/contract/Architecture.test.ts` |
| NFR-006 | AC-SCHEMA-001 | Partial | `docs/specs/schemas` + `src/infrastructure/agentAdapters/contracts` + `src/infrastructure/sqlite/SqliteCas.ts` | `scripts/ValidateSpecs.ts` + `tests/contract/SpecValidator.test.ts` + `tests/integration/AgentContracts.test.ts` |
| NFR-007 | AC-LANG-002 | Planned | — | — |
| NFR-008 | AC-EVAL-003 | Implemented | `src/domain/Domain.ts` + `src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts` | `tests/acceptance/RealSourceFlow.test.ts` |
| NFR-009 | AC-SEC-003 | Partial | `src/infrastructure/agentAdapters/deepSeekHarness` + `src/infrastructure/agentAdapters/companyCodeAgent` + `src/interfaces/runner/DemoReport.ts` | `tests/integration/DeepseekHarnessAgent.test.ts` + `tests/integration/CompanyCodeagentCli.test.ts` + `tests/integration/DemoReport.test.ts` |
| NFR-010 | AC-FLOW-004 | Planned | — | — |
| NFR-011 | AC-E2E-001 | Implemented | `src/application/services/ProjectFlow.ts` + `src/infrastructure/sqlite/SqliteCas.ts` | `tests/acceptance/RealSourceFlow.test.ts` |
| NFR-012 | AC-UI-012 | Implemented | `web/index.html` + `web/Styles.css` + `web/App.js` | `tests/contract/Site.test.ts` + `tests/e2e/Console.spec.ts` |

## 执行方式

正常变更依次执行 `npm run typecheck`、`npm run validate:specs`、相关测试、完整回归和受影响 Console 检查。规范校验脚本位于 `scripts/ValidateSpecs.ts`，保留 Schema 正反例、引用、需求唯一性和追踪证据存在性校验。测试路径存在不代表当前通过，实际结果见 [当前状态](../../Status.md)。
