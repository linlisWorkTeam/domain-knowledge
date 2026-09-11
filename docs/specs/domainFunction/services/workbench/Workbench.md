<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：五阶段工作台任务、冻结输入、恢复与预算规则。
-->
# 五阶段工作台

代码位置：[StageTask](../../../../../src/domain/services/workbench/StageTask.ts)、[WorkbenchStages](../../../../../src/application/services/WorkbenchStages.ts)、[StageTaskPorts](../../../../../src/application/ports/StageTaskPorts.ts)、[SqliteStageTasks](../../../../../src/infrastructure/sqlite/SqliteStageTasks.ts)。

## 契约与边界

新执行契约为 `knowledge-workbench-v1`，阶段依次为 GENERATE、INDEX、FLYWHEEL、EVALUATE、ASSOCIATE。Domain 定义冻结输入与预算规则，Application 交接材料、调度及等待，Infrastructure 实现 SQLite 事务与 Linux 进程身份。没有新增动态 Agent 注册平台。当前已接通 GENERATE（C/C++）、INDEX，以及FLYWHEEL的代码重建和公开接口比较；EVALUATE已接通参考验证及可信用例执行，规范化源码差异与ASSOCIATE已接通，自动知识修订仍待完成，不把部分结果展示为完整验证。

StageInput 固定 projectId、源码版本/摘要、卡片版本列表、配置摘要和公开参数。规范化 JSON 与契约、预算共同产生任务 ID；重复启动相同输入返回原任务，成功结果可复用。冻结快照不能携带凭据。任务状态为 PENDING、RUNNING、SUCCEEDED、FAILED、PAUSED、CANCELLED；旧契约可读，不允许 claim/resume，恢复不改写旧执行快照。

## 幂等与恢复

同数据库使用一个执行租约，只有一项任务占用。身份绑定 Linux boot ID、PID 与进程启动时间；无法证明旧进程退出时不抢占。进程退出后，当前契约任务进入 PAUSED；旧契约仅释放已确认退出的技术租约，保留执行事实。PENDING 可在服务启动时继续排队，PAUSED/FAILED/CANCELLED 要求显式恢复并提供相同 inputDigest。

检查点按 taskId+子步骤键提交，恢复复用已完成产物。写回必须持有当前 leaseId；租约失效后拒绝迟到写入。外部副作用必须使用提供的幂等键。检查点本身不能保证模型请求恰好执行一次；模型调用前持久化预留，重试记入新 attempt，已完成生成结果先落 CAS 后交给后续阶段。

取消 RUNNING 只标记请求并传播 AbortSignal；执行器及子进程树清理退出前仍占用槽位。只有执行器返回后才能标记 CANCELLED 并启动下一任务。关闭服务先等待任务中止，再关闭存储。数据库失败向等待方抛出，不假装成功或重新启动。

## 预算

保留累计 modelCalls、reservedTokens、已报告 tokens 和 elapsedMs。预留与实际用量分开，不将预留标成供应商账单。operationId 在每次 attempt 中幂等；真实重试不能重复使用旧 attempt 的占额。取消、恢复、进程回收不清零用量。默认没有固定三轮或调用次数上限；显式预算耗尽、供应商额度失败和资源缺项暂停。供应商额度查询失败不能解释为无限额度。模型/编译执行器仍须遵守全局资源限制及进程树取消。

## 验证与剩余范围

`WorkbenchStages.test.ts` 使用真实 SQLite 连接和实际退出的子进程验证：完成子步骤复用、累计预算、跨连接取消和串行槽、进程回收、旧契约只读及迟到写入拒绝。C/C++工具链、分步执行和持久化一键协调另有专门回归与真实验收报告；这些单阶段测试不证明完整产品交付。自动知识修订、发布门禁及最终部署仍需完成。

<details lang="en"><summary>English summary</summary>

Versioned stages freeze input and budget, reuse committed checkpoints and serialize work using a process-owned SQLite lease. Cancellation retains the slot until cleanup completes. Generation, indexing and the reconstruction/interface comparison portion of FLYWHEEL are connected; reference validation and generated behavior evaluation are connected; normalized source diagnostics and association orchestration are connected; automatic revisions remain pending.

</details>

## 项目输入

[WorkbenchProject](../../../../../src/domain/services/workbench/WorkbenchProject.ts) 定义固定输入版本。projectId绑定仓库身份；snapshotId绑定提交、源码摘要、排序后的模块选择、声明式构建约束与CAS文件引用。选定模块不能来自测试/示例或不支持语言；空选择、超限和未知模块拒绝。编译器、语言标准取有限枚举，包含目录不得越出仓库，预处理定义不允许命令或任意参数。包含目录和宏定义顺序保留，因为顺序可能影响构建。工具版本还需由实际构建阶段单独冻结。

快照是参考材料，未包含可供Code读取的公开接口；无法据此直接启动重建。文件正文与构建配置先写CAS，SQLite最后一次原子插入。相同输入重放保留原创建时间，源码或参数改变生成新输入历史。取消和读取失败不产生部分项目，已写CAS对象可后续复用。

## 知识单元与生成

KnowledgeUnits按固定仓库身份、源码模块和完整符号名生成稳定cardId；函数重载归为一个调用族，类型布局按类型名独立成卡。存储moduleId使用卡片身份，展示模块仍为sourceModule。标题变化不改变身份；正文附固定来源提交及符号尾注，源码变化不能误复用旧来源版本。语法投影尚不是完整依赖图，缺证据仍须明确记录；C++可指定类范围和符号族。

GENERATE冻结项目输入、模型配置和接口选择；逐卡提交候选版本，生成成功不等于行为验证或允许发布。配置与资源问题暂停，质量及执行错误保留原始原因，不撤销已完成卡片。阶段独立于旧Run生命周期，不把“未评测”映射为旧Run的失败或发布状态。

新阶段显式启用操作性恢复策略：额度停止、用户取消、服务关闭和预算中断写入failureCode，已消耗请求与Token不回退。这些已分类中断不消耗角色的两次语义修正额度；尝试编号持续递增，每次错误立即停止，必须显式恢复，不能自动循环调用。未知传输错误、未知进程中断和语义拒绝仍受既有尝试上限约束。旧Run不启用此策略，原限次恢复契约不变。

### 持久化一键执行契约

`knowledge-pipeline-v9` 顺序推进 GENERATE、INDEX、FLYWHEEL、EVALUATE、ASSOCIATE，复用各阶段相同的prepare/start与执行器。协调记录独立于阶段执行槽，保存冻结生成输入、每个子阶段完整输入/任务身份、已完成阶段及暂停原因；不能持有阶段租约等待子阶段。子阶段先记录后启动，崩溃间隙用同幂等键补齐。成功结果复用，恢复不修改子任务输入、配置和累计预算；模型配置与生成阶段不一致时停止。取消传播至当前子任务，进程退出后显式同版本恢复。

Domain判定推进条件：阶段成功且索引无失败、公开接口匹配、可信行为全部通过，才进入下一阶段。错误/取消/资源暂停均停在原阶段，前序产物保留。流程SUCCEEDED只表示五阶段执行完成，publicationVerified仍为false；知识修订有证据及质量门禁，最终发布另有门禁，不能由一键执行状态代替。

协调身份同时绑定所选语言工具链与执行器摘要；环境变化生成新流程身份，旧流程不能跨环境恢复。进入新阶段前复查环境摘要，子阶段仍独立冻结并检查自身工具链。

流程 v3 在启动时冻结明确选择的 materialIds 并纳入身份，只把它们交给关联阶段。新增其他材料不影响运行中输入，改变选材创建新流程并复用未变阶段。v1/v2/v3 记录只读，不跨版本恢复或取消。没有选材时仍复用库内 v1 关联任务。

## 规范化源码诊断

新重建输入显式绑定 `native-source-comparison-v1`。在 Code 完成后读取固定参考 CAS，按公开函数及参数类型定位定义，比较去注释/空白后的词法序列和控制关键词计数；类型/布局仍以 Clang 公开声明比较为准。保留标识符、常量和预处理分支，不宣称语义等价。缺少、歧义或复杂声明无法确定时明确列出未解决项，不编造零相似度。编辑距离只在限定计算预算内计算，报告公式、覆盖范围和截断情况。TinyXML2 只比较选定 XMLUtil 函数，不把整库其他代码算作缺失。

仅新增诊断而 Code 输入未变时，可复用已成功重建的生成代码。匹配固定卡片/正文、接口、项目快照/构建、模型配置和工具链摘要，只有诊断契约从缓存键中排除。复用记录原任务与代码工件，重新执行当前接口检查和诊断，不读取参考实现给 Code。历史用量通过跨重试幂等的继承记录保留，不重复收费或清零。新重建及一键契约与旧执行分离，旧执行只读；知识修订/行为评测/发布仍独立判定。

## 可信失败驱动的修订交接

修订只能使用已成功完成的 EVALUATE 任务中、通过参考验证的可信测试失败。Domain 将失败用例、固定正文摘要和 `cardId#H2` 绑定；旧章节、版本不匹配、参考失败、无行为观察的编译/运行故障均保留未解决项，不自动授权 DocGen。Review 可判断为知识缺失/错误、生成代码问题或证据不足；只允许对确有当前章节绑定的意见提出定点修订。文本相似度本身不授权修改知识。

修订执行保留原评测、Review 结果、修改前后正文及原卡片身份。DocGen 沿用现有精确 H2 范围校验，禁止改动其他章节、伪造无变化修订或修改可信测试预期。修订产物仍是候选，必须更新对应索引后才能进入下一轮重建；每轮输入、版本、历史门禁和累计用量均需保留。无有效进展或未解决诊断应暂停，不将固定三轮恢复为总上限。

已实现只读修订依据查询及Console入口：native-revision-evidence-v1按可信原始套件重算参考通过及实际差异，验证报告用例与原套件一致，再匹配固定正文摘要及当前章节。相同正文的历史版本绑定不触发新测试，但需要重新定位后才能用于修订。此查询不改变执行契约和旧任务产物；Review/DocGen修订与v4自动循环已接通，最终发布仍未完成。

修订执行设计：FLYWHEEL 的 `operation=KNOWLEDGE_REVISION`、`revisionContract=knowledge-revision-v5` 与普通代码重建分别调度。冻结评测编号、派生证据CAS、卡片版本和原模型配置。每张卡片先运行 Review，仅采纳其明确定位到候选H2的意见；未解决风险或无意见时保留原卡片。DocGen 成功后先对确定性装配完成的正文执行独立源码 Review；仅 PASS 且无纠正意见、阻塞或未解决风险时幂等提交候选版本。复核拒绝保留草稿及角色证据，不提交版本、不索引，阶段返回 UNRESOLVED。通过后，再调用同一索引用例刷新修改项；索引失败保留卡片和模型检查点，恢复不再次调用模型。独立执行与v4协调使用同一修订用例。

已接通独立修订执行、原卡片身份保留、受影响索引共享用例和Console操作；v4保存自动多轮历史。候选提交可携带expectedParentVersionId，在CAS写入后、SQLite提交前核对头版本；只允许本次已完成版本的幂等回放，不覆盖并发写入。索引与模型不占用两个执行槽，所有派生索引输入先存为检查点。质量拒绝明确返回QUALITY_REJECTED并保留候选。

Review与DocGen接收固定参考源码及可信评测，Code/TestGen保持参考实现隔离。系统生成的来源提交尾注在修订后保留，并再次校验非授权章节未改变；只有删除尾注的输出不能算有效修订。Review明确PASS且无需修改的卡片记为UNCHANGED，不阻止其他已获准修订卡片继续；证据不足的意见仍保留UNRESOLVED。

## 自动迭代协调

v4 一键流程保存每轮重建、评测、修订的冻结子任务；children 仅为当前展示引用，历史轮次不覆盖。可信行为失败才进入修订，修订成功或 Review 确认无需改知识后，以失败评测绑定的新 Code 尝试进入下一轮。Code 只收到知识/接口/构建约束，不收到用于标识重试的隐藏报告。修订内索引刷新成功后才重建。

连续三次评测没有严格缩小历史最佳失败用例集合时暂停，保留全部轮次；这不是三轮总上限，有持续行为改进可以继续。只改文字或相似度不算行为进展；失败身份绑定模块、调用、观察与预期，不绑定用例名称、说明或章节标签。退步后恢复旧水平不重置无进展计数。取消始终指向当前实际子任务，包括修订。用量按所有唯一子任务统计，不重复计入展示别名。v3及更早只读，不能跨版本恢复。


```mermaid
flowchart TD
  Generate[生成卡片] --> Index[建立索引]
  Index --> Code[冻结本轮卡片并重建]
  Code --> Evaluate[参考验证与可信行为评测]
  Evaluate -->|全部通过| Associate[建立关联]
  Evaluate -->|行为失败且有进展预算| Review[Review 判断知识原因]
  Evaluate -->|连续无进展| Pause[暂停并保留历史用量]
  Review -->|获准修订| DocGen[DocGen 定点修订]
  Review -->|知识无需修改| Retry[绑定失败评测的新 Code 尝试]
  Review -->|证据不足| Pause
  DocGen --> SourceReview[最终修订正文独立源码复核]
  SourceReview -->|PASS 且无风险| Quality[知识质量检查与受影响索引刷新]
  SourceReview -->|拒绝 保留草稿| Pause
  Quality -->|通过| Retry
  Quality -->|拒绝或失败| Pause
  Retry --> Code
```

阶段执行器共享单槽，协调器不占槽等待；取消指向 activeTaskId。代码重试冻结失败评测的输入与结果摘要，重试身份不会作为模型材料发送。关联完成仍不等于通过最终发布门禁。


## 当前版本启动

v5 启动时若生成任务已有成功产物，按稳定卡片身份选择同一项目快照的当前后代版本；只读取版本记录，不读取正文。不能跨源码快照或不相干血缘替换。存在修订时将选定版本集合纳入流程身份，并在第一次索引及第一轮重建中使用；原生成产物保持不变。恢复只使用冻结版本，不重新选择当前头。当前版本未变时复用原流程，修改卡片后显式启动形成新流程。v4及更早只读。


## 修订角色交接 v2（实施中）

真实故障验收发现：原始 Review correctionId 可为自然语言标识，且含辅助字段，不能直接作为 DocGen 命令；必须使用已验证 AgentResult.payload.corrections 中标准化的意见，并校验原始正文/任务/意见内容绑定。Review 同时获得固定参考与生成代码，按当前卡片归因。已知代码错误、其他卡片的失败、计划中的后续重建不属于当前知识修订未知风险；只将当前卡片无法确定的知识问题列为 unresolvedRisks。保持未知风险阻止修订的门禁，不靠过滤风险文字放行。执行契约 knowledge-revision-v2 / pipeline-v6 与旧执行分离。


v3 修订进一步将 allowedKnowledgePaths 同时绑定 Review 的动态输出 Schema、提示词和角色校验；不得先保存一个角色成功结果后才发现其超出失败证据范围。未指定范围的旧 Review 输入行为保持原样。当前卡片的 criteria 包含本轮已经完成的 priorCardDecisions，避免将已确认的上游代码/知识错误重新误归因到其他卡片。新流程 pipeline-v7，旧实验记录只读保留。

## 最终正文与源码一致性门禁（整卡复核已接通，发布待实现）

失败归因 Review 的 PASS/UNCHANGED 仅表示本轮没有获准的失败修订，不能证明该卡片的全部事实正确。修订后的源码 Review 只覆盖实际修改的授权章节，也不能替代整套最终卡片的来源一致性复核。最终门禁必须检查每张实际用于重建的冻结卡片版本，包括未修改的卡片；逐一绑定正文、固定源码/接口、适用条件、角色配置和复核结果。没有失败用例并不消除与固定源码直接矛盾的事实。

已知正文与源码矛盾时，即使重建代码碰巧正确、可信行为用例全部通过，也不得标为 VERIFIED 或发布。完整门禁还须通过固定及可信行为检查、接口检查和质量规则；所有声明只指向被验证的冻结版本。复核意见若明确指出源码矛盾，保留对应 H2 和证据，后续修订应刷新索引并重新构建评测；不能伪造一个行为失败来复用旧失败修订入口，也不能把来源复核的拒绝解释为测试失败。证据不足则暂停，保留历史预算及材料。

验收反例：某解析卡片写字符串 token 的 end 位于结束引号之后，而固定实现用结束引号位置；失败归因可能将本轮错误全部归于初始化并返回 UNCHANGED。最终来源门禁仍须拒绝该错误卡片，不能依赖生成代码是否采纳这句错误描述。这一反例已在独立真实模型验收中观察到；目前已接通修订正文源码复核与独立整卡复核；独立来源驱动修订已接通；自动流程的来源门禁已在 pipeline-v10 接通，最终联合发布事务尚未完成。

工作台发布应持久化独立、显式版本化的验证凭据，引用真实阶段/流程身份，再由现有本地发布端口生成可恢复文件收据。旧 repository.publish 会同时更新旧 Run 生命周期，不能靠构造不存在的旧 Run 来复用；需要独立的事务入口保存工作台门禁、卡片状态及审计，保留旧执行只读语义。

工作台角色审计保存每次语义尝试的 STARTED、PASSED、REJECTED、FAILED 工件；原始输出及结构化校验反馈只放 CAS，PROGRESS 事件记录绑定的角色、阶段、任务尝试编号和摘要引用。失败不能晋升为角色成功检查点。语义尝试记录按真实任务尝试隔离，同一尝试读取原记录；显式恢复仍保留历史记录和累计模型用量，已成功角色继续复用。审计增加不改变既有角色截止时间、两次语义尝试上限或模型输入。阶段证据下载只开放该任务已登记的审计引用，不允许凭摘要读取别的任务工件。

revision-v5 的修订后源码复核使用 `native-source-review-evidence-v1`：从已验证的 suite/oracle 工件重算参考通过，再选择授权章节绑定用例，明确 observedImplementation=PINNED_REFERENCE，保留实际参考观察和原始工件引用。旧生成实现的失败报告继续保存在原阶段及修订归因证据中，不作为源码复核的执行事实输入。缺少或不可信的参考观察直接拒绝，不合成期望值替代实际观察。此材料变化显式升级契约，v4及更早修订、v8及更早流程只读。

源码复核调用前先保存 revision-source-materials 检查点，包含最终草稿、固定源码、参考观察和准则的 CAS 引用；复核超时或取消后仍可读取这些确切输入，不依赖角色成功结果。

## 独立整卡来源复核

`knowledge-source-verification-v4` 是 EVALUATE 的独立操作，接受已完成的原生评测身份，不要求行为失败。冻结原评测的全部卡片、源码和配置，以固定源码及可信参考观察逐张检查全部 H2，包含此前未修改的卡片。Domain 判定 SOURCE_MATCHED、SOURCE_MISMATCH 或 UNRESOLVED；完整覆盖及精确正文版本绑定是聚合前提。每张卡片材料先落盘，成功检查点可复用，取消和恢复沿用阶段任务。来源匹配不等于 VERIFIED；来源意见驱动修订见下方独立契约；自动来源门禁见 pipeline-v13，最终发布事务仍待实现。

## 来源意见驱动修订契约

`knowledge-source-revision-v4` 以成功的整卡来源复核为独立输入，冻结该结果与原评测版本。只消费 SOURCE_MISMATCH，重新校验原 Review 命令/结果/原始输出和正文摘要，纠正意见必须指向既有 H2；保留其 PINNED_SOURCE_CONTRADICTION 来源，不能伪造失败用例。未知风险保留为未解决项。DocGen、修订后源码 Review、候选保存与增量索引复用行为修订能力；仅修订源依据变化，不修改可信预期。新版本需要重新重建、评测、整卡来源复核。接口接通后仍不授予发布资格。

## 一键来源门禁与进展（pipeline-v13）

行为用例全部通过后，必须运行相同的独立整卡来源复核。来源匹配才进入关联；未知风险暂停；明确矛盾交给同一个来源修订入口，刷新索引后使用新版本重新重建、评测及整卡复核。轮次冻结 sourceVerification 子任务和来源修订结果，取消、重启、恢复及累计用量覆盖这些子任务。旧 v9 流程只读，不跨版本恢复。

行为进展以当前连续失败阶段的历史最佳失败集合判定，通过全部可信用例后该阶段结束。来源进展以新完成且通过源码复核的 cardId/H2 计数；仅改正文摘要不算新进展。同一来源问题反复修订，连续三次没有完成新的章节复核后暂停；仍要先复测和复核最新版本，不能在成功前按轮数截断。不同章节持续取得进展可超过三轮。缺少来源执行器不得跳过门禁。完成这些门禁仍不代表固定测试及发布事务已完成。

来源复核 v2 改为逐 H2 调用同一 Review，knowledgeRef 仍指向完整冻结正文，固定源码和参考观察保持原来源。每次仅授权当前 H2，其他章节不是该次修订范围。卡片 SOURCE_MATCHED 要求全部 H2 完整覆盖且逐章匹配；任何章节缺失、未知或矛盾均不能通过。章节检查点在同版本恢复时复用。多处明确矛盾保留全部章节意见，本轮来源修订按稳定顺序修订首个问题章节，然后重新验证新版本。此材料/执行变化版本化为 source-verification-v2 / source-revision-v2，旧 v1 只读。真实 v1 的单卡请求两次在180秒内未产出最终回答；不放宽截止时间，也不把超时算匹配。

逐章复核的第一章同时覆盖标题及H2之前的前言。该区域如有不能在授权H2修订的矛盾，保留未解决风险，不得因不属于某个章节就忽略后通过。

默认模块选择以当前五阶段生成能力为准：C/C++ 可默认选择。TypeScript 保留既有模块回归执行器，但当前多卡片生成入口不支持，分析页必须说明并禁止误选，不可先默认选中再在生成时报 LANGUAGE_UNSUPPORTED。共用案例执行端口不等于已实现 TypeScript 多卡片生成。

## 固定用例阶段

`fixed-native-evaluation-v1` 是 EVALUATE 的独立操作，冻结重建任务、完整模块范围、卡片版本、用户提供的声明式固定用例与当前工具链。每个重建模块必须有且仅有一套合法用例；内容以CAS固定，传给Code的材料不增加隐藏测试。先逐案执行固定参考，实现或预期不匹配时返回REFERENCE_REJECTED并保留观察，不运行生成分支、不晋升测试、不归咎知识。参考全部通过后，在不同隔离目录执行生成文件，以同一用例比较实际值。逐案检查点支持同版本取消/恢复和结果复用。成功仍需可信测试及完整来源门禁，不直接发布；外部验收JSON的自报状态不能替代本阶段执行。

来源材料 v3：先验证完整参考 oracle 的用例覆盖和实际观察值，再仅向当前 H2 提供精确 cardId#heading 绑定的参考观察。没有绑定用例时记录 NO_DIRECT_BEHAVIOR_EVIDENCE，不补造测试或推断行为覆盖；固定源码仍是语义核验依据。完整正文与源码 CAS 引用不裁剪、不冒用摘要。应用负责验证已提供工件的摘要、冻结版本与来源绑定，Review 负责检查文字事实；不能把没有独立网络审计当作摘要未验证，也不能据此忽略正文中的来源矛盾。source-verification-v3 / source-revision-v3 / pipeline-v11 使用新输入身份；v2/v10 及更早执行只读，既有审计和累计用量保留，不迁移成功章节到不同材料契约。

## 编译数据库构建候选

仓库分析只读取固定 Git 对象中的 compile_commands.json，不运行其中的命令。按 Clang JSON Compilation Database 的 directory/file/arguments 或 command 结构提取逐编译单元候选；arguments 优先，command 仅词法解码，不进行 shell 展开。候选记录来源文件、记录序号、源码路径、可表达的编译器/标准/包含目录/定义及未支持项。绝对路径仅在固定仓库内转换为相对路径，仓库外依赖明确列为问题；不映射到任意宿主路径或自动下载。候选不自动覆盖现有构建参数：前台查看并应用到构建表单，再保存冻结项目输入。存在未支持参数时不提供一键应用，不能将部分解析称作完整构建配置。Make/CMake 的动态配置执行、生成依赖和逐模块不同参数仍需要后续实现。格式依据：https://clang.llvm.org/docs/JSONCompilationDatabase.html 。

### 来源矛盾保留（v4）

同一项目快照、源码与正文版本中，已有明确矛盾不能被之后一次 PASS 清除。新来源任务启动时冻结旧来源任务中已完成章节的明确纠正意见；逐项验证阶段输入摘要、原检查点、正文、Review命令/结果/原始输出及引用工件。允许读取旧v2/v3只读执行的证据，不恢复或修改旧执行。相同章节按最早有效意见稳定选择；继承记录不是新Review调用，显式记录originEvidence，完整来源聚合仍要求所有章节。后续来源修订重新验证原命令身份后消费同一纠正意见；修订后正文版本改变则不再继承旧正文意见，仍须重新重建、评测和源码核验。冻结的历史集合在恢复时不变。此输入与授权规则升版source-verification-v4/source-revision-v4/pipeline-v12，v3/v11及更早只读。

来源v4仍按精确章节绑定提供完整case，但不丢弃其他章节观察：relatedObservations保留模块全部其他已验证案例的摘要（案例身份、描述、章节和实际观察），完整suite/oracle工件仍可审计。摘要不是完整输入定义；章节标签不作为事实适用范围的硬边界。此调整修复真实v3漏判已有字段语义矛盾的反例。

### 一键固定用例（pipeline-v13）

启动可提供按模块的固定suite，冻结到CAS并纳入流程身份。选用固定用例时必须覆盖重建的全部模块。每轮可信行为评测通过后，同一WorkbenchFixedEvaluation用例分别验证参考与新生成实现；固定失败暂停该轮，不生成知识纠正、不改预期、不进入来源核验或关联。逐案例恢复及取消沿用阶段任务，固定子任务计入历史、累计用量与证据下载。每次修订后新重建仍使用启动时相同固定suite。未提供固定用例的历史兼容操作可继续生成/可信评测/来源/关联，但不具备最终验证发布条件，页面明确标注；最终发布事务仍待接通。旧v12不跨版本恢复。

### 冻结来源复核时间策略

新来源任务在输入中冻结 sourceReviewPolicy={schemaVersion:source-review-policy-v1, timeoutMs:600000}。Application仅将此已验证策略加入来源criteria，Domain Review限定FINAL_SOURCE_REVIEW与REVISION_SOURCE_REVIEW两个阶段可消费该策略。普通Review和旧来源输入未含策略时仍为180000ms，旧criteria不补字段。来源修订继承原来源任务策略，取消、供应商额度、阶段总预算与适配器本身超时仍优先生效，不增加语义重试次数。最长600000ms，不接受其他值或额外字段；新的策略改变阶段输入摘要，不改旧任务、历史用量和成功检查点。pipeline-v14使新的协调执行选择该策略，旧v13流程只读。依据真实流式诊断：180秒时仍持续收到推理输出且无最终回答，不能把时间截断当语义拒绝或降低质量门禁。

### 联合发布证据约束（实施中）

最终发布必须重新读取重建、可信评测、固定评测及完整来源复核的持久化结果，不能仅依据流程SUCCEEDED或某个子任务的通过标签。Domain联合门禁要求四任务均成功、身份摘要有效，绑定同一项目/源码快照/配置/完整卡片版本集合；两类评测绑定同一重建结果摘要，来源绑定该可信评测结果摘要。模块和卡片必须完整且无重复，可信与固定用例通过数等于非零总数，来源正文摘要与待发布卡片一致，固定suite与启动冻结输入一致。相似度不能覆盖这些失败。

Domain返回的联合证据凭据只表示记录交叉校验通过；Application仍须校验引用CAS和原始报告、执行SQLite发布审计与可恢复Markdown发布事务后才能授予VERIFIED。此轮先实现并验证联合证据规则，不修改旧发布状态、不把凭据当作已发布记录。

发布证据准备由Application重读四任务和不可变卡片，核对cardId/moduleId/bodyDigest及快照，再遍历输入、结果和卡片正文引用的CAS图，逐件验证摘要和大小。引用图重复项只读取一次，JSON引用继续展开，超限或缺失立即拒绝；通过后把联合凭据和已验证引用清单写入CAS，返回PREPARED/publicationVerified=false。准备不产生已发布版本，原始报告的行为/来源语义复算与SQLite/Markdown发布提交仍是后续必需步骤。

固定报告原始观察校验已接入准备服务：报告必须属于固定阶段result.artifactRefs，绑定模块、重建任务、源码快照/摘要及启动冻结suite；Domain按原suite重新比较参考和生成两侧逐案actual，且编译/执行退出码为0、无超时/输出截断，案例完整无重复。合法CAS摘要和FIXED_PASSED标签不能替代重算。可信测试集及来源逐章原始报告的语义校验仍待接通，不授予VERIFIED。

固定发布报告绑定进一步要求codeRef与对应重建模块完全一致，fingerprintRef与固定任务该语言的冻结工具链引用一致，cardVersionIds完整匹配模块卡片，cards中的稳定身份/版本/bodyRef逐项匹配持久化卡片。仅保留任务编号而替换代码、正文或工具链的报告必须拒绝。原快照manifest和可信/来源原始报告仍由后续发布语义校验负责。

可信报告发布复核的Domain规则：校验TRUSTED集的cacheKey/referenceKey/testSetId派生关系，对冻结suite重新核对oracle和生成case的实际结果及构建/执行状态；报告内input与expected必须逐案等于可信suite，不允许用修改预期后的PASS通过。此规则需由Application传入已校验CAS和源码/知识绑定的真实测试集，不能单独表示已发布。

发布准备v2已接可信复核：从NativeTestStore重读并冻结测试集记录，纳入准备凭据与递归CAS检查；验证快照/来源版本、卡片正文摘要、工具链摘要与引用，要求报告属于可信阶段工件且计数一致。参考manifest摘要与测试集绑定一致，生成manifest摘要与报告一致，其语言及逐文件内容摘要必须对应重建代码，再调用Domain逐案重算。仍不授予VERIFIED；项目manifest与接口/策略绑定、来源原始Review覆盖及最终发布事务尚需完成。

发布准备v3重读项目快照，核对项目/快照/来源版本及摘要，并将快照与源码引用纳入凭据和CAS扫描。固定报告manifestRef必须等于项目分析清单；可信参考manifest的源文件路径/摘要必须覆盖项目source文件，参考和生成manifest的标准化构建参数均与冻结项目一致，并要求启用sanitizers。接口与策略材料及来源Review原始覆盖仍待核验，不授予VERIFIED。

来源发布章节复核规则：原始Review必须明确PASS、无阻塞/纠正/未解决风险；标准化结果必须同一来源任务的成功review/attribution且无纠正/风险，绑定原始输出、命令及知识正文。命令的源码、参考观察、criteria引用须逐项一致，criteria必须绑定同一稳定卡片/版本/正文、当前H2及首章前言检查范围。此规则用于后续Application逐章重读与完整覆盖检查，不以它单独替代整卡/发布事务。

发布准备v4已接逐章来源复核：Application重读持久化正文，以实际H2清单要求sections完整且唯一，逐章验证卡片绑定、阶段工件归属、命令和结果信封schema，再调用原始Review规则。继承意见不能作为新的PASS发布证据。测试夹具改为含实际H2与真实形状命令/结果CAS，不跳过来源门禁。仍须继续核验参考源码内容与项目及观察材料与可信集的对应关系，PREPARED不是发布完成。

发布准备v5核验来源材料：来源reference必须属于该卡片模块的固定源码路径和内容摘要，来源版本/摘要及契约一致；从对应可信集读取suite/oracle，按当前cardId/H2重新计算sourceSectionObservations，完整核对材料中的直接案例和相关观察摘要。不能把合法CAS摘要当作与参考事实对应的证明。仍须继续接口/策略/suite schema等绑定及发布事务，PREPARED不是VERIFIED。

真实材料验收发现知识单元moduleId与源码模块ID不同。联合证据v2/准备v6分开保存：cards.moduleId保留知识单元身份（用于正文路径、来源criteria），sourceModules[versionId]冻结metadata.sourceModule（用于项目模块、Code/测试集分组）。不得以源码模块ID覆盖知识单元身份。测试夹具使用不同值，覆盖实际仓库结构；此修正不改旧卡片及执行记录。

发布准备v7从Code冻结公开接口及项目源路径重建NativeContract，固定与可信suite都必须重新通过assertNativeBehaviorSuite；不能仅有expected而不调用目标API。可信集interfaceDigest必须等于该契约摘要，policyDigest从冻结configurationRef的test-gen提示词/角色执行版本/契约/供应商配置按原native-test-policy-v1公式重算，配置工件摘要必须对应阶段configurationDigest。仍不替代最终发布事务。

发布准备v8按原createProjectSnapshot规则重算projectId/snapshotId，不迁移旧身份。分析manifest必须匹配仓库/目录/commit/sourceDigest，选中模块与原清单完整一致；冻结sourceFiles必须完整覆盖选中源路径与全部build文件，路径唯一，objectId/kind/size逐项匹配分析记录。新增测试包含遗漏构建输入后重新生成合法快照身份仍被拒绝的情况。后续交付重点转向SQLite审计与可恢复Markdown发布事务及入口。

### 本地发布事务

Application先完成当前发布准备，再冻结卡片Markdown/YAML、准备证据和文件清单到CAS。Domain由这些引用生成独立workbench-publication-v1身份，SQLite原子写PREPARED及审计，Infrastructure向专属临时目录导出并校验全部文件，再原子改名为发布目录，最后SQLite置COMMITTED。仅COMMITTED记录授予本次冻结版本VERIFIED；不重写原知识正文、旧门禁或旧Flywheel runId。崩溃、导出失败时保留PREPARED和错误，恢复只重放相同CAS工件。重复提交与重复恢复不新增发布或提交事件。导出路径只由受限的发布ID及稳定cardId组成，不接受任意宿主路径。
