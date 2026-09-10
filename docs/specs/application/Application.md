<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：应用用例与提交协调设计。
-->
# 应用用例与提交协调设计

代码位置：[src/application/apps/ApplicationApps.ts](../../../src/application/apps/ApplicationApps.ts)、[src/application/services/RoleExecution.ts](../../../src/application/services/RoleExecution.ts)、[src/application/services/AutomatedProjectWorkflow.ts](../../../src/application/services/AutomatedProjectWorkflow.ts)、[src/application/services/QualityPolicy.ts](../../../src/application/services/QualityPolicy.ts)、[src/application/services/RunConfiguration.ts](../../../src/application/services/RunConfiguration.ts)。


## 外部用例

| App | 负责的用例 |
| --- | --- |
| Orchestrator | 启动、观察、取消和恢复批次，组合工作流端口 |
| FlywheelApp | 候选入库、知识生成和生命周期协调 |
| EvalRunnerApp | 请求独立评测、保存证据并调用 Domain Gate |
| KnowledgeSearchApp | 当前知识查询，SearchAgent 仍未接线 |
| KnowledgeDiscoveryApp | 调用 SourceScanner 发现未入库文件 |
| ContentGovernanceApp | 来源、规则、血缘、Diff、反馈和事项治理 |
| ProviderOperationsApp | 受控配置、校验和脱敏查询 |
| OperationalMetricsApp | 指标窗口和统计查询 |

## 角色提交链

RoleExecutionService 为生产、Fixture 和 agent:run 共用生成键、命令工件、RoleResult 和结果信封。先验证可信材料，经 Domain 的 `services/workflow/AgentExecutionService.ts` 执行显式注册角色，写入标准化角色结果及待保存正文，将 pending/角色节点/生成键符号绑定为实际引用，校验结果信封后提交 checkpoint、结果与事件。失败和取消保留失败记录，不能提交半份成功结果。DocWorker/DocGen 阶段 journal 在模型调用前保存占额，调用后把原始模型输出、字段定位和 PASSED/REJECTED/FAILED 单独写入不可变 CAS；事件只携带引用、次数与截止时间。恢复复用已通过阶段，不能重置次数或截止时间。失败阶段原文不进入下游成功结果信封。

ProjectWorkflowStages 负责解析场景上下文、读取历史工件、构造各角色 Input，再调用公共角色服务。评测、候选保存和发布继续由应用服务协调，不能把 WorkflowStageInput 透传给 Domain 角色。

## 执行状态展示

Orchestrator.executionForRun 组合工作流执行事实和 RunConfiguration 兼容检查，RunExecutionPresentation 形成只读展示。业务 state 和执行 executionStatus 分开保留；可恢复失败不重写业务阶段。无执行记录或读取失败返回明确不可用状态，只有 RUNNING 执行计入活动并提供取消。恢复要求原有预算尚存、失败节点可定位和当前冻结配置兼容；命令仍由工作流执行最终预算与授权检查。展示仅输出安全错误码和节点，不输出模型原始异常。

纯规则、真实注册表 API 与受控浏览器分别由 RunExecutionPresentation、RunExecutionHttp 和 RunExecutionConsole 测试覆盖；受控执行视图不声明真实模型验收。

## 当前内容质量策略

DeterministicQualityPolicy 位于 Application：来源证据 30%、结构 25%、可验证性 20%、正文量 15%、可读性 10%，默认阈值 70。KnowledgeWritingGuide 报告模板化表达和超长段落；弱项形成反馈送回 DocGen。质量拒绝跳过 Code，质量通过不等于行为 Gate PASS。

## 配置与独立运行

RunConfiguration 冻结 Prompt、Schema、Provider 和 roleExecutionVersion 摘要，配置改变影响新 Run；旧版本拒绝恢复但不阻止查询历史。AgentExample 保存独立开发 Run、配置、工件与脱敏轨迹，不启动 LangGraph、评测或发布。所有角色样例均通过 AgentExample 执行，不再为 DocGen 提供专用应用服务。固定源码检查只在 DocGen 自己的样例测试中执行。

ProviderOperationsApp 只在用户显式验证时调用 ProviderConnectionProbe，并贯穿 HTTP 取消信号。30 秒总期限从应用入口开始，覆盖配置修订队列和 DNS 校验；取消的队列项提前返回，但不能放行仍在前序操作后的其他配置修改。模型列表与最小生成均 PASSED、reasonCode 为 GENERATION_READY 才保存已验证指纹并启用；两阶段证据保存在设置和脱敏审计中。旧版 READY 记录可读，但对外显示 UNVERIFIED / GENERATION_VERIFICATION_REQUIRED，不能成为新 Run 的默认配置，读取时不触发生成或修改旧记录。配置修订号和 HTTP 幂等约束继续阻止重复操作产生额外调用。技术预算和临时空间见[模型适配设计](../infrastructure/agentAdapters/AgentAdapters.md#显式连接验证)。


文档关系：[设计目录](../README.md)负责代码与设计定位；[开发指南](../../Development.md)说明修改和交付步骤。

## 本地发布应用边界

`PublicationOperations` 通过 `LocalPublicationPort` 承接已取得领域发布凭据的 Markdown 发布。输入必须包含 publicationKey、gateDecisionId、运行/版本标识、源码提交与摘要以及 evidenceRefs；HTTP 不提供绕过门禁的 publish 命令。工作流先完成确定性门禁和领域发布，再调用本地发布，失败保留待恢复日志。

Console 通过应用边界读取发布设置、枚举服务器授权目录、读取正文与来源、恢复待完成发布及手动同步 Git。Git 默认关闭。模型配置和服务器目录操作不要求用户编辑场景 JSON。代表模块场景由受信工厂构建，并通过 `apps.markdownLite.start(repositoryRoot)` 启动。

应用数据与安装版本分离；详见 [Linux 安装与本地发布](../../LinuxInstall.md)。

失败执行的恢复展示同时检查阶段 journal：两次尝试耗尽或阶段截止时间已过时，不展示恢复按钮。此展示不代替阶段执行器、运行总预算和执行版本的最终校验。

真实验收入口的默认三次账本可在显式用户追加一次授权后升级为 mvp-real-attempts-v2；授权文件绑定旧账本 SHA-256，持久化原三次内容摘要并只开放第四次。重放不得增加额度，原记录篡改或摘要不符时拒绝。该授权不改变每次飞轮三轮、三十分钟的业务预算。


## 工作台阶段与索引

WorkbenchStages 通过 StageTaskStore 调度版本化任务；输入身份、恢复条件和预算规则位于 Domain [Workbench](../domainFunction/services/workbench/Workbench.md)。单阶段执行结果与检查点可独立等待，不复用 AgentExampleService 的每次新建 Run 行为。当前 GENERATE（C/C++）与 INDEX handler 已接通；FLYWHEEL已接通重建和接口比较部分；EVALUATE已接通参考验证和生成行为评测，自动修订与关联执行器仍待接通。

KnowledgeIndexService 读取冻结卡片版本，协调 YAML/Markdown 工件、增量索引、恢复与摘要查询。索引失败保留知识和已提交子步骤。查询只访问摘要和版本元数据，正文由详情按需加载；不调用模型、发布或外部搜索。


RepositoryAnalysisService 调用 RepositoryAnalyzer 并将固定清单写入 CAS；动态资源、工具观测及请求的分支别名不进入源码 manifestRef，因此相同提交重复分析可复用源码身份。工具链摘要尚待编译阶段另行冻结，不能用源码清单摘要替代测试缓存中的工具链身份。

WorkbenchProjects 已接入：项目身份绑定仓库，输入版本绑定提交、模块选择、构建约束和固定源文件工件。先校验选择，再将选定源码与构建配置存 CAS，最后原子记录 SQLite 快照；同输入重复请求复用，历史快照不可变。源文件工件仅供源码分析、DocGen和参考评测使用，不能作为 Code 的公开接口。公开接口提取成功前不能启动重建。构建参数只接受编译器、标准、相对包含目录及预处理定义，不接受 shell 命令。

NativeLanguageToolchain端口用于原生声明投影与独立构建/原始执行观察。当前基础适配器已接通GENERATE的接口提取，已接通FLYWHEEL公开接口比较及EVALUATE的参考基线检查；不能将compileAndRun返回的stdout/exitCode直接作为可信测试或发布门禁。公开接口材料须单独保存，只把native-interface-v1声明投影传给Code，禁止传源文件、原构建文件或完整AST。

WorkbenchGeneration 已接通：从固定项目与接口选择构造稳定知识单元，一张卡片对应同名函数/重载族，类型布局独立成卡；配置先固定为阶段工件，阶段身份绑定配置摘要与输入。复用Domain角色及RoleExecution的结果工件提交，不用旧Run生命周期表示“生成完成未评测”。角色尝试写入阶段审计，成功卡片逐张提交、立即可读，失败保留前序产物；发布资格仍由后续评测决定。

阶段配置为 workbench-model-v1 工件，包含七角色提示词、契约摘要、模型身份和阶段执行策略；不写依赖旧Run外键的配置表。只接受已验证的Console Provider配置，配置变化不能跨输入恢复。DocGen复用Domain概要与章节生成，RoleArtifacts负责契约校验和CAS提交，旧RoleExecution共用相同提交边界。每次模型调用前记录累计请求与保守Token预留，实际用量另记，未报告不是零；每次模型会话限一次供应商请求且禁用工具，源码材料全部内联，物理模型工作区为空。角色日志保留成功输出，阶段恢复时重用；新阶段使用累计活动时钟，暂停时长不计角色超时，旧Run时钟不变。


NativeSuiteEvaluation 已实现原生候选的参考验证、生成实现独立评测和 SQLite 可信测试缓存，已通过WorkbenchEvaluation接入EVALUATE阶段。TestGen 的 native-cases-v1 分支输出声明式数据，宿主产生固定 harness；预期值不进入被测程序。参考实现未通过的候选只保存 REJECTED，不能执行生成评测或据此要求知识修订。报告始终保留 publicationVerified=false，后续仍需固定门禁、质量审查与发布凭据。

缓存身份绑定稳定 cardId、正文摘要、参考文件清单、公开接口、测试策略及实际工具链指纹。指纹涵盖编译器、头文件、依赖库、运行资源适配器和测试解释器；前后不一致拒绝提交。索引元数据不进入正文摘要。相同输入跨重启复用；正文修订后原可信用例和预期保持不变，在参考实现重新验证。可信 head 使用 SQLite 事务及父版本比较，拒绝候选不覆盖历史可信记录。工具链或源码变化建立新的验证身份。

用例关联通过 cardId#二级标题定位，并绑定不可变知识版本。新候选引用不存在的章节时拒绝；历史可信用例的章节被删除时保留历史版本链接，matchesInput=false，不伪造当前章节。报告保留用例输入、预期、实际值、编译运行证据、生成文件清单和章节绑定。整数按十进制字符串比较以保留 64 位精度，浮点允许误差为 1e-7 × max(1, abs(expected))；布尔和字符串精确比较。阶段上下文可逐用例记录检查点及取消信号，但前台阶段接线与失败修订仍待实现。


已接通部分：WorkbenchReconstruction 从固定项目及卡片版本准备 Code 材料。仅传正文、native-interface-v1 声明投影与白名单路径/构建约束，绝不传参考源文件或隐藏用例。模型配置、输入版本与工具链摘要进入阶段身份；成功 Code 结果由公共角色提交边界保存，失败或取消保留前序检查点，恢复不重复已完成模型调用。生成代码需再提取公开声明进行比较，声明失败保留诊断，不以产出代码冒充完成行为验证或发布。


WorkbenchEvaluation 已接通：接受成功重建taskId，冻结其结果摘要、配置、工具链和卡片版本，复用TestGen及NativeSuiteEvaluation。参考baseline使用独立空main完成隔离构建/启动检查，失败保留报告并停止，不能把依赖错误算作候选或知识错误。TestGen只见知识、接口及源码快照元数据，不见参考正文/生成实现/隐藏预期。候选参考失败保存CANDIDATE_REJECTED，生成实现不运行；可信案例报告包含失败输入、预期、实际和章节版本映射。成功执行报告与行为成功分别标识，publicationVerified=false。当前阶段暂不执行自动知识修订或发布，不能当作完整评测飞轮交付。

候选参考拒绝保存独立报告与检查点，任务以TEST_CANDIDATE_REJECTED失败；恢复使用递增候选修订键重新生成已拒绝候选，保留同任务累计消耗。尚在验证中发生资源中断的候选不重新生成。完整报告留CAS，阶段与模块检查点仅含计数/引用，避免大报告超过阶段状态的256KiB上限；后续模块失败不丢失前序模块报告。所有行为通过仍不等于完成发布门禁。

外部材料捕获由 WorkbenchMaterials 协调：通过 ExternalMaterialReader 读取用户登记来源及固定修订，验证原文摘要，调用文本转换端口，写入原文/正文 CAS，再通过 ExternalMaterialStore 追加不可变快照。Domain 定义材料身份和适用条件约束，Application 不解析 HTML、不读文件或发 HTTP 请求。读取快照前验证两个工件完整性，失败不返回伪造正文。此捕获用例尚不自动生成关联，关联任务需显式选择材料。
