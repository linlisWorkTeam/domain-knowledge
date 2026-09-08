<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明七角色的独立开发、显式材料样例和 DocGen 固定源码范例。
-->
# Agent 开发指南

角色设计见 [Agents](specs/domainFunction/agents/Agents.md)，跨角色流程见 [Workflow](specs/domainFunction/services/workflow/Workflow.md)。本文件只说明如何定位、运行和修改角色，DocGen 的固定源码教程合并在后半部分。

## 定位代码

目录小驼峰，文件大驼峰。每个 `xxxAgent/` 包含 `XxxAgent.ts`、`XxxAgentContract.ts`、`XxxAgentPrompt.ts`、`XxxAgent.test.ts` 和 `examples/XxxAgentSample.json`。

| 角色 ID | 目录 | 修改重点 |
| --- | --- | --- |
| orchestrator | `src/domain/agents/orchestratorAgent` | 当前轮固定业务计划 |
| doc-worker | `src/domain/agents/docWorkerAgent` | 源码分块与来源片段 |
| doc-gen | `src/domain/agents/docGenAgent` | 正文、修订材料与质量反馈 |
| test-gen | `src/domain/agents/testGenAgent` | 测试候选，隔离候选知识 |
| code | `src/domain/agents/codeAgent` | 路径白名单、重复路径与生成文件 |
| check | `src/domain/agents/checkAgent` | 只读检查与 findings |
| review | `src/domain/agents/reviewAgent` | 评测证据、纠正意见与风险 |

修改内部步骤只调整对应目录。角色注册在 AgentRegistry，材料加载在 ProjectWorkflowStages，共同提交在 RoleExecutionService；变更这些边界才编辑共享代码。

## 运行自己的角色

使用 Node 24+；新工作树先 bootstrap 至 READY。以下示例无需启动上游角色：

```bash
npm run agent:run -- --role code --input src/domain/agents/codeAgent/examples/CodeAgentSample.json --output /tmp/code-development
```

七份样例显式选择 fixture，以 `{ "material": "name" }` 引用同文件 materials 中的上游材料。模型输出可控，但执行经过生产 Domain 入口、校验和提交链路。输出目录保存配置、Run/CAS、result.json 和脱敏 audit.json；失败保留 failure.json 与失败记录。结果为 NOT_EVALUATED，不自动启动 LangGraph、评测或发布。

修改后按需要验证角色，例如 `node --test src/domain/agents/codeAgent/CodeAgent.test.ts`。公共契约变化同步 `docs/specs/schemas/`、消费者与集成测试。正常交付检查见 [Development](Development.md)；用户要求不跑测试时只记录实际静态检查，不能宣称角色测试通过。

真实模型开发在样例命令追加 `--provider dsh`，环境配置见 [Runtime](Runtime.md)。此时不使用样例 modelOutput，源码按 expectedCommit 物化，scenario.repositoryRoot 相对当前目录解析。每次调用创建独立 runtime；若要复用 Console 已保存配置，使用下方 DocGen 的 runtime 参数。

## DocGen 固定源码范例

该入口保留旧 prepare/run/check 接口，使用固定提交的 structuredMarkdownDiff 源码和参考测试。范例指令位于 `examples/docGen/Prompt.txt`；公共基础指令仍由 `docGenAgent/DocGenAgentPrompt.ts` 拥有。

```bash
npm run example:docgen -- prepare
npm run example:docgen -- run
npm run example:docgen -- check --document /absolute/path/to/document.md
```

prepare 准备固定提交并核验参考实现。run 要求有效 DSH 模型配置，默认运行目录 `.workpanel/docgen-example`；缺配置返回 DOCGEN_LIVE_CONFIGURATION_REQUIRED，不回退 Fixture。真实 Linux 执行要求 Bubblewrap 可用。可在相同 runtime 启动 Console 保存并验证模型配置：

```bash
WP_FLYWHEEL_HOME="$PWD/.workpanel/docgen-example" npm run knowledge:serve
npm run example:docgen -- run --runtime /absolute/path/to/example-runtime
```

check 接收 `--document` 指定候选正文；若使用独立 runtime，prepare、run、check 均需指向同一路径。输出 `examples/<runId>/document.md`、result.json、audit.json 保存候选正文、工件引用和脱敏调用数据。节点完成不代表知识已发布，范例 Run 保持 CREATED，不通过生产恢复接口恢复示范 Run。

DocGen 给出 JSON 数据例子，覆盖相同输入、CRLF 归一化和标题编辑。检查器将数据交给固定可信实现，核对 hunks、changedSections 和引用范围，不执行模型生成脚本。正文仍需人工语义核对，受控输出、独立例子检查和真实模型质量是不同证据。

## 增加角色与配置变更

新增角色显式更新 AgentContracts、AgentRegistry、Domain Workflow 的节点映射和连接、Application 可信输入加载及版本化信封。新增工具同步 Adapter 授权和隔离验证，不引入自动注册或通用步骤 DSL。

Console 只允许修改 promptAddon，最多 4000 字符，只影响新 Run：

```bash
npm run knowledge -- agents
npm run knowledge -- set-agent-prompt --agent doc-gen --prompt '每个行为结论保留来源路径。'
```

运行恢复使用冻结配置。改变执行语义需审查 ROLE_EXECUTION_VERSION；旧执行版本拒绝恢复，历史结果仍可读。更改目录或文档不能自动提升 TestGen oracle、Review 归因或发布能力。

<details lang="en">
<summary>English summary</summary>

Role directories use lowerCamelCase and files use PascalCase. Each role owns execution, contracts, prompts, tests and explicit examples. Standalone runs share production validation and artifact submission without starting the graph, evaluation or publication. The fixed-source DocGen example retains its prepare/run/check interface. Controlled output, live execution and semantic quality require distinct evidence.

</details>
