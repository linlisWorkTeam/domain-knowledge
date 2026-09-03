# P0 验收计划

所有场景使用 Given/When/Then，可自动化场景为发布阻塞项。

验收场景对应的用户目标、参与者边界、成功/失败分支和接口入口见[用户用例与交互时序](../05-workflows/user-use-cases.md)。

| ID | 场景 |
|---|---|
| AC-SPEC-001 | Given 本规范集，When 执行 spec lint，Then 每个 SYS/NFR P0 ID 在追踪矩阵中恰有一行且实现、测试、场景非空。 |
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

## P1 内容质量验收

| ID | 场景 |
|---|---|
| AC-DOC-001 | Given DocGenAgent 首次生成或按 Correction 修订中文知识，When Orchestrator 发送生成请求并执行 Quality Gate，Then 两轮 Prompt 都包含自然写作约束，模板化填充、无来源宣传词和超长段落会降低 `humanReadability` 并形成 weak point；任何润色都不得改变事实、来源、验收条件或安全边界。 |
| AC-DOC-002 | Given 一个跨层大规模特性，When 准备合入，Then Console、GitHub Pages、工程文档、Spec、追踪矩阵和自动化验收均已更新或在 PR 中明确说明不适用。 |
| AC-DOC-003 | Given 仓库中已跟踪的 Markdown 和关键入口文档，When 执行文档契约测试，Then 每份文档都有中文说明，关键入口包含相邻的结构化 English summary，代码标识符和协议值仍可与源码直接互查。 |
| AC-DOC-004 | Given 官网和控制台，When 检查静态文案、状态标签和运行时投影，Then 除固定标题 `WORKPANEL · KNOWLEDGE FLYWHEEL` 以及代码、命令、项目名和协议标识符外，用户看到的栏目、状态与说明均为自然中文。 |

## P0-A Review 清单

`AC-SPEC-001` 还检查：accepted 文件无阻塞性占位标记；Schema 通过 Draft 2020-12 元校验且 `$id` 唯一；跨文件 `$ref` 可从同一 registry 解析；每个 Agent 角色的合法/非法 fixture 分别通过/失败；权限矩阵无空单元格；状态全集与转换目标一致；Domain 禁止 SDK/语言类型；全部 P0 有场景。可重复的基础校验入口为 `npm run validate:specs`。P0-A 通过是创建独立 P0-B Spike 的前置条件，不代表 Spike 已通过或生产可用。
