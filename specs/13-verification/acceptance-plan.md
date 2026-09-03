# P0 验收计划

所有场景使用 Given/When/Then，可自动化场景为发布阻塞项。

验收场景对应的用户目标、参与者边界、成功/失败分支和接口入口见[用户用例与交互时序](../05-workflows/user-use-cases.md)。

| ID | 场景 |
|---|---|
| AC-SPEC-001 | Given 本规范集，When 执行 spec lint，Then 每个 SYS/UI/NFR P0 ID 在追踪矩阵中恰有一行且关联验收场景；非 Planned 行的实现和测试路径非空。 |
| AC-SCHEMA-001 | Given 七类 Agent 的合法/非法 fixture 和已冻结的 Run 配置，When 运行真实节点契约边界，Then 合法 AgentCommand/AgentResult 通过，未知字段、缺字段、错误版本和角色错配在 Provider 或下游执行前失败；同一 Run 始终使用启动时的配置快照。 |
| AC-FLOW-001 | Given 一个受支持模块，When 执行 Run，Then 状态按定义顺序完成两条独立生成链并以确定性 Gate 到达终态。 |
| AC-FLOW-002 | Given 一个可归因失败，When Review 完成，Then Correction 含路径、判据、证据，DocGen 仅改影响范围且 Code fresh 重生成。 |
| AC-FLOW-003 | Given critical regression 或预算耗尽，When Gate 决策，Then 分别回滚 historical best 或产生 LOW_CONFIDENCE 治理包。 |
| AC-FLOW-004 | Given 冲突写声明和六个并行 worker，When 规划，Then 冲突在执行前拒绝且同时运行数不超过五。 |
| AC-FLOW-005 | Given DocGen 产出的正文缺少结构或验证证据，When Quality Gate 拒绝候选，Then 本轮不调用 CodeAgent，下一轮 DocGen 收到结构化质量反馈，预算耗尽时转 LOW_CONFIDENCE。 |
| AC-AGENT-001 | Given 全角色能力令牌，When 尝试写知识，Then 只有 DocGen 可创建候选，任何评测/评审写入均拒绝。 |
| AC-AGENT-002 | Given Orchestrator 输出主观 PASS，When 处理结果，Then 该字段因 Schema/权限失败，状态只接受 GateDecision。 |
| AC-SEC-001 | Given CodeAgent 会话，When 读取源码、门禁测试、旧实现、路径穿越或符号链接，Then 全部拒绝并产生 AccessDenied。 |
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
| AC-ARCH-004 | Given uiApi、五个 Application App 和三个 Domain Service，When 扫描依赖与组合根，Then UI 只调用 App、App 只依赖 Domain/Port、Domain 不导入 SDK/数据库，七个 Agent 节点保持完整，Redis 边界不成为第二业务事实源。 |
| AC-OBS-002 | Given 一个自动 Run，When LangGraph 节点开始、完成或失败，Then Console 可按 runId 读取节点、角色、轮次、尝试和时间投影，且不读取 graph checkpoint。 |
| AC-OBS-003 | Given 一个成功或失败的自动 Run，When 执行 `workflow-report --run`，Then 报告按 runId 导出 Registry 事实、脱敏 Agent 摘要并逐一校验引用的 CAS Artifact，且注入审计文件的 Prompt/凭据字段不会出现在报告中。 |
| AC-AGENT-003 | Given 七个固定 Agent，When 查看和修改配置，Then 全部契约可查，只有受信操作者能改 `promptAddon`，任何职责、Schema、拓扑、输入输出或工具字段均拒绝。 |
| AC-LANG-001 | Given 非 C++ 假插件，When 运行发现与标准化契约测试，Then 核心成功且通用消息无 C/C++ 专属字段。 |
| AC-LANG-002 | Given C++ 示例及 CPU/内存/超时/进程树攻击，When 沙箱执行，Then正常结果标准化、超限终止并审计。 |
| AC-COMPAT-001 | Given 旧 Runner 的 init/ingest/query/status/scan/feedback 调用，When 通过兼容入口执行，Then 参数被确定性映射到新 CLI、所有持久状态仅写入同一 SQLite/CAS，已退休且会错误表达发布权威的 score/eval/harvest 调用明确失败。 |
| AC-E2E-001 | Given 固定 commit 且基线门禁通过的 ohMyWorkPanel 源码，When 在仓库外隔离副本运行两轮知识驱动再生成，Then 首轮真实测试失败并形成带证据 Correction，第二轮 fresh 生成通过前端全测、生产构建与 Rust 全测，最终只发布第二版且 run 审计包含全部节点、评测与发布证据。 |
| AC-E2E-002 | Given 固定 ohMyWorkPanel 场景，When 内嵌 LangGraph 执行全部 Agent、一次失败迭代和真实项目评测，Then 同一 runId 下保留七类节点投影、两版知识 lineage、PASS decision 和唯一 publication receipt。 |
| AC-E2E-003 | Given 配置好的 DeepSeek Harness AgentProvider 与固定 ohMyWorkPanel commit，When 运行自动治理并从 Agent 输出错误恢复，Then 七类 live Agent 输出均经过 Schema 校验、调用摘要脱敏、质量反馈自动迭代，最终行为证据与发布仍由 Knowledge Gate 决定。 |
| AC-API-001 | Given Preview API 迁移变更，When 扫描 Server、Console、DSH Adapter、测试和文档并执行契约测试，Then 只存在规范资源路径，旧 HTTP 路由返回 404，内部 transition/evaluate/publish 不可通过 HTTP 调用。 |
| AC-API-002 | Given 来自 Run、Evaluation、Source 或安全事件的相同问题，When 重放事件并处理 Action Item，Then 开放事项按 fingerprint 去重，合法动作追加审计，重复 Command 幂等，既有 GateDecision 和 publication 字节不变。 |
| AC-API-003 | Given 固定与不可预知两种 Run plan，When 查询进度、重试并中断后续传事件，Then 固定计划返回可重建 completed/total，不可预知计划不返回虚假百分比或 ETA，重试语义合法且 SSE 不重不漏。 |
| AC-API-004 | Given 组件故障、无健康样本和跨 Run 事件，When 查询组件、Activity 和 Knowledge Health，Then 状态含采样时间与 reason code，健康指标含分子/分母/窗口/规则版本，无样本返回 unavailable。 |
| AC-API-005 | Given 多版知识及其 Run、Correction、Evaluation 和 publication，When 查询 lineage 与 diff，Then 双向链接完整、Diff 范围可验证且能反向定位对应运行和证据。 |
| AC-API-006 | Given 跨 Run Evaluation 和规则修订，When 查询报告、下载授权证据并更新规则，Then 原报告不可变、秘密不泄露、过期 revision 冲突、新 revision 只影响后续评测且全程可审计。 |
| AC-API-007 | Given 扫描候选、合法来源和越界/漂移来源，When 创建、修改和刷新 Source，Then 只有通过访问校验的候选被持久化，revision 固定，越界默认拒绝，状态和关联统计可复验。 |
| AC-API-008 | Given 一个含并行、迭代和失败 attempt 的 Run，When 打开 Graph 并选择节点，Then 固定七 Agent 的节点与依赖边稳定，状态、iteration、attempt、时间、ArtifactRef 和错误摘要来自 Registry 投影；刷新和 SSE 续传后状态一致，且页面不能读取 checkpoint、修改拓扑或人工推进节点。 |
| AC-API-009 | Given Provider 可用、未认证、过期和故障状态，When 打开 Agent Settings，Then 返回稳定状态、模型、检查时间和受控原因，不返回凭据/Session/Prompt，也不能修改固定 Agent 契约。 |

## P1 内容质量验收

| ID | 场景 |
|---|---|
| AC-DOC-001 | Given DocGenAgent 首次生成或按 Correction 修订中文知识，When Orchestrator 发送生成请求并执行 Quality Gate，Then 两轮 Prompt 都包含自然写作约束，模板化填充、无来源宣传词和超长段落会降低 `humanReadability` 并形成 weak point；任何润色都不得改变事实、来源、验收条件或安全边界。 |
| AC-DOC-002 | Given 一个跨层大规模特性，When 准备合入，Then Console、GitHub Pages、工程文档、Spec、追踪矩阵和自动化验收均已更新或在 PR 中明确说明不适用。 |
| AC-DOC-003 | Given 仓库中已跟踪的 Markdown 和关键入口文档，When 执行文档契约测试，Then 每份文档都有中文说明，关键入口包含相邻的结构化 English summary，代码标识符和协议值仍可与源码直接互查。 |
| AC-DOC-004 | Given 官网和控制台，When 检查静态文案、状态标签和运行时投影，Then 除固定标题 `WORKPANEL · KNOWLEDGE FLYWHEEL` 以及代码、命令、项目名和协议标识符外，用户看到的栏目、状态与说明均为自然中文。 |

## 前台交付 F1 验收门

UI 验收场景的规范正文以[前台产品设计的 AC-UI-001 至 AC-UI-019](../04-product/frontend-product-design.md#121-验收场景)为准，本节只定义本阶段发布门，避免复制场景后产生漂移。

- 操作中心指标和治理条目必须来自 `/api/v1/status`、`/api/v1/runs` 及其最新 GateDecision；不得出现原型演示值。
- Run 工作台必须区分 FlywheelRun 业务状态和 WorkflowNodeProjection 执行状态，Evaluation 和 Gate 数据从 Run snapshot 读取。
- Knowledge 查询、详情、状态、quality、provenance 和 feedback 使用现有 API；`CANDIDATE` 不得显示为已发布。
- 无 token、错误 token、有效 token 和写 API 未配置必须呈现不同状态，治理 token 只能驻留页面内存。
- 深浅主题、键盘导航、Drawer 焦点、Escape 关闭、焦点恢复、200% 缩放和移动端核心读取路径必须通过浏览器契约验证。
- 页面不得加载第三方字体、脚本或样式，不得因视觉改版放宽 Content Security Policy。
- API 空结果、部分失败和完全失败必须进入 Empty、Partial 或 Error 状态，不得回退到模拟 Health、ETA、Graph、Action Item、Activity、Workspace 或用户身份。
- 浏览器契约入口为 `npm run test:ui`，使用临时 Registry 和 Chromium 验证上述前台门禁，不复用开发者正在运行的工作目录或服务数据。

## Preview HTTP API 迁移验收门

规范性目标路由和页面缺口以 [Preview HTTP API 规范](../10-interfaces/http-api.md)为准。开始实现任一 `Available / Rename`、`Available / Redefine` 或 `Planned` 接口时，必须同时满足：

- Server、Console、DSH Adapter、契约测试和文档使用同一条规范路径，不保留 Preview 旧路由别名；
- 简单知识查询收敛到 `GET /api/v1/knowledge?q=...`，不得重新增加 `/knowledge/query` 或根级 `/query`；
- 公共 HTTP 不暴露 transition、evaluate、publish 等内部 Application App；
- 列表分页、Command 幂等、认证错误分类、reason code 和审计关联符合通用约束；
- 未实现能力在前台保持 Static Preview、Partial、Disabled 或 Planned 表达，不得通过假响应通过验收。

## HCP-1 最终页面与 API 边界人工检查门

F2 可访问环境和 B1 API 迁移 diff 都已准备后、B2/B3 前台接线开始前，产品用户必须完成一次人工检查：

- 七个最终页面均可导航，桌面、移动端、深色和浅色主路径可验收；
- Action Center 的治理入口、Runs 的业务/执行状态、Knowledge Preview、Evaluations/Sources 的 Partial 边界和 Agent Settings 的可编辑范围表达正确；
- Graph 展示选定 Run 的真实固定 Agent 拓扑与节点投影，不是 Knowledge Graph，不读取 checkpoint，也没有编辑拓扑或人工推进节点的控件；
- 每个动态区域都能指出服务端 API、公开派生规则或明确未接状态，任何失败路径都不回退到演示数据；
- B1 新旧路由映射、删除范围以及 Console/DSH Adapter/测试同步修改边界获得确认。

验收记录必须包含结论 `Accepted`、`Accepted with follow-ups` 或 `Rework required`，以及临时环境地址、桌面/移动端与双主题证据、数据来源/禁用能力清单、Graph 来源说明和自动化结果。只有前两种结论允许开始 B2/B3 前台接线；follow-up 不得改变已冻结的信息架构或 API 契约。

## P0-A Review 清单

`AC-SPEC-001` 还检查：accepted 文件无阻塞性占位标记；Schema 通过 Draft 2020-12 元校验且 `$id` 唯一；跨文件 `$ref` 可从同一 registry 解析；每个 Agent 角色的合法/非法 fixture 分别通过/失败；权限矩阵无空单元格；状态全集与转换目标一致；Domain 禁止 SDK/语言类型；全部 P0 有场景。可重复的基础校验入口为 `npm run validate:specs`。P0-A 通过是创建独立 P0-B Spike 的前置条件，不代表 Spike 已通过或生产可用。
