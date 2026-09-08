# 分阶段验收

状态：R1 的 AC-DSHF-006、007 及 002、003 自动化部分已通过本地验收；配置/依赖条款已同步 baseline 并合入。R2 的 AC-DSHF-001～004 已通过本地验收（002/003 沿用 R1 回归并补本轮证据），PR #26 待审查；R3/R4 未执行，详见 evidence.md。

## 底座与范例

| 场景 ID | 关联需求 | Given / When / Then | 证据要求 |
| --- | --- | --- | --- |
| AC-DSHF-001 | KF-SYS-019、025、031 | Given 普通 CPU 环境及配置好的 DSH，When LangGraph 执行示范角色，Then 由 DSH 完成真实调用，公共入口不依赖 Pi 或固定项目执行器 | DSH 版本、配置摘要、任务与 session 关联、实际输入输出工件；自动回归与 live 证据分别记录 |
| AC-DSHF-002 | KF-SYS-006、011 | Given 合法与非法业务输出，When 收集 DSH 结果，Then 合法结果校验后入库，非法结果不得推进下游，均可关联角色和任务 | 契约及集成测试；角色结果、事件和工件摘要 |
| AC-DSHF-003 | KF-SYS-010、011 | Given 失败、取消和重试场景，When 控制节点执行，Then 结果与失败原因可追踪，重复尝试不产生重复业务提交，取消不会被迟到的成功覆盖 | 受控故障测试及取消证据；完整四点崩溃验证仍与 DEV-012 对齐 |
| AC-DSHF-004 | KF-SYS-021、025、031 | Given 文档与角色范例，When 开发者按 SOP 修改示范角色并独立验证、接回图，Then 无需新增模型会话或工具运行框架即可交付结果 | 范例源码、真实可执行步骤、复现记录及角色权限边界验证 |

固定角色权限不能仅靠提示词证明；独立 session 不等于文件隔离。日志与公开证据不含凭据和完整 Prompt。未安装 CLI 不应阻塞上述验收。

## 外部第一版完整闭环

AC-DSHF-005（关联 KF-SYS-001、004、017、025）：Given 固定版本的可信源码、通过的参考测试和真实 DSH 环境，When 七角色执行知识生产与行为评测，Then 产生可追溯候选文档、fresh 生成实现、独立评测结果和确定性发布；失败归因与修订必须有单独可复现证据。

本项与现有 AC-E2E-001/002/003 对齐后才能合入 baseline。第一轮直接通过的真实样例不能替代失败修订路径验收；测试注入、夹具或预写工件必须标识，不能冒充自然发生的模型行为。

## 完成判据

文档检查通过仅说明本轮指导已落稿。R1 的 AC-DSHF-006、007 和 R2 的 AC-DSHF-001～004 均通过才表示底座与范例可用；七角色还须通过 AC-DSHF-008，完整闭环须通过 AC-DSHF-005 和既有业务门禁。公司 CLI、CANN 硬件性能和生产容量不由这些结果证明。

## 底座迁出与配置验收（R1）

以下增补与原 AC-DSHF-001～005 一起使用，不能只证明 SDK 能调用就认定旧底座已迁出。

| 场景 ID | 关联需求 | 执行步骤 | 通过条件 |
| --- | --- | --- | --- |
| AC-DSHF-006 | KF-SYS-019、022、025、031 | 检查源代码依赖、组合根、package 与锁文件；启动默认服务；用两个模块名、目录和测试命令不同的场景运行同一接线，至少一个不含 ohMyWorkPanel 布局 | 无 Pi SDK 执行依赖或新 Run 路径；不导入/实例化 `OhMyWorkPanelWorkflowExecutor`；公共逻辑不含项目专有路径或命令。历史文档/数据中出现旧名称不算运行依赖。自动化场景可用标识清楚的夹具，live 由 R2 验证 |
| AC-DSHF-007 | KF-SYS-010、031、041；KF-UI-021、AC-API-010 | 通过配置 API 和 Console 保存、验证 DSH 配置并启动新 Run；修改配置；读取旧 Pi Run 并尝试恢复；在无公司 CLI 的环境启动 | 新 Run 使用经过验证且冻结的 DSH 配置；旧 Run 不被篡改或换后端重跑，不兼容恢复明确失败；新设置不会改变进行中的 Run。认证与敏感配置不泄露；没有 Pi 回退或公司 CLI 启动前置 |

源码扫描用于定位残留，不能替代启动、模块依赖与行为测试。旧 Pi 专用测试应迁移其仍适用的配置安全、可观测性和恢复断言；不能只删测试来达到通过。DSH headless 诊断入口不能作为不满足工作区隔离时的回退。

2026-09-08 解耦补充：AC-DSHF-006 同时检查公共服务不硬编码特定验收项目的知识分类和标签。移除旧项目专属资产和 CLI 后，真实源码两轮回归、双场景 LangGraph 回归和幂等发布断言仍须通过。OpenCode Go 环境配置须在没有部署目录时正常生成 DSH patch，密钥值不写入 patch/快照，地址、模型和上下文变化使旧 Run 恢复校验失败；已保存 Console 配置与显式 patches 的优先级保持既有语义。自动验证入口为 `tests/integration/opencode-go-config.test.ts`，不替代真实模型调用验收。

## 七角色逐项验收（R3）

AC-DSHF-008（关联 KF-SYS-001、004、011、021、025、031）：在已通过 R2 的底座上，各角色都须实际经过 DSH 执行，符合既有业务 Schema、材料边界和可追踪要求；使用固定输入完成下表的正向场景，并以受控输入/故障验证失败边界。夹具与真实调用分别标记，不以 Schema 合法代替业务结果正确。

| 角色 | 必须检查的交付 | 必须验证的边界 |
| --- | --- | --- |
| orchestrator | 可关联源码/模块的业务计划与任务输出，交由固定 LangGraph 图消费 | 非法任务不能扩展图或授予权限；不另建嵌套调度器 |
| doc-worker | 绑定来源和定位信息的材料整理结果 | 缺失来源或无权读取材料时明确失败/不足，不编造引用 |
| doc-gen | 可定位来源、覆盖样例行为的候选知识，支持定向修订 | 不支持的事实不写成确定结论；修订不能越过授权范围 |
| test-gen | 可在可信参考源码运行的候选测试与预期依据 | 未经参考验证的测试、零测试、损坏测试不得作为通过证据 |
| code | 仅根据授权知识及公开接口在 fresh 工作区生成允许路径的实现 | 不能读取参考实现、门禁答案或上一轮私有实现；不能修改测试来通过 |
| check | 对当前实现和允许规则形成可关联问题的结构化检查结果 | 无写权限；模型自报通过不替代独立测试或 Gate |
| review | 根据授权证据形成可执行 Correction，或在无需修订时返回合法空修订 | 不得直接发布、改 Run 状态，或将其他 Run 的证据带入当前结论 |

逐角色都要覆盖：正常业务输出、材料不足、非法 Schema/错配身份和执行失败；涉及工具的角色验证权限拒绝。共享底座的超时/取消等失败矩阵可复用 R1 测试，不要求七套重复实现。联调时七个角色的 command/result、Run/任务/session、工件和节点事件必须可对应。

## 执行验收的命令与步骤

### R0 基线与每阶段相关回归

在仓库根目录使用 Node 24。新 worktree 先执行 `npm run bootstrap:worktree` 至 `READY`，之后执行 `npm run bootstrap:worktree:check`；已有工作区先检查依赖是否与锁文件匹配。

以下命令已存在于仓库，可作为 R0 基线及 R1 相关回归：

```bash
npm run typecheck
npm run validate:specs
npm run test:architecture
node --test --test-concurrency=1 tests/integration/deepseek-harness-agent.test.ts tests/integration/agent-contracts.test.ts tests/security/agent-workspace.test.ts
```

R1 已新增或迁移 AC-DSHF-006、007 对应行为测试：`tests/integration/dsh-configuration-migration.test.ts`、`dsh-configured-provider.test.ts`、`tests/acceptance/dsh-configured-flow.test.ts` 及双场景全流程测试；继续执行受影响的 Provider、server 和 Console 回归。配置页面发生变化时执行 `npm run test:ui`，对可见结果检查错误状态、配置生效及旧 Run 提示。以上基线命令不能替代新场景测试。测试文件迁移时同步本文的真实路径。

### R2、R3 真实角色与 R4 闭环

R2 入口现为 `npm run example:docgen -- prepare|run|check`，独立工作区与角色修改步骤见[角色教程](../../../../docs/tutorials/add-agent-capability.md)。缺少实际 DSH 配置时 live 验收保持 BLOCKED；在 evidence.md 分别记录参考测试、受控回归和实际模型结果。T201 同样补齐通用七角色闭环命令，不能继续把固定 ohMyWorkPanel 入口当作通用启动证明。

实际验收按以下步骤进行：

1. 固定仓库版本、场景输入和工具链，先运行非空参考测试；失败则停止验收。预期来自可信参考或确认过的规则，不能由待验角色自己宣布正确。
2. 启用真实 DSH，运行教程入口。R2 检查 DocGen 真实调用、业务正确性和 CAS 工件；在独立工作区修改角色指令并再次运行，证明 SOP 可复用。R3 检查七角色逐项输出与联调记录。
3. R4 使用真实 DSH 生成知识与 fresh 实现，候选测试先经可信参考验证，再独立测试生成实现。检查测试计数、退出码、Gate 输入与发布回执，核对只有满足业务门禁才产生 `VERIFIED`。
4. 单独执行可复现的失败 → 归因 → 定向修订 → fresh 再生成场景。自然失败与受控注入分开记录；不得用预写知识/代码冒充模型输出，首轮直接成功不豁免该项。
5. 执行取消/恢复和不兼容快照、停止、重复发布场景；取消不得被迟到成功覆盖，重复发布须返回同一回执。按既有要求补足 DEV-012 相关恢复/权限验收，不能因其排在其他工作项而跳过。
6. 按教程在独立工作区复现；完成 R4 回归。所有必需场景通过后才更新完成状态。

R4 收尾命令均为现有脚本：

```bash
npm run typecheck
npm run validate:specs
npm test
npm run evaluate:framework
npm run site:check
npm run test:ui
```

真实模型网络或凭据缺失记为 `BLOCKED`，不把对应 live 用例跳过后计为通过。普通 CPU 样例不替代既有 C++ 语言插件验收；本 roadmap 不增加公司平台或 NPU 作为第一版环境前提。

## 证据记录及阶段判定

在现有 evidence.md 追加阶段记录：R/T/AC 编号、代码 commit 或未提交差异说明、执行日期、Node/DSH/工具版本、样例 commit、脱敏命令和关键非秘密配置、退出码/测试计数、Run/session 与工件引用、结论及未解决项。机器输出保存到运行产物，文档只记定位信息和摘要，不新增阶段报告。不得把完整 Prompt、密钥或参考答案写入公开证据。

阶段结果只用 `PASS / FAIL / BLOCKED / NOT_RUN`：全部必需检查通过才能 `PASS`；断言不满足为 `FAIL`，环境阻塞为 `BLOCKED`，未执行为 `NOT_RUN`。任务未验收保持未勾选。DEV-019 完成要求 R0～R4 的必需检查全部通过；后置公司 CLI 另由 DEV-010 验收。
