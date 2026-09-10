<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：五阶段工作台任务、冻结输入、恢复与预算规则。
-->
# 五阶段工作台

代码位置：[StageTask](../../../../../src/domain/services/workbench/StageTask.ts)、[WorkbenchStages](../../../../../src/application/services/WorkbenchStages.ts)、[StageTaskPorts](../../../../../src/application/ports/StageTaskPorts.ts)、[SqliteStageTasks](../../../../../src/infrastructure/sqlite/SqliteStageTasks.ts)。

## 契约与边界

新执行契约为 `knowledge-workbench-v1`，阶段依次为 GENERATE、INDEX、FLYWHEEL、EVALUATE、ASSOCIATE。Domain 定义冻结输入与预算规则，Application 交接材料、调度及等待，Infrastructure 实现 SQLite 事务与 Linux 进程身份。没有新增动态 Agent 注册平台。当前已接通 INDEX；其余执行器待接通，不显示为已经可执行。

StageInput 固定 projectId、源码版本/摘要、卡片版本列表、配置摘要和公开参数。规范化 JSON 与契约、预算共同产生任务 ID；重复启动相同输入返回原任务，成功结果可复用。冻结快照不能携带凭据。任务状态为 PENDING、RUNNING、SUCCEEDED、FAILED、PAUSED、CANCELLED；旧契约可读，不允许 claim/resume，恢复不改写旧执行快照。

## 幂等与恢复

同数据库使用一个执行租约，只有一项任务占用。身份绑定 Linux boot ID、PID 与进程启动时间；无法证明旧进程退出时不抢占。进程退出后，当前契约任务进入 PAUSED；旧契约仅释放已确认退出的技术租约，保留执行事实。PENDING 可在服务启动时继续排队，PAUSED/FAILED/CANCELLED 要求显式恢复并提供相同 inputDigest。

检查点按 taskId+子步骤键提交，恢复复用已完成产物。写回必须持有当前 leaseId；租约失效后拒绝迟到写入。外部副作用必须使用提供的幂等键。检查点本身不能保证模型请求恰好执行一次；模型调用前持久化预留，重试记入新 attempt，已完成生成结果先落 CAS 后交给后续阶段。

取消 RUNNING 只标记请求并传播 AbortSignal；执行器及子进程树清理退出前仍占用槽位。只有执行器返回后才能标记 CANCELLED 并启动下一任务。关闭服务先等待任务中止，再关闭存储。数据库失败向等待方抛出，不假装成功或重新启动。

## 预算

保留累计 modelCalls、reservedTokens、已报告 tokens 和 elapsedMs。预留与实际用量分开，不将预留标成供应商账单。operationId 在每次 attempt 中幂等；真实重试不能重复使用旧 attempt 的占额。取消、恢复、进程回收不清零用量。默认没有固定三轮或调用次数上限；显式预算耗尽、供应商额度失败和资源缺项暂停。供应商额度查询失败不能解释为无限额度。模型/编译执行器仍须遵守全局资源限制及进程树取消。

## 验证与剩余范围

`WorkbenchStages.test.ts` 使用真实 SQLite 连接和实际退出的子进程验证：完成子步骤复用、累计预算、跨连接取消和串行槽、进程回收、旧契约只读及迟到写入拒绝。完整五阶段一键链路、C/C++ 工具链与真实模型验收仍未完成；这些单阶段测试不证明完整产品交付。

<details lang="en"><summary>English summary</summary>

Versioned stages freeze input and budget, reuse committed checkpoints and serialize work using a process-owned SQLite lease. Cancellation retains the slot until cleanup completes. Only the index handler is connected so far; the complete language reconstruction pipeline remains pending.

</details>
