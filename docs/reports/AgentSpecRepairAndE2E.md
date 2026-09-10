<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：记录 Agent Spec 缺口修复、端到端验证及完整产物位置。
-->
# Agent Spec 修复与端到端测试报告

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
