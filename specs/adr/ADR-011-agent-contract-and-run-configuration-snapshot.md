<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明ADR-011：Agent 运行契约与 Run 配置快照。
-->
# ADR-011：Agent 运行契约与 Run 配置快照

- 状态：Accepted
- 日期：2026-09-03

## 背景

七个 LangGraph Agent 节点已经可以通过确定性 Fixture 或 Provider 运行，但 `specs/schemas` 中的 `AgentCommand`、`AgentResult` 仍主要用于规范校验，生产调用链尚未统一消费这些信封。节点执行时还会读取最新 `promptAddon`，导致同一个 Run 的前后节点可能使用不同配置，难以复验。

本阶段只验证框架契约和运行机制，不评价真实模型质量，也不接入公司 CodeAgent CLI 或启用 Redis。

## 决策

### 统一信封

每次 Agent 调用必须形成版本为 `1.0` 的 `AgentCommand`，至少绑定 `commandId`、`runId`、`agentType`、`generationKey` 和角色 payload。调用前必须通过 Draft 2020-12 Schema 校验；失败时不得启动 Provider 或调度下游。

Provider 返回值首先视为不可信的角色原始输出。工作流负责执行角色专属校验、把正文或代码等大对象写入 CAS，再规范化为 `AgentResult`。只有通过统一 `AgentResult` Schema 的结果可以成为节点输出并被下游消费。Provider 不生成或猜测 ArtifactRef。

Provider 所见动态上下文必须直接属于 `AgentCommand.payload`，或由其中 ArtifactRef 经过内容摘要校验后物化；不得再附加未版本化的上下文对象。`AgentResult.commandRef` 必须指向原始受信命令，下游同时核对 `runId`、`agentType`、`commandId` 和 `generationKey`，防止跨 Run、跨节点或跨迭代复用合法但不属于本次执行的结果。

Provider 的角色文件视图必须从 Run 快照绑定的 Git commit 读取，不能复制调用时的可变工作树。DocWorker 的源码白名单必须收窄到本 Worker 的 `assignedSourcePaths`；公开接口可以作为所有文档类 Worker 的共享只读输入。

七个角色保持不变：`orchestrator`、`doc-gen`、`doc-worker`、`test-gen`、`code`、`check`、`review`。统一信封不能改变图拓扑、职责、工具权限或确定性 Gate 的发布权。

### RunConfigurationSnapshot

工作流启动时必须生成并持久化不可变 `RunConfigurationSnapshot`，包含：

- `schemaVersion`、`runId`、捕获时间；
- Provider 类型、模型标识和非敏感参数摘要；
- AgentCommand/AgentResult Schema URI 与内容摘要；
- 七个 Agent 的 prompt revision、基础提示词摘要、追加提示词摘要、有效提示词摘要和工具权限。

快照不得保存 token、Cookie、完整 Prompt、用户目录或 Provider Session。Run 启动后，节点只读取这份快照；操作员后续修改 `promptAddon` 只影响新 Run。

恢复 Run 时必须先比较当前运行时与快照。Provider、模型、非敏感参数摘要、基础 Prompt、工具权限、Schema URI 或 Schema 内容摘要不一致时拒绝恢复；系统不得悄悄改用当前环境配置。运行期间修改 `promptAddon` 不阻断旧 Run，但旧 Run 继续读取冻结的有效 Prompt 工件。

### Review 与基础设施失败

ReviewAgent 只审查已经形成的正常评测报告。认证失败、超时、进程崩溃、Schema 错误和其他基础设施故障由确定性工作流分类并进入 `STOPPED` 或可恢复失败路径，不额外调用 ReviewAgent。ReviewAgent 仍无权决定状态或发布。

## 验收

1. 七种合法命令和成功结果通过运行时 Schema；错误版本、缺字段、未知字段和角色错配在 Provider 或下游执行前失败。
2. 同一 Run 中途修改 Agent 配置不会改变后续节点使用的 prompt revision；新 Run 使用新 revision。
3. 配置快照能按 `runId` 查询和导出，但不包含完整 Prompt 或凭据。
4. 基础设施失败不会调用 ReviewAgent；正常评测仍经过 ReviewAgent。
5. 原有七个 Agent 和 LangGraph 边保持不变。

当前实现证据：运行配置冻结由 `tests/integration/RunConfiguration.test.ts` 验证；七类运行时结果信封、命令先验校验及原拓扑覆盖由 `tests/integration/AgentContracts.test.ts` 和 `tests/acceptance/AutomatedLanggraphFlow.test.ts` 验证。真实模型输出质量不属于本 ADR 的完成条件。

## 后果

- Adapter 可以更换为公司 CodeAgent CLI，而不改变 Domain/Application 或节点契约。
- Checkpoint 恢复能够重用同一配置与 Schema 版本，评测报告具备可复验配置摘要。
- 新增 Schema 规范化和 CAS 写入步骤，但大对象不会膨胀 GraphState。

## DEV-019：DSH 角色底座（2026-09-07，T102）

LangGraph 负责业务图调度，DSH SDK 负责每次角色会话及工具分派。`ProjectWorkflowStages` 只组装业务命令、校验结果、关联 CAS/事件；预写场景输出位于独立 Fixture Adapter。Schema 重试最多三次且每次新 session/home，图级重试继续受业务 checkpoint 保护。取消与超时关闭 DSH，迟到成功不能覆盖取消或提交业务结果。

DSH 默认适配配置为原生 `sdk-minimal`，最后一层项目策略关闭 Bash/编辑工具，通过 DSH 注册 `read_material` 并安装不可被 allow 覆盖的执行 guard。编排角色无工具，其余角色只读自身已物化材料；写入仅通过经过校验的业务 Result。Code 的参考源码隔离仍由固定 Git 版本、角色白名单与生产 bubblewrap 共同保证。该插件不维护额外会话、模型循环或工具调度。

T102 验证使用真实 DSH SDK/进程和本地受控 SSE 模型服务，覆盖授权读取、越界/符号链接/隐藏文件及 shell 拒绝。它证明运行机制，不证明真实模型业务质量；默认服务配置与 Pi 迁出分别由 T106/T105 验收。

## DEV-019：DSH 配置迁移（2026-09-07，T105/T106）

默认角色执行与 Console/API 模型配置已迁到原生 DSH，直接 Pi Agent SDK 和固定项目公共执行器已移除。业务 Command/Result、CAS、独立评测与 Gate 保持原有责任。CodeAgent CLI 仅保留后置适配接口。

配置捕获时，将已验证的非敏感参数绑定到快照摘要，并在进程内保留对应运行配置。管理员修改模型或 URL 后，进行中的 Run 继续使用冻结配置和 Prompt；新 Run 使用新配置。节点读取 Prompt 仍校验契约、基础 Prompt、工具和工件完整性，但不因管理员修改当前 Provider 而切换或阻断已运行批次。恢复入口始终检查当前 Provider 与快照一致；进程重启后不能靠内存缓存绕过该检查。凭据不进入快照，参数一致时允许使用重新验证后的轮换密钥。

历史 Pi Run 与旧加密配置保持可读，禁止跨后端恢复；旧密钥不会自动复制到 DSH。设置中的旧记录显示 `PROVIDER_MIGRATION_REQUIRED`，须重新配置并验证后创建新 Run。回归证据见 `tests/integration/DshConfigurationMigration.test.ts`、`dsh-configured-provider.test.ts` 和 `tests/acceptance/DshConfiguredFlow.test.ts`；七角色使用真实 DSH 进程和受控模型响应，R2 live 模型验收另计。
