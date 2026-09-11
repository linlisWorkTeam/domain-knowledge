<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：记录 Agent Spec 缺口修复、端到端验证及完整产物位置。
-->
# Agent Spec 修复与端到端测试报告

## 2026-09-11：独立复审的四项修复

验收代码 `2ab6f14`。复审指出的问题均能复现，之前“测试全绿”没有覆盖原生代码伪造完成事实，以及 Registry 和 LangGraph 之间的崩溃窗口。此前把同进程 nonce 当可信边界、把 Orchestrator 重放当路由恢复覆盖的判断不成立；下面旧版记录仅保留历史用途。本轮先提交补充 Spec（`73e9b54`），各项验收后分别提交。

| Finding | 修复与实际验收 | 提交 |
| --- | --- | --- |
| 高：被测进程伪造逐项 PASS | 外部 Linux 监督器按清单逐个启动入口，以 ptrace 观察入口与返回地址、读取实际返回值。被测 stdout/stderr 只作日志；结果经子进程关闭的独立 FD 3 返回。原公开复现从 `true, 3/3` 变为 `false, 0/3`，后两个失败入口实际执行。还覆盖写结果 FD、改程序文件、fork、ptrace、兼容 ABI syscall、直接退出、信号、超时、符号缺失和内核拒绝 ptrace | `2ab6f14` |
| 高：router 重放报错或改写结论 | 以 `runId + iteration + route-v2` 固定路由结果，再执行幂等迁移与交接；已提交 Gate 可按相同证据取回。真实 LangGraph 在 Registry 之后、图更新之前注入异常并 resume；覆盖质量/Gate 的 ITERATE、STOPPED，另覆盖路由固定后迁移前、Gate 固定后路由保存前，以及输入冲突 | `cb104f6` |
| 中：cwd 原生绑定不正确 | 各命令分别解析 cwd，规范化根内 `.`/`..`，拒绝越界；编译输入、输出及 binary 路径采用一致解析，原参数保留。两个 build 子目录布局实际编译运行通过 | `0fb6188` |
| 低：整个 PR 差异存在尾随空格 | 删除测试中的尾随空格，改用 `git diff --check c33787b...HEAD` 检查真实 PR base 到 HEAD，检查通过 | `3029d7a` |

当前执行版本：`domain-agents-v8-supervised-routing` / `contract-v8`，测试证据协议为 `native-cases-v2-supervised`；旧协议缓存不能继承当前验收状态。

### 本次验证结果

- 定向修复与 SDK/路由回归：42/42 通过；最后增加监督进程逐项日志和工具指纹后，对应 22/22 复验通过。
- 全量 `npm test`：311/311 通过，216.4 秒，无跳过或取消。
- 浏览器：14/14 通过，39.9 秒。
- 独立保留产物 SDK 端到端：1/1 通过，24.2 秒。
- TypeScript、Spec 校验通过；整个 PR 的差异格式检查通过。

### 本次完整流程及证据

Run ID：`9fb44b1c-01a6-41b6-90cb-81de65ef6d13`。结果 `COMPLETED / PASS / VERIFIED`，总轮数上限 2，实际 iteration 0、1，发布一次。13 次模型调用，5 次评测，79 个 CAS 工件均核验摘要，83 条事件。模型响应受控，但 SDK、LangGraph、数据库、编译、监督与函数执行都实际运行。

原始测试先错误期望 3，监督器记录正常返回非零，参考校验失败；TestGen 修复为 4 后固定测试集。首轮重建仍返回 3，Check/评测/Review 促成知识修订；第二轮复用同一清单，重建返回 4，各入口由监督器观察到正常返回 0，Gate PASS 后发布。

保留目录：`.workpanel/acceptance/2026-09-11-review/`。原复现和修复日志、测试日志及报告位于根目录；完整 SDK 产物在 `e2e/`：

- `evaluation-index.json`：五次评测；每个 `caseExecution.records` 包含 entered、returned、返回值、监督原因和实际进程输出。
- `evaluations/*/NativeCaseSupervisor.c`、`NativeCaseSupervisor`：独立编译的监督器源码及二进制；`workspace/.flywheel/` 保留实际单入口 runner；项目编译二进制、归档和评测输入输出均保留。
- `model-exchanges.jsonl`、`readable/`：13 次完整请求/响应及两轮知识、测试、代码。
- `runtime-*/`、`cas-index.json`、`workflow-result.json`：SQLite/CAS、LangGraph 检查点、SDK 资料和全部事件。
- 根目录 `SHA256SUMS` 核对全部本轮保留文件；归档为 `.workpanel/acceptance/AgentAcceptance-2026-09-11-review.tar.gz`。

原始产物保留在当前工作区，不随 PR 上传。

### 明确的适用边界

监督执行当前限定 Linux x86_64、可用的 ptrace / PTRACE_GET_SYSCALL_INFO、gcc、nm 和保留入口符号的原生构建。未知 syscall、写文件、派生进程、修改其他进程、监督工具不可用均失败，不能降级为 stdout 计数。普通返回失败后继续调度其他用例，超时仍遵守 binary 命令总预算。每个用例独立进程，不支持依赖跨用例全局状态的测试布局。

监督器保护的是逐入口执行和结果通道，不负责判断断言是否充分，也不等同于文件读取隔离、完整部署沙箱或外部模型质量验收。系统接口依据见 [Linux ptrace 手册](https://man7.org/linux/man-pages/man2/ptrace.2.html)。路由验收通过精确边界的异常注入和真实 LangGraph resume 完成，没有声称用操作系统强杀命中了相同窗口。既有共享能力待办及用户延期事项仍不计为完成。


## 历史：2026-09-11 第一轮六项验收

代码版本：`9f34a85`。先提交可执行 Spec（`9f29682`），再对每项缺陷记录失败复现、实现、通过验收后单独提交。以下是当时的测试结果，复审发现的缺口以本文首节为准；后文 2026-09-10 的 266 项测试及 `2/2` 计数是历史记录，不能替代本轮验收。

| Spec 验收项 | 实现与通过条件 | 独立提交 |
| --- | --- | --- |
| AC-AGENT-101 | .cpp 与辅助 .h 正常编译；头文件不能冒充入口；未关联翻译单元被拒绝 | `1f48c63` |
| AC-AGENT-102 | 使用项目原生编译/执行绑定，保留 -D、-I、链接及运行参数；缺失绑定、不可解析脚本转人工，不盲目修测试 | `907596c` |
| AC-AGENT-103 | 清单声明唯一 entryPoint，框架生成 runner 逐项调用；漏项、重复/未知记录、提前退出、汇总冒充失败；C/C++、多文件及旧缓存迁移均验收 | `9f34a85` |
| AC-AGENT-104 | Worker 的 CAS、提示词与实际工作区都只包含分配源码和共享接口；并发、失败重试及复用不泄露兄弟任务源码 | `43c8363` |
| AC-AGENT-105 | maxIterations 包含首轮；上限 1 不启动第二轮，上限 2 可第二轮通过；质量分支和入口共用 Domain 规则，同轮重放幂等 | `b0c1d64` |
| AC-AGENT-106 | 测试失败、文档范围提案、质量耗尽、Gate 停止均保存可操作摘要和 CAS 证据，有 Review 历史则保留；重放不重复交接 | `22cb8cf` |

角色执行版本为 `domain-agents-v7-case-execution`，节点为 `contract-v7`。已固定的旧协议测试转人工迁移，源码不变时不会悄悄重新生成测试。Worker 子任务版本升级为 `subagent-v3`，避免复用旧的未裁剪材料。

### 当前验证

- 全量 `npm test`：292/292 通过，152.1 秒，无跳过或取消。
- 独立保留产物的 SDK 端到端：1/1 通过，20.8 秒。
- 浏览器 `npm run test:ui`：14/14 通过，31.3 秒。
- TypeScript、Spec 校验和差异格式检查通过；Spec 为 17 schemas / 7 commands / 8 results / 52 p0。
- 每项失败复现和通过日志：`.workpanel/acceptance/2026-09-11/101-red.log`、`101-green.log`，其余按编号 102～106 对应命名。全量日志为 `full-suite.log`。

### 完整运行与产物

Run：`fdb9476a-ce71-4bb6-81a7-01b7b98d2ab9`。最终 `COMPLETED / PASS / VERIFIED`，业务轮次为 0、1，上限为 2，只发布一次。13 次受控模型调用覆盖七个角色，保留 81 条事件、5 次实际编译执行评测、75 个 CAS 工件；CAS 内容摘要全部核验一致。

| 实际测评 | 逐用例结果 | 后续动作 |
| --- | --- | --- |
| 首轮参考测试，错误期望为 3 | case-1 FAIL，0/1 | TestGen 获得原候选及失败证据，有限修复 |
| 修复参考测试，期望为 4 | case-1 PASS，1/1 | 固定清单和测试源码 |
| 首轮生成实现返回 3 | case-1 FAIL，0/1 | Review 给出修订意见，Gate ITERATE |
| 第二轮参考重验 | case-1 PASS，1/1 | 同源测试复用，不再调用 TestGen |
| 第二轮生成实现返回 4 | case-1 PASS，1/1 | Review 历史复核，Gate PASS，发布 |

失败均为用例主动注入并成功处理的错误。当前 `1/1` 明确表示固定清单中的一个用例；不再把项目命令和附加命令的重复执行累计成业务用例数。另有三用例验收验证完整调用、普通失败后继续执行、缺记录及提前退出的拒绝路径。

完整目录：`.workpanel/acceptance/2026-09-11/e2e/`，保留原始 Git 仓库、完整模型请求/响应、逐轮文档、测试及重建源码、框架生成的 runner、编译二进制、stdout/stderr、SQLite、CAS、LangGraph 检查点和 SDK 材料。

- `readable/`：按模型调用顺序整理的提示词、输出、知识 Markdown 和源码。
- `evaluation-index.json`：五次测评及各自的清单、随机执行标识、逐项结果。
- `evaluations/*/workspace/.flywheel/CaseRunner-0.cpp`：实际使用的框架 runner。
- `cas-index.json`、`workflow-result.json`、`summary.json`：内容核验、事件与最终结果。
- 上级目录 `SHA256SUMS` 校验全部本轮保留文件；相邻归档为 `AgentAcceptance-2026-09-11.tar.gz`。

原始产物仅保留在本工作区，不随 PR 上传；报告和验收代码随提交保存。

### 本轮边界

本轮关闭以上六项可复现缺陷，不代表全部历史 Specs 都已完成。受控 HTTP 响应通过真实 DSH SDK、LangGraph、SQLite/CAS 和 G++ 执行；它证明编排、权限材料交接和逐项执行协议，不证明外部模型的测试业务质量或部署级进程隔离。复杂构建脚本仍需适配，当前无法证明绑定时明确转人工。先前延期的 Worker 业务分组/预算/依赖、分阶段文档合成、相似度算法，以及共享配置版本、资料清理、历史最优回退、成本/停滞策略和公司 CLI 验收仍保持未完成状态。

## 2026-09-10：历史验收记录

测试日期：2026-09-10，北京时间。代码版本：`4c5c580`；分支：`feat/next-agent`；PR：[#46](https://github.com/linlisWorkTeam/domain-knowledge/pull/46)。后续报告提交仅更新文档与文件清单。

上一轮审查的九项问题已完成修复，并有九个针对性回归用例。完整端到端运行得到 `COMPLETED / PASS`，Run 最终为 `VERIFIED`，只发布一次。此次使用可控模型响应、真实 DSH SDK 与 HTTP 流、真实 LangGraph、SQLite/CAS、G++ 编译和二进制执行；不构成外部真实模型的业务质量验收。

## 修复结果

| 审查问题 | 修复及验证 |
| --- | --- |
| 项目旧测试通过，但生成测试没有执行 | 在项目命令之外，由受信层根据测试清单构建独立编译及执行计划。生成文件含 `#error` 时不能固定测试集，修复耗尽后停止。 |
| 漏生成的实现沿用原文件 | Code 收到独立的必需重建路径；缺失即拒绝输出。评测器也检查完整性，并在覆盖前移除目标原实现。可选输出白名单与必需输出范围区分。 |
| Review 原文定位无法交给 DocGen | 共用定位解析；唯一原文片段规范化为所在章节，并继续校验章节之外正文未被改动。 |
| 缺少比较规则被当成无差异 | Check 在模型调用前拒绝空规则、空规则内容及重复标识。缺失配置不能进入发布。 |
| 重建执行超时后缺少评测引用 | Gate 使用刚保存的真实评测引用，返回 STOPPED，证据保留，不能发布。此项是原有问题。 |
| TestGen 修复看不到上一版测试 | 修复输入显式加载上一候选 raw output，包含测试文件和用例全文，同时传入失败证据。 |
| Check 接受虚构原实现证据 | sourceSnapshotRef 的冻结清单包含 Git 提交中的原文；original、generated 分别核对对应文件。 |
| 编排计划只保存、不执行模块选择 | 明确授权的模块概览进入规划；每个 Run 选一个模块，Application 绑定实际模块、源码快照及后续任务，迭代不可改换模块。回归测试验证选中模块成为最终发布模块。 |
| Review 历史与人工交接不足 | 提供先前文档、评测、比较及意见全文；有历史时要求 historySummary。STOPPED 生成带问题、建议、历史和证据入口的待办摘要，重放不重复写交接事件。 |

角色执行版本升级为 `domain-agents-v6-bound-evidence`，节点契约为 `contract-v6`，阻止旧检查点被当成本轮实现的成功证据。

## 完整端到端用例

入口：[AgentRevisionFlow.test.ts](../../tests/acceptance/AgentRevisionFlow.test.ts)。

参考项目为独立 Git 仓库中的 C++17 函数 `calculate()`，正确结果为 4。用例主动注入两类错误，验证修复和修订链路，不能用这些可控错误衡量真实模型成功率。

| 步骤 | 实际发生的行为与结果 |
| --- | --- |
| 规划与内部分析 | Orchestrator 规划 dsh-module，DocGen 调用一个内部 DocWorker。 |
| 第一次生成测试 | 测试错误断言结果为 3；参考执行失败。 |
| TestGen 修复 | 收到前版测试源码、case-1 及失败报告；修正期望为 4，参考执行成功，测试集固定。 |
| 第一轮知识与重建 | 文档仍错误声称返回 3；Code 生成返回 3 的实现。Check 发现差异，真实执行失败。 |
| Review 与 Gate | Review 定位原文，给出问题、建议及比较/评测依据。Gate 为 ITERATE，未发布。 |
| 第二轮修订 | DocGen 按“行为契约”章节修订为 4；复用内部 Worker 结果和固定测试集。 |
| 第二轮测评与历史复核 | 重建实现返回 4；编译与执行通过；Review 读取前轮正文和失败证据，输出历史对比。 |
| 发布 | Gate 为 PASS，最终知识 VERIFIED，只产生一次发布。 |

- Run ID：`7c3b0002-5d5c-44df-95aa-f745b27b09f6`。
- 运行时间：18:15:40 至 18:16:09；整个测试进程约 32.0 秒。
- 13 次模型调用，覆盖七个角色；TestGen 修复调用一次，第二轮不再调用模型生成测试，也不重跑 DocWorker。
- 5 次独立评测，73 个 CAS 工件，81 条 Run 事件。
- 第一次 Gate：ITERATE；第二次：PASS；最终版本 `kv_647e2776f645198db1cc2811`。

成功测评记录的 `2/2` 是同一个业务断言分别由项目命令和绑定测试计划执行，共两次；不是两个不同业务用例。失败程序在输出 TAP 前断言退出，计数为 `0/0`，失败结论来自真实非零退出码。

## 产物与复查入口

完整目录：`.workpanel/acceptance/2026-09-10-1818/`。该目录被 Git 忽略，仅保留在本工作区，不随 PR 上传。

- `scenario.json`、`source-EV3Mwv/`：完整场景和原始 Git 仓库。
- `model-exchanges.jsonl`：13 次完整模型请求、提示词及响应；HTTP 响应由本地测试服务提供。
- `readable/`：按顺序命名的模型输出、提示词、两版知识 Markdown、测试源码及重建源码。
- `evaluations/`：每次测评的输入、冻结源码归档、完整工作区、生成代码、编译后的程序、stdout/stderr、退出状态及 evidence.json。
- `runtime-HCSyzH/`：SQLite Registry、LangGraph 检查点、CAS、角色隔离工作区与 SDK 运行材料。
- `workflow-result.json`：最终执行状态、Run、81 条事件及 Provider 调用记录。
- `cas-index.json`：73 个 CAS 工件及 SHA-256 校验结果；`evaluation-index.json`：五次评测索引。
- `e2e.log`、`full-suite.log`、`ui-tests.log`、`validation.log`：本次验证日志。
- `SHA256SUMS`：完整目录的文件校验清单；打包文件在相邻目录 `AgentAcceptance-2026-09-10.tar.gz`。

优先阅读 `readable/04-doc-gen.md`、`readable/08-review.json`、`readable/10-doc-gen.md`、`readable/13-review.json`，再根据 `evaluation-index.json` 查看实际执行证据。

复跑时使用一个新的保留目录，防止不同 Run 的报告相互覆盖：

```bash
export PATH=/root/.nvm/versions/node/v24.13.0/bin:$PATH
WP_ACCEPTANCE_OUTPUT=/absolute/path/to/new-output \
  node --test tests/acceptance/AgentRevisionFlow.test.ts
```

## 验证状态

| 检查 | 结果 |
| --- | --- |
| `npm test` | 266/266 通过，约 195.5 秒，包含九项缺口回归及完整 SDK 流程 |
| 独立保留产物的端到端用例 | 1/1 通过，约 32.0 秒 |
| `npm run test:ui` | 14/14 通过，约 59.1 秒 |
| `npm run typecheck` | 通过 |
| `npm run validate:specs` | 通过：17 schemas / 7 commands / 8 results / 52 p0 |
| `git diff --check` | 通过 |
| CAS 内容完整性 | 73/73 工件 SHA-256 与存储标识一致 |

## 范围与限制

本报告关闭上一轮九项具体审查问题，不将它们扩展成“全部 Spec 已验收”。原有共享能力待办——独立项目配置版本管理、Knowledge 治理后资料清理、Evaluation 历史最优版本选择/回退及成本预算/停滞策略——仍需继续实现，不属于本次九项修复完成的证据。本次按要求保留所有端到端中间产物，没有执行清理。

用户已明确延后的 IO-08 Worker 业务分组与预算/依赖、IO-10 分阶段文档合成，以及 Check 相似度算法和阈值研究均未扩展。

当前原生绑定测试计划支持独立 C/C++ 测试入口与直接源码编译；复杂第三方构建系统需要专门适配。本次只验证一个返回值行为，未验证大型业务仓库、真实模型推理质量或公司 CodeAgent CLI。受控 SDK 测试沿用现有测试配置关闭进程隔离；文件读取授权仍受角色限制，不能将它作为真实部署隔离验收。
