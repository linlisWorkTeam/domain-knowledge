<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：记录 Agent Spec 缺口修复、端到端验证及完整产物位置。
-->
# Agent Spec 修复与端到端测试报告

## 2026-09-14：Worker 分配范围由框架补齐

用户确认 analysisScope.files 不应由模型生成，分配源码与参考接口的区别由框架掌握。本次在独立工作树 `/tmp/domain-knowledge-worker-scope`、分支 `fix/docworker-derived-scope` 实现：模型 Draft/Schema 不再包含 files，Domain 入口在校验回答后复制 assignedSourcePaths，未提供时复制 input.sourcePaths，组装成完整 Output/knowledgeChunk 再保存并交给 DocGen。Prompt 明确模型只写分析内容、不回填该字段；旧模型回答不能覆盖框架分配。

每个分配文件至少一项 sourceEvidence、证据/provenance 路径授权及模块一致性检查继续保留。空、重复、越界分配在模型调用前拒绝。没有将参考头文件禁止读取，也没有删掉缺失依据检查。同步独立样例、内部 Worker fixture 和受控 SDK 回答；角色执行版本升级为 `domain-agents-v11-worker-derived-scope` / `contract-v11`，内部键为 `subagent-v4`，旧产物保持可读但不静默恢复为新协议。

先用不含 files 的模型回答验证旧入口拒绝，再实现组装。Node 24.13.0 独立 bootstrap READY；Worker 角色测试 9/9，涵盖 cJSON 目标配两个参考头文件、显式/默认分配、输出不改写模型回答、缺少第二文件依据和越权拒绝。DocGen 子任务/材料边界/配置/独立入口集成 20/20；DSH SDK 与 LangGraph 受控流程 4/4，其中包括测试修复、知识修订与 Gate 发布。TypeScript、Spec（17 schemas / 53 p0）及差异格式检查通过。验证结果属于框架契约与接线，模型响应受控，没有调用外部真实模型或新建 cJSON 验收 Run，没有新增永久 CI。

本节修复仅处理 Worker 字段职责。下节 v10 真实批次的 FAIL、原始模型回答和 runtime 原样保留；本次没有解决 TestGen 超时或节点终态持久化，也不改写旧验收结论。IO-09 与 AC-AGENT-104 的实现/测试关联更新在 [Worker Spec](../specs/domainFunction/agents/docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.md)。

## 2026-09-14：v10 cJSON Utils 真实完整验收，未通过

已更新[原验收计划](../specs/infrastructure/evaluation/Evaluation.md#2026-09-14-修复后新一次完整验收)并实际启动用户授权的一次新 Run：`cb4a4f5a-d24f-47a1-87ca-37aba9a35786`。北京时间 12:04:28—12:15:08，639.622 秒，最终 `FAILED`，停在 iteration 0。DocWorker 的覆盖范围声明无效，随后并行 TestGen 达到 10 分钟节点超时。完整知识飞轮仍未通过；本次没有候选知识、评测记录、Gate 决策或发布，不把旧知识和 v9 独立 Check 的成功导入本次运行。

### 版本、材料与实际预算

GitHub 已现场核对 PR #49 为 MERGED，最新 origin/main 是 `22fe34fdf1ee9e37c08d0bd17a03b2c7e4103cf0`。独立分支 `test/cjson-utils-v10-real-e2e` / `/tmp/domain-knowledge-cjson-v10` 从它创建；执行 HEAD 为计划提交 `4f5c8cc7631cd6f0602a70927e0197a24adbabc7`，生产源码、package.json 和 lockfile 与合并提交一致。契约为 `domain-agents-v10-check-evidence-guards` / `contract-v10`，Node 24.13.0 bootstrap/check 均 READY。主工作区及其他工作树未改动。

目标仍为 cJSON v1.7.19 / `c859b25da02955fef659d658b8f324b5cde87be3`，完整 `cJSON_Utils.c` 1481 行、14 个公开 API，moduleId=`cjson-utils-v1-7-19`。从已有固定源码本地 clone，229 个受控文件逐个 SHA-256 核验一致；原、新源码 Git 状态均干净。独立补充用例及转义复现文件摘要与旧版一致，旧测试与原实现未修改。

本次以固定版本实际行为为参考，RFC 符合性单独记录；TestGen 指令明确分别推导 Pointer 与 Patch 的路径行为、保留转义路径覆盖，不以标准预期替换原实现结果。Code 的生产输入边界仍仅限知识和编写配置，但本次未到达 Code，不能声称本批验证了它的实际隔离。

采用配置的真实 deepseek-v4-flash、生产角色入口、DSH SDK、Bubblewrap，全新独立 runtime。冻结预算为最多 3 轮（含首轮）、workflow.start 起 30 分钟、角色/节点 10 分钟、DocWorker=1、构建串行、TestGen 最多一次修复；Check 共最多三次报告尝试，outputAttempts=1、无嵌套重试；其他角色最多两次 Schema 尝试。SDK 每次尝试 timeout=600000，LangGraph 本身也设节点 timeout=600000，入口另有 checkpoint 累计监控。本次原生 TestGen 节点超时先结束 Run，外层 30 分钟和补充 watchdog 均未触发；没有第二轮、Schema 重试、TestGen 修复或 Check 报告修正。

### 实际节点与模型用量

| 阶段 | 实际结果 |
| --- | --- |
| Orchestrator | SUCCEEDED，39.329 秒；真实选择固定模块并提交计划 |
| DocWorker | SDK 返回结构有效回答，328.616 秒；Domain 拒绝 `DOCWORKER_COVERAGE_INVALID`，未提交成功结果 |
| DocGen | 内部 Worker 失败后停止，未调用汇总模型，未创建候选知识 |
| TestGen | SDK `DSH_AGENT_TIMEOUT`，600.002 秒；LangGraph 错误为 `Node "test_gen" exceeded its run timeout of 600000ms`，没有成功提交测试集 |
| 参考测试校验、Code、Check、重建评测、Review、Gate、发布 | 均未执行；不能根据旧批次或独立结果补记节点成功 |

共 3 个真实模型会话。Orchestrator usage 为 input=2191、output=2457、total=4648；Worker 为 input=19771、output=27354、total=47125。已知聚合 input=21962、output=29811、total=51773 tokens，仅覆盖两次完整回答。TestGen 会话以 aborted/disposed 结束，没有最终 usage，整批实际总用量和费用未知，不把 51773 称为完整总消耗或账单值。

### 失败原文与归因

Worker 的输入 assignedSourcePaths 只有 `cJSON_Utils.c`；模型的 analysisScope.files 为 `cJSON_Utils.c`、`cJSON_Utils.h`、`cJSON.h`。两个头文件属于授权参考材料，可以用于 provenance/sourceEvidence，但不能扩大必须精确匹配分配源码的 coverage 字段。模块 ID 正确，失败不是旧批次的 moduleId 配置错误，也不是非法读取头文件。使用当前 `DocWorkerAgentContract.validateOutput` 和原始回答再次复现同一错误，没有删字段或修改输出。

直接原因是模型字段违反 Domain 契约；产品侧的静态 Schema 仅校验非空文件数组，没有把本次分配集合写入动态 Schema，基础 Prompt 要求覆盖每个分配文件但没有明确排除参考头文件。后置业务校验没有统一修正环节，导致 SDK Schema 成功仍使整个知识分支停止。这是后续应评估的约束表达与错误恢复问题，本次没有放宽校验或实现新修复。

原始 Worker 分析片段为 5028 字符，完整原回答、调用命令和校验复现均保存；其语义充分性未评测，也不是候选知识版本。TestGen 中断消息标有 interrupted=true，正文 19168 字符，JSON 因字符串未闭合不可解析；无合法用例清单，不能人工补全后当作模型成功结果。直接停止原因是执行超时，未观察到连接失败或编译环境错误；模型/提供方延迟的更细原因未确认。

### 编译、测试与发布事实

| 检查 | 结果 |
| --- | --- |
| 原实现独立补充基线 | 18/18，当前 v10 TrustedProjectEvaluator、真实 gcc C99 与外部逐入口监督；日志和每项 entered/returned/value 保存 |
| 原实现上游固定回归 | json_patch_tests、old_utils_tests、misc_utils_tests 均编译成功、退出 0，Unity 分组 3/5/1、零失败；JSON 121 条、4 条原始禁用，不把组数当作逐项监督数量 |
| 原实现转义 Patch 复现 | `replace /a~1b` 返回 13，`{"a/b":1}` 不变，确认旧差异仍存在 |
| 新生成测试参考校验与冻结 | 未执行；TestGen 无有效最终输出，不继承历史 48/49 或任何冻结状态 |
| 重建编译、行为与上游回归 | 未执行，未生成重建代码；旧版缺 stdbool.h 不能当作本批编译结果 |
| Review 自动知识修订 | 未发生 |
| Gate 与发布 | 数据库 gate_decisions=0、publications=0；没有 PASS/ITERATE/STOPPED 决策，最终为执行 FAILED |

### 前台、状态不一致与产物

[本批只读前台](https://attractive-feelings-relationships-catherine.trycloudflare.com/)转发 `127.0.0.1:4312`，使用本工作树的 Server.ts，数据来自 `/root/projects/domain-knowledge/.workpanel/acceptance/2026-09-14-cjson-v10-real/runtime/registry.sqlite` 和同目录 CAS。旧 4311 服务及历史数据保持原样。公网 health、Run API、能力声明和实际浏览器均核对；页面只包含本批 Run，writeEnabled=false，无页面脚本错误。前台与模型执行使用同一生产源码版本。

最终页面顶部正确显示“工作流执行：失败”和 TestGen 超时，Worker/DocGen 节点显示覆盖错误，但 TestGen 行仍显示“运行中”，对应 Registry checkpoint 和节点投影确实残留 RUNNING；进程已经退出。业务聚合 state 同时保留 GENERATING。没有手改数据库。Graph.ts 的原生 timeout errorHandler 更新图执行状态，节点失败观察器通常在 createNode 的 catch 写入；入口 workflow.wait 返回后关闭 composition。具体取消、清理与投影落库竞态需单独回归定位，当前只确认实测不一致，不把推测当已验证根因。前台节点状态一致性验收未通过。

知识列表实际为空，knowledge_versions=0，评测记录为 0。浏览器已打开空知识页并截图；因此无法展示本批知识正文或候选标记，不能将 Worker 未提交片段注入知识库来补齐展示。页面展示本批 Run 和全局失败已验证，知识产物展示及全部节点终态要求未满足。

证据目录：主工作区 `.workpanel/acceptance/2026-09-14-cjson-v10-real/`，仅本地保留，不上传包含凭据的 runtime。

- `Run.mjs`、`Attempt1/`、`Run.log`、`FinalSummary.json`：新入口、代码 SHA、冻结配置、Run、时间、全部事件与最终结果；只有一个新批次。
- `SourceIntegrity.json`、`BaselineIntegrity.json`、`Baseline.json`、`baseline/`、`Independent-reference.json`、`independent-evaluations/`、`PointerReproduction.json`：材料摘要、真实原实现编译/逐项监督及差异复现。
- `ModelAudit.json`、DSH `session.jsonl`、`DocWorkerRawOutput.*`、`DocWorkerFragment.md`、`DocWorkerCommand.json`、`DocWorkerValidationReproduction.json`、`TestGenInterruptedOutput.txt`：原始回答、部分输出、usage、契约复现及诊断。加密提供方设置仅保留在受限 runtime。
- `CasIntegrity.json`：本次工作流 23 个 CAS 文件逐个摘要匹配；失败回答保留在 SDK 日志和单独导出文件，没有伪造成功 CAS checkpoint。`EvidenceManifest.json` 单独记录非凭据文件摘要。
- `BrowserRunning.json`、`BrowserFinal.json`、`Console*png`、`TerminalStateDiagnosis.json`：新 Run、真实失败、空知识页、节点投影不一致及只读能力证据。

前台由 tmux `cjson-v10-console` / `cjson-v10-tunnel` 维持；主机或进程停止后地址失效。停止分别使用 `tmux kill-session -t cjson-v10-tunnel`、`tmux kill-session -t cjson-v10-console`，不删除证据。原始工件下载继续受应用鉴权限制。

本次只更新验收文档与本地证据，没有修改生产实现、永久 CI 或模型产物。验证包括 READY、Spec 校验（17 schemas / 53 p0）、差异格式、源码/材料/CAS 摘要、真实原实现基线、生产 Worker 校验器复现和公网浏览器；未执行无关全量回归。后续需要处理 Worker 范围字段表达、TestGen 超时和终态持久化，再另行明确新批次原因与预算；本批结束后未继续调用模型。

## 2026-09-14：Check 报告证据与有限修正验收

按逐项确认的 [Check Spec](../specs/domainFunction/agents/checkAgent/CheckAgent.md) 修复报告生成，不改变 Check 的只读比较、Review 的知识修订和 Gate 的发布职责。设计提交 `9324e7a`，实现 `7564f33`，完整类型声明及同一行歧义补充修复 `e11e178`；PR 为 [#49](https://github.com/linlisWorkTeam/domain-knowledge/pull/49)。

模型不再逐字抄写源码，而是提供文件和行范围，程序从冻结材料中提取完整函数及相关声明。最终 `check-report-v2` 支持双方存在和单侧缺失两类证据，明确缺失为 Check 的分析结论；程序不靠名称检索证明实现缺失。正文不限定 Markdown 排版，blocking 根据有效差异计算。报告修正不允许通过删除差异或降低严重程度来掩盖错误。

Check 统一处理首次输出后的两次修正，每次向模型反馈原回答和具体错误，DSH 的嵌套格式重试关闭。成功保存尝试工件，耗尽则保存三次尝试并在 NodeFailed 的 reportEvidence 中记录 CAS 摘要，不提交半份成功报告。旧运行保持只读，执行版本升级为 `domain-agents-v9-check-evidence` / `contract-v9`。

### 实际验证

| 范围 | 结果 |
| --- | --- |
| 全量本地回归 | `7564f33` 对应代码的 `npm test` 294/294，通过，147.5 秒 |
| 报告、单侧缺失、持久化与适配定向组合 | 34/34；包含失败三次原始回答存入 CAS，且无成功结果 |
| 补强后的完整受控 SDK 流程 | 1/1，14.3 秒。Check 首次 Schema 错误、第二次定位错误、第三次修正成功；后续评测、Review、下一轮及 Gate 正常。Check 共四次输出尝试，Code 和 DocGen 各执行两个业务轮次，没有因报告修正重跑上游 |
| 完整声明与位置歧义补充修复 | `e11e178` 的角色及提取定向回归 11/11；类型成员位置扩展到完整类型，同一行多个函数不猜测选择 |
| 静态与 CI | TypeScript、Spec、完整 PR 差异格式校验通过；实现提交 `e11e178` 的 GitHub verify 与 acceptance 均通过，CI run `34801179679` |
| 真实模型 Check | 下述真实调用 SUCCEEDED，首次输出有效，7 条分析意见、16 段完整源码证据，未触发报告修正 |

### 同一冻结输入的真实模型结果

新 Run：`bb6f598e-e6d4-4507-9eb6-1ef477370741`，执行提交 `e11e178`。通过生产 AgentExample、RoleExecution、已配置 DSH SDK 和 Bubblewrap 调用真实 `deepseek-v4-flash`，北京时间 10:59:19—11:06:50，耗时 450.6 秒。单次调用上限 10 分钟，验收脚本总上限 30 分钟，未改变两次报告修正预算。SDK 报告 inputTokens=39606、outputTokens=26261、totalTokens=65867，非独立计费核算。

输入来自 2026-09-11 Run `a0a2694c-ada1-491d-a10a-2b75b303f48b` 的源码、重建代码和规则工件。三份解析内容均完全一致，各代码文件正文摘要一致。独立入口重新序列化 JSON，导致源码包和生成代码包的 CAS 摘要变化；规则包摘要不变。`FrozenInputVerification.json` 明确记录原、新摘要及正文校验，不将包摘要变化隐去或声称序列化字节一致。

报告为 `check-report-v2`、blocking=true：5 条 BLOCKER、2 条 INFO。程序提取的 16 段证据全部匹配相应冻结文件及行范围；15 个运行 CAS 文件均校验摘要。源码对照复核确认排序链表未断开 next、补丁递归路径丢失对象键/父路径等意见有对应代码依据。此处未补改生成代码或独立运行七项行为复现，不把全部模型意见提升为已执行验证的缺陷；模型严重程度和说明原样保留。

这次报告正常保存、AgentResult 为 SUCCEEDED，原始回答与组装报告分别保留，可供后续消费者读取。真实模型未触发修正，修正路径由上述故障注入 SDK 回归验证；单侧缺失由定向回归验证，不声称本次自然输出覆盖了它。真实验收只执行 Check，publication=NOT_EVALUATED，未再次执行 Review 或 Gate；消费者兼容和完整流程交接由 SDK 回归验证。旧 cJSON 的参考测试 48/49 和编译失败保持原样，整体 cJSON 飞轮仍未验收通过。

启动脚本另有一次配置读取方法名错误，在模型调用前终止；`SetupFailure.json` 保留该记录。修正脚本后才产生上述真实运行，没有隐藏或覆盖失败记录。

### 产物和限制

证据保留在主工作区 `.workpanel/acceptance/2026-09-14-check-report/`，不随 PR 上传：`LiveInput.json`、`InputManifest.json`、`FrozenInputVerification.json` 为输入依据；`Report.json`、`Attempts.json`、`LiveResult.json`、`Events.json` 为报告与提交事实；`EvidenceVerification.json`、`CasIntegrity.json`、`ModelAudit.json`、`EvidenceManifest.json` 为逐段原文、摘要和调用核验；`*Regression.log` 为测试日志。runtime 中包含受限会话和加密提供方配置，不作公开附件。

提取器为有界 C/C++ 词法边界识别，能处理本次模块及覆盖的字符串、注释、原始字符串、声明和宏场景，不展开宏、不进行类型分析，不能识别的完整边界明确失败。它不替代编译器或证明代码等价，也未宣称支持所有 C++ 语法。没有新建永久 CI 流程。验收结论为：本次 Check 报告生成、有限修正和交接修复通过；完整模块行为与知识充分性仍采用后续实际评测结论。

## 2026-09-11：cJSON Utils 真实模型验收，未通过

先提交[验收计划](../specs/infrastructure/evaluation/Evaluation.md#2026-09-11-cjson-utils-真实模型端到端验收)（`1d4c3e4`），再实际执行。目标为 cJSON `v1.7.19` / `c859b25da02955fef659d658b8f324b5cde87be3` 的完整 `cJSON_Utils.c`（1481 行、14 个公开 API）；基础库和头文件固定，原始源码工作区最终无改动。配套材料包括上游 README、公开头文件和 JSON Pointer/Patch/Merge Patch 标准。不是此前的一行受控测试模块。

最终有效配置批次：`a0a2694c-ada1-491d-a10a-2b75b303f48b`，执行代码 `80ac495`，北京时间 18:04:08—18:07:21，`FAILED / CHECK_EVIDENCE_INVALID`，停在 iteration 0 的 Check。最大三轮未耗尽，但契约错误终止流程；Review、重建代码的工作流内评测及 Gate 发布均未发生。报告后续的独立编译复核不能倒填为这些节点已经执行。

### 真实调用与四个批次

使用已保存提供方配置中的 `deepseek-v4-flash`，经 OpenCode Go HTTPS 和 DSH SDK 实际推理。最终批次有七个模型会话：Orchestrator、DocWorker、TestGen、DocGen、TestGen 修复、Code、Check。七个 SDK 会话都收到模型输出，但 Check 输出被业务契约拒绝；SDK SUCCEEDED 不等于角色业务验收通过。SDK 最终 usage 合计 282858 tokens，每会话只计最后一次聚合值，属于提供方报告用量，不是独立账单核算。

| 批次 / Run ID | 实际结果与归因 |
| --- | --- |
| 1 / `028d17d6-8543-4c3a-910b-dbfabc21831c` | 模型目录探测成功，正式推理请求缺少 OpenCode 会话头，返回 MissingSessionID；Orchestrator 失败，无有效模型输出 |
| 2 / `70522e65-8242-4dd5-817d-784df94538b9` | 真实 TestGen 返回 40 项，但 sourceEvidence 使用文件加函数的格式，被 TESTGEN_CASE_MANIFEST_INVALID 拒绝；并发 DocGen 另受错误 moduleId 阻塞 |
| 3 / `193ef7ca-e065-43e4-80bf-5d2258c9f137` | 生成 38 项测试，参考执行 37/38；有限修复返回未授权的附加 manifest 文件，被 TESTGEN_OUTPUT_PATH_INVALID 拒绝；DocGen 的 moduleId 仍错误 |
| 4 / `a0a2694c-ada1-491d-a10a-2b75b303f48b` | 修正场景 ID 和输出 Schema 后，生成知识、49 项测试及完整代码；参考测试修复前后均 48/49，Check 引用校验失败，最终未通过 |

第二、三批的 `cjson-utils-v1.7.19` 是执行者场景配置错误，违反已有 ID 规则，不归因于模型理解能力。第四批使用 `cjson-utils-v1-7-19` 并增加启动前检查。每次新批次原因先补入计划，所有失败记录保留；第四批后不再另起模型批次。

### 行为证据与产物

| 检查 | 实际结果 |
| --- | --- |
| 原实现上游固定回归 | json_patch_tests、old_utils_tests、misc_utils_tests 均退出 0，Unity 分组分别 3、5、1，0 失败。JSON 数据共 121 条、4 条原始禁用；未把分组数或数据条目数冒充逐条监督通过数 |
| 原实现独立补充复核 | 18/18，真实 gcc C99 构建和外部逐入口监督，覆盖全部 14 个 API；测试在模型工作区外保留 |
| 模型生成测试的参考校验 | 第四批初稿与一次修复均 48/49，失败项 applypatch.escaped-path-segment；测试集没有获得通过后的冻结资格 |
| 候选知识 | 24830 字符，14 个公开 API 名称均出现；版本 `kv_81dc24535d8a834fee9a6ccf`，CANDIDATE，质量分 91。名称覆盖及质量分不能证明语义充分，重建未通过 |
| 模型重建 | 原样导出 1523 行 `Reconstructed.c`。独立编译失败：使用 true/false，但未定义或包含 stdbool.h；18 项独立用例没有进入执行，不能描述成 18 个行为断言均失败 |
| 重建上游回归 | 三个测试程序均因上述编译问题未能执行；未手工补头文件后冒充模型原输出通过 |
| Check 原始输出 | 共 22 条 finding，其中第 3、13、21 条至少一侧引用不是输入源码的精确子串；被 CHECK_EVIDENCE_INVALID 拒绝。其余引用能匹配不意味着语义结论正确，不能称为 22 个已确认缺陷 |
| 工件完整性 | workflow runtime 的 65 个 CAS 文件摘要全部匹配；另有独立复核 CAS 与导出文件摘要清单 |

单独复现参考失败：对象 `{"a/b":1}`，应用 `replace /a~1b = 2`，固定版本 ApplyPatchesCaseSensitive 实际返回 13，对象不变。固定源码 decode_pointer_inplace 的转义处理与模型期望不一致；查找 Pointer 与应用 Patch 不共用完全相同的解码路径。这里必须区分“复现固定版本行为”和“符合标准的预期”，不能直接修改原实现或降低测试预期来通过。重建版同一复现因编译失败未执行。

实际拓扑中 Code/Check 与 TestGen/参考校验是两条汇合于 evaluation 的分支。因此参考校验返回人工处理后，Code 仍可能已经执行；本批次 oracle_validation 的 COMPLETED 表示节点执行结束，返回的是 STOPPED/人工处理，并非测试 PASS。随后 Check 契约失败先终止整体流程。该行为依据 AutomatedProjectWorkflow.validateOracle 和 Workflow 的汇合边界核对，不将未冻结测试描述为已接受。

Code 使用知识和编写配置，实际角色工作区只留工作区标记；本次配置 bubblewrap，并沿用 read_material 授权边界。没有额外做恶意越权读取实验，不能扩展声称完成所有部署隔离验收。

### 前台、修复与复现入口

新[只读验收前台](https://ties-charitable-min-elementary.trycloudflare.com/)连接本次独立 SQLite/CAS，服务为 `127.0.0.1:4311`。浏览器实际打开四个批次列表、最终失败节点及知识正文，无页面脚本错误；知识显示“尚未通过，不可发布”。原 MVP 地址和历史数据库保持原样，不能把旧 v5 程序直接接到这次 v8 数据上。

新增控制台展示修复 `50aad21`：分别显示业务状态与工作流执行状态，节点展示真实 error；原来仅显示 GENERATING 容易误认为失败运行仍在执行。当前页面使用该提交资产，模型运行仍以先前记录的 `80ac495` 为准。公开实例为只读，原始评测工件下载仍需要鉴权；完整原始测试、代码与编译证据从下述本地目录查阅。因此 CJSON-REAL-06 的页面展示已验证，全部工件的公开下载未满足。

运行中必要修复：`9d83188` 补提供方 User-Agent 及按幂等键生成的 OpenCode 会话头，加入传输指纹；`80ac495` 将 TestGen 允许输出路径和证据路径写入动态 Schema，原有业务校验保持严格。回归分别为提供方适配 4/4、运行配置 7/7、TestGen 与受控 SDK 9/9；typecheck、Spec 和差异格式检查通过。这些定向受控回归与上述真实模型验收分别计数，本次未新增永久 CI，也未重跑全量测试。

保留目录：主工作区 `.workpanel/acceptance/2026-09-11-cjson-real/`（忽略入 Git）。

- `Run.mjs`、各批 Execution/Scenario/WorkflowResult：实际入口、脱敏配置、运行版本、状态与事件；重跑会消耗真实模型用量，不应作为普通回归自动执行。
- `ModelAudit.json`、`runtime/demo/agent-runs.jsonl`、DSH session 日志：真实角色、模型、时间、usage 和原始会话；runtime 中加密提供方配置及临时凭据不应公开或打包上传。
- `KnowledgeCandidate.md`、`Reconstructed.c`、`GeneratedTestsInitial.c`、`GeneratedTestsRepaired.c`、`readable/`：未手改的模型产物。
- `Baseline.json`、`IndependentCases.c`、`Independent-*.json`、`Upstream-generated.json`、`PointerReproduction.json`、`evaluations/`：原始基线、独立测试、实际编译与监督失败证据。
- `DocumentCoverage.json`、`CheckEvidenceDiagnosis.json`、`CasIntegrity.json`、`EvidenceManifest.json`：覆盖范围、引用复核和摘要。
- `Browser.json`、`ConsoleRunDetail.png`、`ConsoleKnowledge.png`：最终状态及候选正文的浏览器证据。

验收判定：CJSON-REAL-01 的真实调用已验证；02 的源码固定、替换和授权配置有证据，隔离攻击验收不在本次范围；03 的语义充分性未通过；04 失败；05 的 PASS 发布路径未到达，实际没有发布；06 展示通过、公开原始工件下载受限。整体 **FAIL**，不能宣布复杂模块理解与知识飞轮闭环验收完成。

后续应先明确固定版本兼容与标准差异的测试依据，再处理 Check 的可验证引用及有限修复，并让真实编译诊断进入后续修订。以上是剩余工作，不是本次已实现的能力。所有更改位于本地 `test/cjson-utils-real-e2e` / `/tmp/domain-knowledge-cjson-real`，未合并主工作区。

临时前台由 tmux `cjson-real-console` 与 `cjson-real-tunnel` 维持；主机或进程结束会使地址失效。停止命令分别为 `tmux kill-session -t cjson-real-tunnel` 和 `tmux kill-session -t cjson-real-console`，停止不删除证据。

## 2026-09-11：独立复审的四项修复

验收代码 `acfd714`。复审指出的问题均能复现，之前“测试全绿”没有覆盖原生代码伪造完成事实，以及 Registry 和 LangGraph 之间的崩溃窗口。此前把同进程 nonce 当可信边界、把 Orchestrator 重放当路由恢复覆盖的判断不成立；下面旧版记录仅保留历史用途。本轮先提交补充 Spec（`73e9b54`），各项验收后分别提交。

| Finding | 修复与实际验收 | 提交 |
| --- | --- | --- |
| 高：被测进程伪造逐项 PASS | 外部 Linux 监督器按清单逐个启动入口，以 ptrace 观察入口与返回地址、读取实际返回值。被测 stdout/stderr 只作日志；结果经子进程关闭的独立 FD 3 返回。原公开复现从 `true, 3/3` 变为 `false, 0/3`，后两个失败入口实际执行。还覆盖写结果 FD、改程序文件、fork、ptrace、兼容 ABI syscall、直接退出、信号、超时、符号缺失和内核拒绝 ptrace | `2ab6f14`、`acfd714` |
| 高：router 重放报错或改写结论 | 以 `runId + iteration + route-v2` 固定路由结果，再执行幂等迁移与交接；已提交 Gate 可按相同证据取回。真实 LangGraph 在 Registry 之后、图更新之前注入异常并 resume；覆盖质量/Gate 的 ITERATE、STOPPED，另覆盖路由固定后迁移前、Gate 固定后路由保存前，以及输入冲突 | `cb104f6` |
| 中：cwd 原生绑定不正确 | 各命令分别解析 cwd，规范化根内 `.`/`..`，拒绝越界；编译输入、输出及 binary 路径采用一致解析，原参数保留。两个 build 子目录布局实际编译运行通过 | `0fb6188` |
| 低：整个 PR 差异存在尾随空格 | 删除测试中的尾随空格，改用 `git diff --check c33787b...HEAD` 检查真实 PR base 到 HEAD，检查通过 | `3029d7a` |

补充验收发现 assert/abort 的自发信号应归为普通测试失败。`acfd714` 仅放行指向被测进程自身的信号，继续拒绝向监督器/其他进程发信号；参考断言失败后修复通过已纳入真实 SDK 用例。

当前执行版本：`domain-agents-v8-supervised-routing` / `contract-v8`，测试证据协议为 `native-cases-v2-supervised`；旧协议缓存不能继承当前验收状态。

### 本次验证结果

- 定向修复与 SDK/路由回归：42/42 通过；最后增加监督进程逐项日志和工具指纹后，对应 22/22 复验通过。
- 最后代码提交的全量 `npm test`：314/314 通过，208.1 秒，无跳过或取消。
- 浏览器：14/14 通过，39.1 秒。
- 最后断言补充修复定向验收：32/32 通过；独立保留产物 SDK 端到端 1/1 通过，13.2 秒。
- TypeScript、Spec 校验通过；整个 PR 的差异格式检查通过。

### 本次完整流程及证据

Run ID：`69f2a95c-fd7f-4a33-a878-ed1861313068`。结果 `COMPLETED / PASS / VERIFIED`，总轮数上限 2，实际 iteration 0、1，发布一次。13 次模型调用，5 次评测，79 个 CAS 工件均核验摘要，83 条事件。模型响应受控，但 SDK、LangGraph、数据库、编译、监督与函数执行都实际运行。

原始测试先错误断言结果为 3，监督器观察到断言信号，记录普通测试失败而非环境故障；TestGen 修复为 4 后固定测试集。首轮重建仍返回 3，Check/评测/Review 促成知识修订；第二轮复用同一清单，重建返回 4，各入口由监督器观察到正常返回 0，Gate PASS 后发布。

保留目录：`.workpanel/acceptance/2026-09-11-review/`。原复现和修复日志、测试日志及报告位于根目录；最终完整 SDK 产物在 `e2e-final/`（此前 `e2e/` 也保留）：

- `evaluation-index.json`：五次评测；每个 `caseExecution.records` 包含 entered、returned、返回值、监督原因和实际进程输出。process.exitCode 是监督进程退出码，被测函数结果以 returned/value/status 为准。
- `evaluations/*/NativeCaseSupervisor.c`、`NativeCaseSupervisor`：独立编译的监督器源码及二进制；`workspace/.flywheel/` 保留实际单入口 runner；项目编译二进制、归档和评测输入输出均保留。
- `model-exchanges.jsonl`、`readable/`：13 次完整请求/响应及两轮知识、测试、代码。
- `runtime-*/`、`cas-index.json`、`workflow-result.json`：SQLite/CAS、LangGraph 检查点、SDK 资料和全部事件。
- 根目录 `SHA256SUMS` 核对全部本轮保留文件；归档为 `.workpanel/acceptance/AgentAcceptance-2026-09-11-review.tar.gz`。

原始产物保留在当前工作区，不随 PR 上传。

### 明确的适用边界

监督执行当前限定 Linux x86_64、可用的 ptrace / PTRACE_GET_SYSCALL_INFO、gcc、nm 和保留入口符号的原生构建。未知 syscall、写文件、派生进程、修改其他进程、监督工具不可用均失败，不能降级为 stdout 计数。普通返回失败后继续调度其他用例，超时仍遵守 binary 命令总预算。每个用例独立进程，不支持依赖跨用例全局状态的测试布局。

监督器保护的是逐入口执行和结果通道，不负责判断断言是否充分，也不等同于文件读取隔离、完整部署沙箱或外部模型质量验收。系统接口依据见 [Linux ptrace 手册](https://man7.org/linux/man-pages/man2/ptrace.2.html)。路由验收通过精确边界的异常注入和真实 LangGraph resume 完成，没有声称用操作系统强杀命中了相同窗口。既有共享能力待办及用户延期事项仍不计为完成。


## 2026-09-11：现有文档同步复核

本次依据 `c33787b...e45dff4` 的代码差异同步现有文档，生产代码和测试未修改。复核不仅检查文档路径，还对照实际输入输出、错误分支、调用顺序和测试证据：

| 核对范围 | 已同步的描述与代码依据 |
| --- | --- |
| 角色输入与修订 | Code 的 requiredGeneratedPaths、Check 非空规则及双侧原文核验、Review 报告/历史输入、DocGen 与 Review 共用章节定位；依据各角色 Contract 和 DocGenRevision |
| Worker 与 Prompt | WorkerMaterials / DocWorkerExecution 的裁剪清单、CAS、Prompt 和工作区授权一致；固定 Prompt 与 subagent-v3 复用；预算分组和语义质量仍未完成 |
| 测试与原生评测 | TestExecutionPlan 的各命令 cwd 绑定、TestSuitePolicy 的有限修复与复用、CaseRunner / NativeCaseSupervisor 的独立执行和结果通道；补充系统限制及普通断言失败分类 |
| 编排与持久化 | AutomatedProjectWorkflow 的模块绑定、总轮数、route-v2 不可变结果和幂等交接；ApplicationServices 的相同证据 Gate 复用；同步 Workflow、LangGraph、SQLite 及 4+1 图 |
| 使用与状态 | 独立角色与完整受控流程的运行区别、保留产物变量、本地 .workpanel 目录、旧协议恢复边界；更新 Status/追踪并清除失效“待实现”描述 |

本轮 Node 24 文档验证：`npm run validate:specs` 通过，17 schemas / 7 commands / 8 results / 52 p0；`node --test tests/contract/*.test.ts` 28/28 通过；相对 PR base 的差异格式检查通过。未重跑全量业务、浏览器或真实模型测试，原始验收产物未改写。上节 `acfd714` 的全量和受控端到端结果是上次实际执行证据，已复核现存日志与最终 summary，不能把文档更新记作新增业务验收。

保留原有未完成目标：Worker 业务分组/预算/跨模块依赖、分批汇总与补充分析、相似度研究、独立项目配置版本、自动资料清理、历史最佳/成本/停滞策略、SearchAgent/外部知识关联及公司 CLI/真实模型验收。当前参考校验仍是用户暂时保留的规则，不改写为最终产品定案。

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
