# Agent 开发指南

**每人负责一个角色，复用同一套 LangGraph → DSH 底座。** 底座与 DocGen 范例已合入 #26；七角色业务开发尚未全部完成。下面按“找到代码 → 修改功能 → 验收提 PR”使用。

<details lang="en">
<summary>English summary</summary>

Find each role's code, extend the shared LangGraph and DSH foundation, and verify changes before opening a pull request. The foundation and DocGen example are available; the complete seven-role workflow is still in development.

</details>

## 1. 目录与类

<a id="目录与类"></a>

**目前没有七个独立 Agent 类。** 角色定义集中在 `agent-definitions.ts`，业务逻辑集中在 `ProjectWorkflowStages`，按 `agentId` 查找自己的分支。

```text
src/
├── infrastructure/workflow/langgraph/
│   ├── agent-definitions.ts           # 七角色 ID、基础提示词、工具声明
│   └── graph.ts                       # 节点、并行、汇合与路由
├── application/services/
│   ├── automated-project-workflow.ts  # ProjectWorkflowStages：输入、调用、输出、业务处理
│   ├── docgen-example.ts              # DocgenExampleService：单 DocGen 范例
│   └── run-configuration.ts           # RegistryRunConfigurationService：冻结运行配置
├── infrastructure/agents/
│   ├── deepseek-harness/
│   │   ├── configured-provider.ts    # ConfiguredDshProvider：模型配置与受信转发
│   │   ├── index.ts                  # DeepSeekHarnessSdkAgent：DSH 会话与执行
│   │   └── role-tools.mjs            # read_material 工具及权限限制
│   ├── workspace/index.ts            # LocalAgentWorkspace：授权文件工作区
│   └── contracts/index.ts            # JsonSchemaAgentContractValidator：业务信封校验
└── interfaces/runner/
    ├── composition.ts                # createComposition：装配上述组件
    └── docgen-example.ts             # 范例 prepare / run / check 命令
```

开发时主要看两个文件：[角色定义](../../src/infrastructure/workflow/langgraph/agent-definitions.ts)和[业务实现](../../src/application/services/automated-project-workflow.ts)。后者按以下顺序阅读：

| 位置 | 做什么 | 什么时候改 |
| --- | --- | --- |
| `execute()` | 按节点分派业务 | 改节点接线 |
| `buildAgentCommand()` | 组装本角色输入 | 增减输入字段或上游工件 |
| `runLiveAgent()` | 准备授权材料，调用 DSH | 调整角色可见文件 |
| `AGENT_OUTPUT_SCHEMAS` | 规定模型返回的 JSON | 改原始输出字段 |
| `normalizeAgentResult()` | 原始输出 → CAS 工件与业务结果 | 改下游交接格式 |

模型原始 JSON 与规范化后的 `AgentResult` 是两层契约；改输出时要同时检查转换及消费者，业务契约变化同步 `specs/schemas/`。会话、工具、重试、取消由公共底座维护。

## 2. 七角色改哪里

<a id="角色定位表"></a>

先在 `agent-definitions.ts` 找表中 ID，再到 `ProjectWorkflowStages` 找同名分支。`doc-worker/doc-gen/test-gen` 的图节点名分别为 `doc_worker/doc_gen/test_gen`，其他相同。

| 角色 / ID | 开发任务与材料边界 | 重点代码位置 | 当前模型输出字段 |
| --- | --- | --- | --- |
| [Orchestrator](../../specs/06-agents/orchestration-agents.md) / `orchestrator` | 根据策略、模块元数据做任务规划；不读源码、不改图 | `orchestrate()`；命令/结果的 orchestrator 分支 | `strategy, iteration, parallel` |
| [DocWorker](../../specs/06-agents/documentation-agents.md) / `doc-worker` | 从分配源码提取有来源的片段，交给 DocGen | `assignedSourcePaths()`；DocGen 的 `workerFragmentRefs` 汇集 | `workerId, fragment, provenance` |
| [DocGen](../../specs/06-agents/documentation-agents.md) / `doc-gen` | 用源码、片段和反馈生成/修订知识；核对事实与来源 | doc-gen 分支；`commitCandidate()`；`baseKnowledgeRef/corrections/qualityFeedback` | `body, title, description` |
| [TestGen](../../specs/06-agents/test-generation-agent.md) / `test-gen` | 从参考源码、接口生成候选测试；不读候选知识或生成实现 | test-gen 分支；`validateOracle()`、`evaluate()` | `candidateCommands, oracleRequired` |
| [Code](../../specs/06-agents/code-and-check-agents.md) / `code` | 仅用知识与公开接口生成允许路径的实现；不读参考源码、测试或旧实现 | code 分支；`outputSchemaFor()`、`assertAllowedGeneratedFiles()` | `files: [{path, content}]` |
| [Check](../../specs/06-agents/code-and-check-agents.md) / `check` | 只读检查生成实现与判据，报告可定位问题 | check 分支；`recordGateDecision()` | `blocking, findings, scope` |
| [Review](../../specs/06-agents/review-agent.md) / `review` | 根据知识与评测证据归因，给可复验 Correction | 命令/结果函数最后的 Review `else` 分支；下轮 DocGen | `blocking, recommendation, correction` |

**开发前注意四个现状：** Orchestrator 的规范化计划目前由代码固定生成；TestGen 候选命令尚未被门禁消费；Check 的 findings 仍是字符串列表，`diffRef` 实际引用生成文件 JSON；Review 尚未单独绑定 Check 明细，原始 correction 只能为单项或 null。这些需要按角色目标补齐，不能只改提示词。

所有角色都不能自行发布或改 Run 状态。Code 返回文件内容，由评测器写入独立副本；Check/Review 应检查传入工件，不能因自己的目录缺少生成文件而报错。当前 Orchestrator 无文件工具，其余角色仅有 `read_material`；新增工具须同步运行时权限和隔离测试。

## 3. 开发与验收

<a id="agent-development-sop"></a>

1. **准备**：Node 24+，每人独立 worktree；运行 `npm run bootstrap:worktree` 至 READY，不共享 node_modules。
2. **复现**：按 [DocGen 教程](../tutorials/add-agent-capability.md)配置专属 runtime，执行 `prepare/run/check`。当前没有通用 `--role` CLI；其他角色测试装配参考 [dsh-project-stages.test.ts](../../tests/integration/dsh-project-stages.test.ts)。
3. **开发**：修改自己的定义项、业务分支和测试；输入输出与上下游对齐后写回对应角色 Spec。共享文件小步提交，工具、图和 Gate 变更由底座负责人统一审查。
4. **验收**：覆盖正常、材料不足、非法输出、身份错配、权限拒绝；实际调用 DSH 并独立检查业务结果。TestGen 预期须经可信参考验证；Code 须独立评测；DocGen 须复核正文；Check/Review 须覆盖缺陷和无缺陷场景。
5. **交付 PR**：附规范、实现、测试、Run/session/工件摘要、独立检查结果和未解决项；review 合入后继续。JSON 合法不等于业务通过，受控测试不代替真实模型证据。

| 验证目标 | 现有测试入口 |
| --- | --- |
| 契约、身份与结果交接 | `tests/integration/agent-contracts.test.ts` |
| 材料隔离 / 工具拒绝 | `tests/security/agent-workspace.test.ts` / `tests/integration/dsh-native-tools.test.ts` |
| DocGen 范例 | `tests/integration/docgen-example.test.ts` |
| 七角色接线（受控模型） | `tests/acceptance/dsh-configured-flow.test.ts` |

角色代码提交前执行 `npm run typecheck`、`npm run validate:specs`、相关角色测试、`npm test` 和 `npm run evaluate:framework`。真实验收要求见 [AC-DSHF-008](../../specs/changes/active/DEV-019-dsh-agent-foundation/acceptance.md#七角色逐项验收r3)。

<a id="允许改什么"></a>

<details>
<summary>仅调整现有角色措辞：promptAddon 用法</summary>

Console“Agent 设置”或以下 CLI 可保存追加提示词；上限 4,000 字符，只影响新 Run，不能改变职责、Schema、工具或权限。不要放入凭据。

```bash
npm run knowledge -- agents
npm run knowledge -- set-agent-prompt --agent doc-gen --prompt '每个行为结论保留来源路径。'
# 清空追加内容也会记录新 revision：
npm run knowledge -- set-agent-prompt --agent doc-gen --prompt ''
```

生产基础指令在 `agent-definitions.ts`；`examples/docgen/prompt.txt` 只用于范例。恢复旧 Run 会继续使用冻结配置。

</details>
