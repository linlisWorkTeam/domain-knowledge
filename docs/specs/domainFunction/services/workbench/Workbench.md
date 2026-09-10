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

`knowledge-pipeline-v3` 顺序推进 GENERATE、INDEX、FLYWHEEL、EVALUATE、ASSOCIATE，复用各阶段相同的prepare/start与执行器。协调记录独立于阶段执行槽，保存冻结生成输入、每个子阶段完整输入/任务身份、已完成阶段及暂停原因；不能持有阶段租约等待子阶段。子阶段先记录后启动，崩溃间隙用同幂等键补齐。成功结果复用，恢复不修改子任务输入、配置和累计预算；模型配置与生成阶段不一致时停止。取消传播至当前子任务，进程退出后显式同版本恢复。

Domain判定推进条件：阶段成功且索引无失败、公开接口匹配、可信行为全部通过，才进入下一阶段。错误/取消/资源暂停均停在原阶段，前序产物保留。流程SUCCEEDED只表示五阶段执行完成，publicationVerified仍为false；自动知识修订和最终发布另有门禁，不能由一键执行状态代替。

协调身份同时绑定所选语言工具链与执行器摘要；环境变化生成新流程身份，旧流程不能跨环境恢复。进入新阶段前复查环境摘要，子阶段仍独立冻结并检查自身工具链。

流程 v3 在启动时冻结明确选择的 materialIds 并纳入身份，只把它们交给关联阶段。新增其他材料不影响运行中输入，改变选材创建新流程并复用未变阶段。v1/v2 记录只读，不跨版本恢复或取消。没有选材时仍复用库内 v1 关联任务。

## 规范化源码诊断

新重建输入显式绑定 `native-source-comparison-v1`。在 Code 完成后读取固定参考 CAS，按公开函数及参数类型定位定义，比较去注释/空白后的词法序列和控制关键词计数；类型/布局仍以 Clang 公开声明比较为准。保留标识符、常量和预处理分支，不宣称语义等价。缺少、歧义或复杂声明无法确定时明确列出未解决项，不编造零相似度。编辑距离只在限定计算预算内计算，报告公式、覆盖范围和截断情况。TinyXML2 只比较选定 XMLUtil 函数，不把整库其他代码算作缺失。

仅新增诊断而 Code 输入未变时，可复用已成功重建的生成代码。匹配固定卡片/正文、接口、项目快照/构建、模型配置和工具链摘要，只有诊断契约从缓存键中排除。复用记录原任务与代码工件，重新执行当前接口检查和诊断，不读取参考实现给 Code。历史用量通过跨重试幂等的继承记录保留，不重复收费或清零。新重建及一键契约与旧执行分离，旧执行只读；知识修订/行为评测/发布仍独立判定。
