# 系统需求

状态：Accepted。优先级 `P0` 是 V1 发布阻塞项。

| ID | 优先级 | 需求 | 验收场景 |
|---|---|---|---|
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
| KF-SYS-022 | P0 | 自动工作流必须以 ohMyWorkPanel 固定场景证明 LangGraph 执行、节点可观察、失败迭代、真实项目评测与 KnowledgeVersion 原子发布协同有效。 | AC-E2E-002 |
| KF-SYS-023 | P1 | 大规模特性变更必须同时评估并更新 Console、GitHub Pages、工程文档、Spec、追踪矩阵和验收证据。 | AC-DOC-002 |
| KF-SYS-024 | P1 | 仓库解释性文档必须以中文为主；项目目标、快速启动、架构边界、安全限制和贡献入口等关键内容必须提供结构化 English summary，代码标识符和协议值保持源码拼写。 | AC-DOC-003 |
| KF-SYS-025 | P0 | 自动工作流必须可通过 AgentProvider 调用真实 DeepSeek Harness；模型输出只有通过闭合 JSON Schema 后才能写入 CAS，调用审计不得保存密钥或 Prompt 正文。 | AC-E2E-003 |
| KF-SYS-026 | P0 | 候选知识未通过 Quality Gate 时，系统必须跳过 CodeAgent，把 score、signals 和 weak points 自动反馈给下一轮 DocGen；不得把内容质量失败误报为基础设施终态。 | AC-FLOW-005 |
| KF-SYS-027 | P0 | 每次治理 Run 必须可导出脱敏 Demo 报告，覆盖业务状态、全部节点尝试、KnowledgeVersion、评测、Gate、发布、事件、Checkpoint、Agent 调用摘要和 Artifact 完整性；不得导出 Prompt 正文、模型正文、Session 日志或凭据。 | AC-OBS-003 |
| KF-SYS-028 | P1 | 官网和控制台的用户可见文案必须使用自然、统一的中文；除固定标题 `WORKPANEL · KNOWLEDGE FLYWHEEL` 外，不得使用中英文拼接的栏目名、状态名或说明句。源码标识符、项目名、命令和环境变量作为技术值原样保留。 | AC-DOC-004 |
| KF-SYS-029 | P0 | 本地服务必须提供可提交的写入令牌配置样例、默认忽略的本地配置文件和页面内配置说明；未配置时继续默认拒绝写入，但必须告诉用户如何启用并重启服务。 | AC-SEC-004 |
| KF-SYS-030 | P0 | 运行代码、Spec、测试和前台必须只在 domain-knowledge 演进；wpKnowledge 只能保存知识正文、研究、设计、证据与索引，不得保留可运行副本。 | AC-ARCH-003 |

## P0-B Spike（P0-A 后独立开展）

| ID | 假设 | Spike 出口证据 | 未通过时默认方案 |
|---|---|---|---|
| SPK-001 | DSH SDK 可通过 Adapter 满足 AgentProvider 契约。 | 类型映射、取消/超时、流式输出、错误分类实验。 | 使用进程型 Provider；核心不依赖 DSH。 |
| SPK-002 | LangGraph Checkpointer 足以支撑 V1，本地条件下优于 Temporal。 | 崩溃注入、重放、操作复杂度对照。 | 保留 WorkflowPort，采用通过实验的一方。 |
| SPK-003 | 内部 GLM 满足结构化输出、工具调用、上下文和稳定性要求。 | 固定语料重复试验和错误分布。 | Provider 降级/重试并阻止发布，不更换契约。 |
| SPK-004 | Artifact Store 可提供内容寻址、原子发布和校验。 | 并发写、损坏检测、去重、恢复实验。 | V1 本地文件 CAS + SQLite 元数据。 |
| SPK-005 | C++ 沙箱可证明源码/测试隔离并限制资源。 | 路径穿越、符号链接、进程树、网络、CPU/内存测试。 | 阻止 C++ 生产运行，不弱化隔离。 |
