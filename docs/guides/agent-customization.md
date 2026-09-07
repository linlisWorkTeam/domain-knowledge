# Agent 开发与现有角色定制指南

本文供七个 Agent 的负责人按代码分工使用。基线为已合入 #26 的主线 `aff42aa`：DSH 公共底座与 DocGen 真实范例已验收；其余角色有接线与受控回归，七角色完整业务能力仍需按 R3 验收。本次文档提供代码定位和开发步骤，不宣称角色开发已完成。

先读[目录与类](#目录与类)，再按[角色定位表](#角色定位表)找到自己的分支。运行命令与模型配置复用[DocGen 教程](../tutorials/add-agent-capability.md)，职责约束以 [Agent Spec](../../specs/06-agents/README.md) 为准。

## 目录与类

**目前没有七个独立的 `OrchestratorAgent.ts` / `DocGenAgent.ts` 类。一个角色由“定义项 + 业务分支 + 共享 DSH 执行 + 测试”组成。** `agent-definitions.ts` 定义身份和基础指令，真正的材料准备、结果处理在 `ProjectWorkflowStages` 中；不要只改提示词就认为功能已实现。

以下路径均相对仓库根目录，省略与角色开发无关的文件：

```text
src/
├── application/
│   ├── ports/index.ts                    # AgentProvider / Request / Command / Result 等接口
│   └── services/
│       ├── automated-project-workflow.ts # ProjectWorkflowStages：七角色业务分支与结果转换
│       │                                 # AutomatedProjectWorkflowService：完整工作流生命周期
│       ├── docgen-example.ts             # DocgenExampleService：单角色开发范例
│       ├── run-configuration.ts          # RegistryRunConfigurationService：冻结运行配置
│       └── quality-policy.ts             # DeterministicQualityPolicy：候选知识质量检查
├── infrastructure/
│   ├── workflow/langgraph/
│   │   ├── agent-definitions.ts          # 七角色 ID、nodeId、basePrompt、工具声明
│   │   ├── graph.ts                      # 节点映射、调用、并行、汇合与路由
│   │   ├── runtime.ts                    # 工作流启动、等待、恢复、取消的基础设施
│   │   ├── state.ts                      # 图状态与上下文合并规则
│   │   └── docgen-example.ts             # executeDocgenExample：只有 doc_gen 的示范图
│   ├── agents/
│   │   ├── deepseek-harness/
│   │   │   ├── configured-provider.ts    # ConfiguredDshProvider：已验证模型配置与受信转发
│   │   │   ├── index.ts                  # DeepSeekHarnessSdkAgent：原生 DSH 调用与事件
│   │   │   ├── role-tools.mjs            # read_material 工具和拒绝规则
│   │   │   └── isolation-launcher.mjs    # Bubblewrap 进程隔离入口
│   │   ├── workspace/index.ts           # LocalAgentWorkspace：按固定 commit 物化授权文件
│   │   ├── contracts/index.ts           # JsonSchemaAgentContractValidator：业务信封校验
│   │   └── scenario/project-workflow-fixture.ts # FixtureProjectWorkflowStages：预写回归夹具
│   └── evaluation/project/index.ts      # TrustedProjectEvaluator：可信副本中的构建与测试
└── interfaces/runner/
    ├── composition.ts                   # createComposition：装配业务阶段、Provider、评测器
    ├── docgen-example.ts                # example:docgen 的 prepare / run / check
    └── demo-report.ts                   # Run、session、工件及调用审计的报告投影
examples/docgen/
├── prompt.txt                           # DocGen 示范追加指令，不是所有 DocGen 的基础提示词
└── markdown-diff.d.ts                    # CPU 范例公开接口
specs/
├── 06-agents/                           # 角色职责、材料边界与业务要求
└── schemas/
    ├── agent-command.schema.json        # 工作流发给角色的业务命令
    ├── agent-result.schema.json         # 规范化后的角色业务结果
    └── correction.schema.json           # Review 修订建议约束
```

| 类 / 接口 | 作用 | 角色负责人何时需要看 |
| --- | --- | --- |
| [`ProjectWorkflowStages`](../../src/application/services/automated-project-workflow.ts) | 分派节点、准备角色输入、校验模型原始输出、转为业务结果；也包含候选、评测和 Gate 接线 | 修改角色输入、输出及上下游交接时的主要入口 |
| 同文件 `AutomatedProjectWorkflowService` | 创建完整业务 Run、冻结配置、启动图，以及 wait/status/resume/cancel | 联调完整工作流；它不是某个角色的实现 |
| [`AgentProvider` / `AgentRequest`](../../src/application/ports/index.ts) | 业务侧调用模型执行的接口；请求含角色、Prompt、输出 Schema、授权工作区、关联标识 | 了解角色与 DSH 的接缝；通常不为每个角色新增 Provider |
| [`ConfiguredDshProvider`](../../src/infrastructure/agents/deepseek-harness/configured-provider.ts) | 使用验证过的配置连接模型，隔离真实凭据并收集调用用量 | 模型接入故障，由底座负责人维护 |
| [`DeepSeekHarnessSdkAgent`](../../src/infrastructure/agents/deepseek-harness/index.ts) | 调用原生 DSH、创建会话、挂载工具策略、处理输出/超时/取消/审计 | DSH 执行故障或工具能力变化；同文件 Headless 类不是当前默认角色框架 |
| [`LocalAgentWorkspace`](../../src/infrastructure/agents/workspace/index.ts) | 把明确授权的文件从固定 Git commit 放入角色视图 | 调整可见材料；权限必须由代码执行，不能只写在 Prompt 中 |
| [`JsonSchemaAgentContractValidator`](../../src/infrastructure/agents/contracts/index.ts) | 校验版本化 Command/Result；拒绝未知字段和角色错配 | 修改业务契约时与 Schema、上下游一起检查 |
| [`RegistryRunConfigurationService`](../../src/application/services/run-configuration.ts) | 冻结角色指令、工具和 Provider 摘要；后续配置不污染旧 Run | 调试“改了 Prompt，为何旧 Run 没变” |
| [`TrustedProjectEvaluator`](../../src/infrastructure/evaluation/project/index.ts) | 在可信副本中执行配置好的构建与测试，保存实际证据 | TestGen、Code 的独立评测接线；不能用模型自报成功代替 |

## 一个角色实际怎样执行

下面是 DSH 默认路径，调用最终由 [`createComposition()`](../../src/interfaces/runner/composition.ts) 装配：

```text
LangGraph graph.ts：createNode()
  → ProjectWorkflowStages.execute()：按 nodeId 分派
  → orchestrate() 或 executeAgent()
  → runRole() → executeAgentCheckpoint()
      1. buildAgentCommand()：组装业务命令，校验并保存 commandRef
      2. runLiveAgent()：准备授权工作区、物化命令引用的 CAS 材料
         → ConfiguredDshProvider.run()
         → DeepSeekHarnessSdkAgent.run() → DSH 模型 / 工具会话
      3. validateAgentOutput()：校验模型原始输出
      4. normalizeAgentResult()：保存正文/代码等工件，转换为 AgentResult
      5. 校验 Result，提交 checkpoint，返回 ArtifactRef
  → 下游按角色、Run、Command、GenerationKey 校验后读取工件
```

这里有两种不同的输出约束：`AGENT_OUTPUT_SCHEMAS` 定义**模型要返回什么 JSON**；`agent-result.schema.json` 定义**底座规范化后交给下游什么结果**。不要让模型自行填 CAS ID、Run ID 或完整业务信封。修改原始输出时，必须检查 `normalizeAgentResult()` 和下游读取逻辑是否同步；修改业务契约还须同步 Spec/Schema。

定位时优先搜索符号，避免文件增删行后行号失效：

```bash
rg -n 'agentId:|nodeId:' src/infrastructure/workflow/langgraph/agent-definitions.ts
rg -n 'AGENT_OUTPUT_SCHEMAS|buildAgentCommand|normalizeAgentResult|runLiveAgent' src/application/services/automated-project-workflow.ts
rg -n "agentId === 'doc-gen'|agentType === 'doc-gen'" src/application/services/automated-project-workflow.ts
```

## 角色定位表

七个角色的定义均在 [`agent-definitions.ts`](../../src/infrastructure/workflow/langgraph/agent-definitions.ts) 按 `agentId` 查找；下表列出 [`automated-project-workflow.ts`](../../src/application/services/automated-project-workflow.ts) 中与之配套的现有原始输出和规范化结果。字段列用于定位，不替代该文件中完整的必填、类型和长度约束。

| 负责人 / agentId | 图 nodeId | 原始输出字段（AGENT_OUTPUT_SCHEMAS） | 规范化 resultKind | 业务定位 |
| --- | --- | --- | --- | --- |
| Orchestrator / `orchestrator` | `orchestrator` | `strategy, iteration, parallel` | `plan` | `orchestrate()`；命令及结果函数中的 orchestrator 分支 |
| DocWorker / `doc-worker` | `doc_worker` | `workerId, fragment, provenance` | `knowledgeChunk` | `assignedSourcePaths()`；doc-worker 分支；DocGen 的 workerFragmentRefs 汇集 |
| DocGen / `doc-gen` | `doc_gen` | `body, title, description` | `knowledgeCandidate` | doc-gen 分支；`commitCandidate()`；迭代时旧正文与 Correction 组装 |
| TestGen / `test-gen` | `test_gen` | `candidateCommands, oracleRequired` | `testCandidates` | test-gen 分支；`validateOracle()` 和 `evaluate()` 的评测边界 |
| Code / `code` | `code` | `files: [{path, content}]` | `codeArtifact` | code 分支；`outputSchemaFor()`、`assertAllowedGeneratedFiles()`、`evaluate()` |
| Check / `check` | `check` | `blocking, findings, scope` | `findings` | check 分支；`recordGateDecision()` 对阻塞项的消费 |
| Review / `review` | `review` | `blocking, recommendation, correction` | `attribution` | 命令和结果函数末尾的 Review `else` 分支；`recordGateDecision()`；下一轮 DocGen |

### 1. Orchestrator 负责人

- **读哪里**：[编排 Spec](../../specs/06-agents/orchestration-agents.md)、定义项 `orchestrator`、`orchestrate()`、`buildAgentCommand()` / `normalizeAgentResult()` 的对应分支，以及 `graph.ts` 的 `AGENT_BY_NODE` 和 `buildInfrastructureGraph()`。
- **当前功能**：业务阶段固定源码快照、运行策略并调用角色；模型返回规划摘要。规范化的 `plan.nodes` 目前由代码中的固定列表生成；图并行度和分支来自受信图状态，不由模型的 `parallel` 字段直接驱动。
- **要开发什么**：基于策略与模块元数据形成可靠的计划与风险说明；如果需要更多业务计划信息，明确原始输出、规范化结果与固定图之间的消费关系，协同底座负责人修改。不能只让模型输出一个下游根本不读取的新字段。
- **材料与验收**：不向其暴露源码正文，不给文件工具；验证计划与当前任务一致、非法任务不扩展图、不授予权限。参考 `tests/integration/langgraph-infrastructure.test.ts` 和 `tests/integration/agent-contracts.test.ts`。

### 2. DocWorker 负责人

- **读哪里**：[知识生产 Spec](../../specs/06-agents/documentation-agents.md)、定义项 `doc-worker`、`assignedSourcePaths()`、`runLiveAgent()` 的分块材料选择，以及 DocGen 的 `workerFragmentRefs` 汇集逻辑。
- **当前功能**：源码路径按 workerIndex/workerCount 分配；角色返回片段和来源字符串。片段存为 `chunkRef`，DocGen 按当前轮和 worker 标识收集。当前规范化 provenance 使用场景与清单引用，并非已经逐条验证模型来源字符串。
- **要开发什么**：把分配范围中的行为、边界、依赖和未决问题整理成 DocGen 能消费的片段，补来源定位及不足材料的表达；来源校验、风险字段变更须同时检查两层输出契约。
- **材料与验收**：只读分配源码及公开接口；验证两个分块不会串材料、来源缺失不编造、片段正确交给本轮 DocGen。参考 `tests/security/agent-workspace.test.ts`、`tests/integration/langgraph-infrastructure.test.ts` 和 `tests/acceptance/dsh-configured-flow.test.ts`。

### 3. DocGen 负责人

- **读哪里**：[知识生产 Spec](../../specs/06-agents/documentation-agents.md)与[写作规范](../../specs/06-agents/knowledge-writing-style.md)、定义项 `doc-gen`、命令分支中的 `workerFragmentRefs/baseKnowledgeRef/corrections/qualityFeedback`、结果分支和 `commitCandidate()`。
- **当前功能**：根据可见源码与工件生成 `body/title/description`；正文保存为 `bodyRef`，完整流程再摄取候选并执行质量检查。单角色范例已真实验收，但不运行完整发布图；当前结果来源仍以场景与清单绑定为主。
- **要开发什么**：补完整知识结构、行为来源、风险表达和可控修订；验证知识片段汇总、失败反馈修订和未变内容保持。改善范例指令可改 `examples/docgen/prompt.txt`；影响所有生产 DocGen 的基础行为则改定义项和相应业务分支。
- **材料与验收**：允许源码与公开接口，以及命令绑定的旧知识和反馈；不能自行发布。参考 `tests/integration/docgen-example.test.ts`、`tests/unit/quality-policy.test.ts`、`tests/integration/agent-contracts.test.ts`。例子 PASS 之外还须复核正文支持性。

### 4. TestGen 负责人

- **读哪里**：[测试生产 Spec](../../specs/06-agents/test-generation-agent.md)、定义项 `test-gen`、输入/结果分支、`validateOracle()`、`evaluate()`，以及 `TrustedProjectEvaluator`。
- **当前功能**：模型输出候选命令和 oracleRequired，结果引用已入库。**当前 `validateOracle()` 执行场景的 referenceCommands，`evaluate()` 执行 firstIterationCommands/finalCommands，尚未将模型 candidateCommands 接成受信门禁。** 不要把已有受控流程当作候选测试已验收。
- **要开发什么**：生成可执行候选测试、用例清单和预期依据；与评测负责人一起补候选验证、合法执行及独立证据的消费链路，对齐 DEV-011/T201。候选命令不能直接拼进宿主 shell，未经可信参考验证的 expected 不能用于门禁。
- **材料与验收**：可读参考源码和公开接口，不读候选知识或生成实现；验证正常、零测试、损坏测试、错误预期及不支持语言。参考 `tests/unit/project-evaluator-counts.test.ts`、`tests/acceptance/real-source-flow.test.ts`，在角色测试中补候选到验证证据的用例。

### 5. Code 负责人

- **读哪里**：[代码与检查 Spec](../../specs/06-agents/code-and-check-agents.md)、定义项 `code`、输入中的 `knowledgeRef/allowedGeneratedPaths`、`outputSchemaFor()`、`assertAllowedGeneratedFiles()` 和 `evaluate()`。
- **当前功能**：候选知识以命令工件内容传入，公开接口物化为只读文件。模型返回 `files`；原始 Schema 动态限制允许路径，业务层再拒绝重复/越界路径，评测器负责将文件落到独立评测副本。
- **要开发什么**：仅依据知识、接口和构建约定生成完整实现，处理依赖、边界及知识不足；补多种允许路径和模块场景的生成验证。
- **材料与验收**：每次尝试使用新 DSH session；不能读取参考实现、门禁测试或旧轮实现。当前角色不通过 shell/Edit 直接改仓库。参考 `tests/acceptance/dsh-configured-flow.test.ts`、`tests/security/agent-workspace.test.ts`、`tests/integration/dsh-native-tools.test.ts`；独立评测确认实现行为。

### 6. Check 负责人

- **读哪里**：[代码与检查 Spec](../../specs/06-agents/code-and-check-agents.md)、定义项 `check`、命令中的 `diffRef/criteriaRef`、结果分支，以及 `recordGateDecision()`。
- **当前功能**：`diffRef` 目前引用 Code 的文件 JSON 工件，不是预先生成的文本 diff；代码内容通过命令材料内联。原始 findings 是字符串数组，规范化时统一使用 blocking 决定级别、scope 第一项决定位置，尚非逐问题精细结构。
- **要开发什么**：检查语义、边界及接口一致性，给每个问题提供可定位证据；需要逐问题级别或判据时同时调整原始 Schema、结果转换与消费者，不能只在 Prompt 中要求额外字段。
- **材料与验收**：只读工件、判据与公开接口，不读参考源码、不改实现；不能因角色目录缺少生成文件而报缺陷。验证预设缺陷被识别、正确实现无无据阻塞。参考 `tests/integration/agent-contracts.test.ts` 和 `tests/acceptance/dsh-configured-flow.test.ts`。

### 7. Review 负责人

- **读哪里**：[评审 Spec](../../specs/06-agents/review-agent.md)、定义项 `review`、`buildAgentCommand()` / `normalizeAgentResult()` 最后分支、`recordGateDecision()` 和 DocGen 下一轮命令组装。
- **当前功能**：命令直接绑定候选知识、评测报告和判据；尚未单独绑定 Check findings 工件。原始输出只能带单个 correction 或 null，规范化后成为 corrections 数组，evidenceRefs 由底座绑定评测证据；`recommendation` 不直接控制路由。
- **要开发什么**：将真实失败定位到知识路径，产出明确判据和修订要求，证据不足则保留风险。若需 Check 明细、历史修订或多项 Correction，应同步命令授权与材料物化、原始 Schema、结果转换和下轮 DocGen 消费，不通过未绑定 Prompt 偷传材料。
- **材料与验收**：不读参考源码、不运行测试、不改知识或发布状态；验证有证据的修订、无须修订的空结果、证据不足和跨 Run 证据拒绝。参考 `tests/integration/agent-contracts.test.ts`、`tests/acceptance/dsh-configured-flow.test.ts`；联调确认 Correction 真正进入下一轮 DocGen。

## 共享文件怎样分工

当前七人会共同涉及 `agent-definitions.ts` 和 `automated-project-workflow.ts`，不能按“每人一个现成类”分配文件所有权。角色负责人认领自己的定义项、输入/输出分支和测试；公共底座负责人维护共享执行、工具隔离、快照、图路由、CAS 与 Gate，并审查跨角色字段变更。每人独立分支/worktree，保持 PR 小且及时同步主线；未受影响的分支不顺手重写。

| 想改什么 | 修改入口 | 必须一起检查 |
| --- | --- | --- |
| 所有 Run 的角色基础行为 | `agent-definitions.ts` 的对应项 | 角色输出 Schema、角色验收；不能靠改 basePrompt 增加工具权限 |
| 临时措辞与范例实验 | Console 的 promptAddon；或 DocGen 范例 prompt.txt / --prompt-file | 新 Run 生效；旧 Run 使用冻结快照 |
| 角色看见哪些输入 | `buildAgentCommand()`、`runLiveAgent()`、必要时 `assignedSourcePaths()` | Command Schema、ArtifactRef 完整性、工作区权限、上下游 |
| 输出字段与业务结果 | `AGENT_OUTPUT_SCHEMAS` / `outputSchemaFor()`、`normalizeAgentResult()` | Result Schema、原始输出读取者及下游消费者 |
| 增加工具 | `role-tools.mjs`、SDK `runAttempt()` 策略、定义项 tools 和工作区规则 | 运行时 guard 与隔离测试；当前除 Orchestrator 无文件工具外，其余仅 read_material，shell/编辑器被禁用 |
| 改并行、汇合或路由 | `graph.ts`、`state.ts`、业务阶段 | 底座负责人统一处理，模型计划不能自行改变拓扑 |

若共享文件冲突频繁，可以在后续代码 PR 中讨论把某角色的纯输入/输出转换拆为模块，由公共阶段调用；这是可选重构，不是已有目录，也不需要复制 DSH Provider、会话或工具运行框架。本指南不实施该拆分。

<a id="agent-development-sop"></a>

## 公共开发 SOP

1. **准备工作区**：使用 Node 24+；阅读最新 epitaph 与角色 Spec；从已合入底座的主线建自己的 worktree，执行 `npm run bootstrap:worktree` 至 READY，再执行 `npm run bootstrap:worktree:check`。不共享 node_modules。
2. **跑懂现有调用**：按教程配置自己的专属 runtime，执行 `example:docgen prepare/run/check`；沿上面的调用链观察命令、模型原始输出和规范化结果。当前没有通用的 `--role` 单角色 CLI，不能把 DocGen 命令替换角色名就认为能运行其他角色。
3. **确认改动点**：在现有 `specs/06-agents/` 对应章节记录角色输入、职责、输出、权限和验收；列出本次涉及的定义项、业务分支、测试及上下游字段。新增契约先和上下游对齐。
4. **实现并独立验证**：从自己的业务分支开发；其他角色可用明确标识的受控输入协助测试。测试覆盖正常、材料不足、非法输出、身份错配和权限拒绝；共享超时/取消矩阵复用底座回归。当前原始 Schema 没有统一材料不足字段，不要擅自返回未知字段；需要新失败表达时同步契约和处理逻辑。
5. **接回固定图**：至少验证一次真实 DSH 角色调用和上下游工件消费。完整接线参考 `tests/acceptance/dsh-configured-flow.test.ts`，其本地 SSE 是受控机制测试，不是现成的真实模型质量验收。独立角色测试装配可参考 `tests/integration/dsh-project-stages.test.ts` 中 `ProjectWorkflowStages` + `WorkflowStageInput` 的用法。
6. **交付 PR**：给出 Spec/实现/测试、运行命令、真实 Run/session/工件摘要及独立检查结论。一个可审查功能一个 PR，review 合入后继续；最终按 [AC-DSHF-008](../../specs/changes/active/DEV-019-dsh-agent-foundation/acceptance.md#七角色逐项验收r3)逐角色验收，不因 JSON 合法就认定业务正确。

角色修改后的检查入口如下；按改动选择相关测试，提交前完成仓库门禁。纯文档调整检查路径、链接和 Spec 即可。

```bash
npm run typecheck
npm run validate:specs
node --test --test-concurrency=1 tests/integration/agent-contracts.test.ts tests/security/agent-workspace.test.ts
# 修改 DSH 工具策略时：
node --test tests/integration/dsh-native-tools.test.ts
# 复核生产接线（受控模型，不计作 live）：
node --test tests/acceptance/dsh-configured-flow.test.ts
npm test
npm run evaluate:framework
```

### 排障先看哪里

| 现象 | 首先检查 |
| --- | --- |
| 改了提示词没有效果 | 改的是示范 prompt.txt、生产 basePrompt 还是 promptAddon；Run 是否沿用旧冻结快照 |
| 材料读不到 | `runLiveAgent()` 的可见路径、`LocalAgentWorkspace` 的固定 commit、`read_material` 的相对路径限制；不要直接扩大权限 |
| 输出被拒绝 | 模型原始 Schema 与业务 Result Schema 分别定位；检查未知字段、路径白名单及身份绑定 |
| 角色输出成功但下游无变化 | `normalizeAgentResult()` 是否保留该字段；命令组装与消费者是否实际读取它 |
| 范例失败 | 专属 runtime 的 `examples/<runId>/result.json` / `audit.json`；SDK 早期失败看 Registry 节点事件与 `demo/agent-runs.jsonl`，详见教程 |

## 当前实现与操作说明

R1 已将角色执行收敛到 DSH，通用项目场景从 CLI/API/Console 传入。Pi Agent 运行依赖已移除，旧记录保留可读且拒绝恢复；CodeAgent CLI 适配后置。R2 的真实 CPU DocGen 范例和独立工作区复现已通过验收，PR #26 已合入；R3 七角色和 R4 完整闭环尚未验收。

<details lang="en">
<summary>English summary</summary>

domain-knowledge exposes seven fixed Agent roles. A trusted operator may append a `promptAddon` of up to 4,000 characters. The add-on can refine wording, emphasis and decision discipline, but it cannot replace the base prompt, role responsibility, graph topology, JSON Schema, tools, workspace visibility, evaluator or publication authority. Changes beyond this boundary are core contract changes and must update the Spec, implementation and tests.

</details>

## 先分清“角色”和“执行后端”

Console 里看到的 Orchestrator、DocGen、DocWorker、TestGen、`code`、Check 和 Review 是七类固定角色。它们描述“这个节点负责什么”，不是七个分别安装的 Agent 产品。

`code` 是七角色之一，由 DSH 执行，产出经过业务 Schema 校验的文件内容；不是公司 CodeAgent CLI。Console 管理 DSH 模型配置。角色开发复用 DSH 工具和会话能力，项目只保留输入材料、业务结果和评测发布规则。

对应代码：

- 固定角色定义：[`src/infrastructure/workflow/langgraph/agent-definitions.ts`](../../src/infrastructure/workflow/langgraph/agent-definitions.ts)
- 节点到角色的映射：[`src/infrastructure/workflow/langgraph/graph.ts`](../../src/infrastructure/workflow/langgraph/graph.ts)
- Provider 装配：[`src/interfaces/runner/composition.ts`](../../src/interfaces/runner/composition.ts)
- DSH 配置适配：[`configured-provider.ts`](../../src/infrastructure/agents/deepseek-harness/configured-provider.ts)
- 公司 CodeAgent CLI Adapter：[`src/infrastructure/agents/company-codeagent/index.ts`](../../src/infrastructure/agents/company-codeagent/index.ts)
- 角色工作区和证据装配：[`src/application/services/automated-project-workflow.ts`](../../src/application/services/automated-project-workflow.ts)

## 允许改什么

当前产品只开放一个字段：`promptAddon`。

它会被追加在固定 `basePrompt` 后面，适合做这些调整：

- 指定中文术语、语气和文档结构；
- 强调某类风险、边界条件或引用格式；
- 要求结论写得更短、更具体，或优先说明适用范围；
- 在不改变输出 Schema 的前提下，约束判断纪律；
- 让 DocGen 在保持事实和引用不变的前提下，减少模板化、宣传式或生硬的 AI 文案。

服务端会去掉首尾空白，长度上限为 4,000 个字符，并拒绝空字符。每次保存都会增加 revision，并写入 `AgentPromptConfigured` 审计事件；事件只记录角色、revision 和长度，不保存 Prompt 正文。

## 不允许从前台改什么

以下内容不是提示词定制：

- `agentId`、节点名称和职责；
- LangGraph 节点、边、并行关系、循环和路由；
- 输入输出 JSON Schema；
- 工具列表、文件可见范围和写入权限；
- `allowedGeneratedPaths`、来源隔离和 Bubblewrap 策略；
- Evaluator 命令、Quality Gate、Publication Gate；
- KnowledgeVersion、GateDecision 或 Publication 的持久化规则。

HTTP 接口只接受形如 `{ "promptAddon": "..." }` 的请求。附带 `tools`、`role`、`inputs`、`outputs` 或其他字段会直接返回 `AGENT_CUSTOMIZATION_DENIED`。这条限制在服务端执行，不依赖浏览器是否隐藏了输入框。

## 选择要调整的角色

| 角色 ID | 适合调整的内容 | 不要要求它做的事 |
|---|---|---|
| `orchestrator` | 计划摘要的重点、风险排序、输出措辞 | 改拓扑、增加节点、决定发布 |
| `doc-worker` | 片段提取格式、引用粒度、未决问题表达 | 跨未分配文件猜测、合并最终知识 |
| `doc-gen` | 中文写作风格、章节组织、术语、人性化表达 | 编造来源、忽略 Correction、直接发布 |
| `test-gen` | 边界用例偏好、oracle 描述、候选命令说明 | 读取候选知识或生成实现 |
| `code` | 实现取舍、可读性、依赖偏好、错误处理风格 | 读取参考实现/门禁测试、扩展允许路径 |
| `check` | 检查重点、严重级别表述、误报纪律 | 修改代码、把工作区缺文件当成失败 |
| `review` | 归因粒度、Correction 判据、证据引用方式 | 推翻实际 Eval 结果、直接改变 Run 状态 |

## 推荐的追加提示词模板

一段有效的 `promptAddon` 不需要重复基础职责。把它写成可观察的增量要求：

```text
本次额外侧重：<希望这个角色多注意什么>。

表达要求：<术语、语言、结构或篇幅>。
证据要求：<哪些结论必须引用输入中的路径、报告或判据>。
禁止事项：<不要猜测、不要扩展范围、不要用哪些模糊措辞>。
验收观察：<完成后我会在输出、EvaluationReport 或 Gate 中核对什么>。
```

不要把密钥、内部 token、未脱敏用户数据或完整生产日志放进提示词。`promptAddon` 会持久化在本地 Registry；虽然 Demo 报告不会导出正文，它仍然不是秘密存储。

## 三个可直接使用的例子

### DocGen：让知识更自然，但不改事实

```text
请用自然、克制的简体中文写作。先说适用范围，再解释行为和边界；保留源码标识符、路径、命令、数值和 provenance，不要为了口语化改写事实。避免“赋能”“革命性”“显著提升”等宣传词，也不要用空泛总结填充篇幅。每个可验证结论都应能回到输入证据。
```

这类定制只影响表达。它不能让 DocGen 隐去来源，也不能把没有证据的内容写成确定事实。知识的人性化应发生在“事实、引用和验收锚点不变”的前提下。

### code：收紧实现风格

```text
优先使用项目已经声明的依赖和公开类型。实现保持短小，显式处理空输入和重复值；不要新增依赖、测试、文档或配置文件。只能返回 trusted context 中 allowedGeneratedPaths 列出的实现路径，无法满足时仍按既定 Schema 返回最小实现，不要自行扩展范围。
```

这段文字不会扩大输出路径。动态 JSON Schema 和应用层白名单仍然生效，模型即使提出额外文件也会被拒绝。

### Review：减少没有证据的阻塞项

```text
EvaluationReport 是测试执行事实源。只有内联候选知识、Check findings 或评测证据里存在可准确指出的矛盾时，才设置 blocking=true。需要迭代时，Correction 必须给出具体 knowledgePath、可复验 criterion 和实际 risk；不要因为只读工作区里没有物化的生成代码而判失败。
```

这能改善 Review 的判断纪律，但不能让 Review 代替 Domain Gate。最终 `PASS / ITERATE / STOPPED` 仍由确定性规则产生。

## 四种操作入口

### 1. 先查看固定合同

```bash
npm run knowledge -- agents
```

输出包含每个角色的职责、固定基础提示词、输入输出、工具以及当前 `promptAddon` 和 revision。

只读 HTTP：

```bash
curl http://127.0.0.1:4174/api/v1/agents
```

### 2. 用 CLI 保存

```bash
npm run knowledge -- set-agent-prompt \
  --agent doc-gen \
  --prompt '先写清适用边界；每个行为结论都要保留来源路径。'
```

CLI 面向本地受信操作员，直接写当前 `WP_FLYWHEEL_HOME` 对应的 Registry。

### 3. 用 HTTP 保存

先用 `WP_KNOWLEDGE_WRITE_TOKEN` 启动 Console，再提交 Bearer token：

```bash
curl -X PUT http://127.0.0.1:4174/api/v1/agents/doc-gen/prompt \
  -H "Authorization: Bearer $WP_KNOWLEDGE_WRITE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"promptAddon":"先写清适用边界；每个行为结论都要保留来源路径。"}'
```

不要把真实 token 写进脚本、文档或 shell 历史。上例只展示环境变量引用。

### 4. 用 Console 保存

打开 `http://127.0.0.1:4174`，进入“Agent 设置”：

1. 展开固定基础提示词，确认角色职责和现有输入输出；
2. 点击“写入凭据”，只在当前页面内存中填写写 token；
3. 在目标角色的“追加提示词”中填写内容；
4. 保存后确认 revision 增加；
5. 启动新的治理批次，在节点输出、EvaluationReport 和 Gate 中核对效果。

## 验证一次定制

不要用“模型看起来听话”作为验收。建议按下面的顺序验证：

1. 记录修改前的角色 ID、revision 和基准 Run；
2. 只改一个角色、一个目标，避免同时变化导致无法归因；
3. 使用相同仓库 commit、相同场景和相同评测命令启动新 Run；
4. 检查对应节点是否使用新的 revision；
5. 对比结构化输出、确定性评测、Gate outcome、耗时和失败类型；
6. 导出 `workflow-report`，确认报告仍不包含提示词正文和凭据；
7. 若效果变差，把 `promptAddon` 清空并再跑一次基准。

清空追加提示词：

```bash
npm run knowledge -- set-agent-prompt --agent doc-gen --prompt ''
```

清空会生成新的 revision，而不是删除审计历史。

Run 启动时会冻结 prompt revision、Provider/模型摘要、工具权限和 Schema URI，并把有效提示词正文作为不可变 CAS Artifact 保存；配置快照只保留摘要和 ArtifactRef。运行中的配置修改只影响新 Run，恢复执行仍读取原 Run 的冻结 Artifact。

## 什么时候必须进入核心开发

出现下面任一情况时，停止在前台反复堆提示词：

- 输入里缺少角色完成职责所必需的业务证据；
- 输出 Schema 无法表达需要的新字段；
- 需要新增工具、读写路径或网络能力；
- 需要增加、删除或重排节点；
- 需要改变 Gate、评测或发布规则；
- 需要接入新的 Agent Provider，而不是调整现有角色语气。

这些变化应按 Spec 驱动流程实施：

1. 在 `specs/01-requirements/` 增加或修改稳定需求 ID；
2. 同步 `specs/05-workflows/`、`specs/06-agents/`、安全边界和验收条件；
3. 修改 `src/application/ports` 的端口或数据结构；
4. 在相对独立的 `src/infrastructure/workflow/langgraph` 中修改图执行逻辑；
5. 在 `src/application/services` 组装新上下文与副作用；
6. 为 Provider 或工作区能力补 Adapter；
7. 增加 contract、integration、security 和 acceptance 测试；
8. 按实际影响同步架构、操作说明和相关 Console、站点内容；
9. 在 PR 中附上失败用例、真实运行证据和仍未解决的边界。

## 提交前检查

```bash
npm run typecheck
npm run validate:specs
npm test
npm run site:check
git diff --check
```

重点人工复查：

- 新文字是否把角色名误写成外部 Agent 产品；
- 是否仍由 domain-knowledge 持有 Gate 和发布权；
- 提示词是否可能诱导角色读取未授权来源或扩展输出路径；
- 人性化改写是否保留源码标识、来源、数字、命令和验收事实；
- Demo、PPT、README、Spec 和当前代码是否说的是同一件事。

真实 SDK 运行及失败恢复示例保存在 [wpKnowledge 证据目录](https://github.com/linlisWorkTeam/wpKnowledge/blob/main/knowledge/3.workpanel/%E8%AF%81%E6%8D%AE/2026-09-02-DeepSeek-Harness%E7%9C%9F%E5%AE%9EAgent%E6%B2%BB%E7%90%86%E6%BC%94%E7%A4%BA.md)。
