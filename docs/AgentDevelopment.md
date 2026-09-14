<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明七角色的独立开发、显式材料样例和 DocGen 固定源码范例。
-->
# Agent 开发指南

角色设计从 [Agents 索引](specs/domainFunction/agents/Agents.md) 进入各自独立文档，跨角色流程见 [Workflow](specs/domainFunction/workflow/Workflow.md)。本文件只说明如何定位、运行和修改角色，DocGen 的固定源码教程合并在后半部分。

CodeAgent 当前只接收包含接口的知识卡片和裁剪后的 C/C++ 编写配置，角色契约、生产场景 agentConfiguration 及 C/C++ 独立样例均已接通。框架冻结材料权限并检查完整重建范围，详见 [CodeAgent](specs/domainFunction/agents/codeAgent/CodeAgent.md) 和 [Application 场景字段](specs/application/Application.md)。独立项目配置文件/版本管理仍未完成；受控样例通过不等于真实模型业务验收。

## 定位代码

目录小驼峰，文件大驼峰。每个 `xxxAgent/` 包含 `XxxAgent.ts`、`XxxAgentContract.ts`、`XxxAgentPrompt.ts`、`XxxAgent.test.ts` 和 `examples/XxxAgentSample.json`。

| 角色 ID | 目录 | 修改重点 |
| --- | --- | --- |
| orchestrator | `src/domain/agents/orchestratorAgent` | 当前轮固定业务计划 |
| doc-worker | `src/domain/agents/docGenAgent/subAgents/docWorkerAgent` | 源码分块与来源片段 |
| doc-gen | `src/domain/agents/docGenAgent` | 正文、修订材料与质量反馈 |
| test-gen | `src/domain/agents/testGenAgent` | 测试候选，隔离候选知识 |
| code | `src/domain/agents/codeAgent` | 路径白名单、重复路径与生成文件 |
| check | `src/domain/agents/checkAgent` | 只读检查与 findings |
| review | `src/domain/agents/reviewAgent` | 评测证据、纠正意见与风险 |

修改内部步骤只调整对应目录。角色注册在 AgentRegistry，材料加载在 ProjectWorkflowStages，共同提交在 RoleExecutionService；变更这些边界才编辑共享代码。

## 运行自己的角色

使用 Node 24+；执行以下依赖运行时的示例前按 AGENTS 核对 bootstrap READY，纯文档编辑不需要。以下示例无需启动上游角色：

```bash
npm run agent:run -- --role code --input src/domain/agents/codeAgent/examples/CodeAgentSample.json --output /tmp/code-development
```

七份样例显式选择 fixture，以 `{ "material": "name" }` 引用同文件 materials 中的上游材料。模型输出可控，但执行经过生产 Domain 入口、校验和提交链路。输出目录保存配置、Run/CAS、result.json 和脱敏 audit.json；失败保留 failure.json 与失败记录。结果为 NOT_EVALUATED，不自动启动 LangGraph、评测或发布。

修改后按需要验证角色，例如 `node --test src/domain/agents/codeAgent/CodeAgent.test.ts`。公共契约变化同步 `docs/specs/schemas/`、消费者与集成测试。正常交付检查见 [Development](Development.md)；用户要求不跑测试时只记录实际静态检查，不能宣称角色测试通过。

Prompt 在各角色 XxxAgentPrompt.ts 中维护，包含职责、基础指令、工具和可读路径。运行时拼入冻结的 promptAddon、适用治理指令、本轮命令和授权工件正文；输出 Schema 单独约束结果。修改材料或执行语义时同时核对 Contract、Application 组装、样例/受控响应及执行版本，不能只改提示词。

真实模型开发在样例命令追加 `--provider dsh`，环境配置见 [Runtime](Runtime.md)。此时不使用样例 modelOutput，源码按 expectedCommit 物化，scenario.repositoryRoot 相对当前目录解析。每次调用创建独立 runtime；独立入口使用 Runtime 中的环境配置方式。

## 完整流程与证据保留

`tests/integration/` 验证本平台各模块协作；TestGen 生成的 C/C++ files/cases 是目标项目的测试材料，两者不同。完整受控 SDK 回归在 `tests/acceptance/AgentRevisionFlow.test.ts`，覆盖 TestGen 失败修复、固定测试集、两轮知识修订、真实编译/外部监督及 Gate 发布：

```bash
WP_ACCEPTANCE_OUTPUT=/absolute/path/to/new-acceptance-output \
  node --test tests/acceptance/AgentRevisionFlow.test.ts
```

使用 Node 24 和下述原生评测环境，选择一个新的输出目录。该变量让用例保留源码仓库、运行数据库/CAS 及模型请求响应等资料；不设置时使用临时目录并在测试后清理。报告中 readable、评测索引及归档是验收后的整理产物，不能假定每次执行都会自动生成相同整理目录。

本轮最终代码 `acfd714` 的受控 SDK 运行有 13 次模型调用、5 次评测，结果 COMPLETED/PASS/VERIFIED；全部材料及验证范围见 [报告首节](reports/AgentSpecRepairAndE2E.md)。模型响应由本地测试服务控制，不能用它声明真实模型的文档或测试质量已验收。

原生生成测试必须包含唯一 caseId/entryPoint，提供 `int entryPoint(void)`，不定义 main。参考与 finalCommands 都须显式编译测试文件并运行对应 binary；支持每条命令独立 cwd，框架保留项目参数并追加 runner。监督器需求及配置失败处理见 [Runtime](Runtime.md)，完整契约见 [TestGen](specs/domainFunction/agents/testGenAgent/TestGenAgent.md)。

`.workpanel/` 是本仓库被 Git 忽略的本地数据目录名，包含验收产物、默认图检查点及 bootstrap 记录；不是 ohMyWorkPanel 依赖。`WP_ACCEPTANCE_OUTPUT` 可指定其他目录，生产运行位置由 `WP_FLYWHEEL_HOME` 等运行配置决定。

## DocGen 固定源码样例

固定样例与其检查器均位于 `src/domain/agents/docGenAgent/`，通过统一入口执行：

```bash
npm run agent:run -- --role doc-gen --input src/domain/agents/docGenAgent/examples/DocGenFixedSourceSample.json --output /tmp/docgen-fixed-source
```

样例 JSON 显式保存固定提交的源码正文、公开接口、promptAddon 和可控 modelOutput。默认 fixture 验证共同角色、Schema 和 CAS 提交链路；追加 `--provider dsh` 使用已配置的真实模型，不采用 modelOutput。配置方式见 [Runtime](Runtime.md)，独立入口每次创建新的运行目录，不复用旧示例的专属 runtime 接口。

产物沿用所有角色共同的 result.json、audit.json 和 runtime。正文通过 result.payload.bodyRef 对应 outputs 中的内容读取，不再另外生成 document.md 或专用报告格式。

`examples/DocGenReference.ts` 只用于样例验证：核对固定源码摘要和七项参考测试，检查文档引用范围，并把 JSON 数据例子交给可信实现验证 hunks 和 changedSections。测试位于 `DocGenExample.test.ts`，保留错误预期、缺少覆盖、非法引用、真实 DSH 受控链路、Prompt 冻结、CAS、失败和取消的断言。检查器不执行模型生成脚本，正文语义仍需人工审阅。

普通 agent:run 不自动执行该参考测试或检查器，也不据此标记知识为 VERIFIED。固定源码检查属于本角色的样例测试，测试执行按 Development 的检查约定选择；本次清理未运行这些测试。

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

Role directories use lowerCamelCase and files use PascalCase. Each role owns execution, contracts, prompts, tests and explicit examples. Standalone runs share production validation and artifact submission without starting the graph, evaluation or publication. The fixed-source DocGen materials and checks live beside the role and use the same agent:run entrypoint. Controlled output, live execution and semantic quality require distinct evidence.

</details>

## DocGen 内部 Worker

DocGen 是外层知识生成入口，DocWorker 是其内部 subAgent。修改源码分块与汇总流程从 `docGenAgent/DocGenAgent.ts` 开始；修改单个片段的提取从 `docGenAgent/subAgents/docWorkerAgent/` 开始。Worker 仍可用 `--role doc-worker` 独立测试。

组合样例：

```bash
npm run agent:run -- --role doc-gen --input src/domain/agents/docGenAgent/examples/DocGenWithWorkersSample.json --output /tmp/docgen-with-workers
```

这是 fixture 组合验证：运行两个内部 Worker，再运行 DocGen 汇总并保存子任务引用，不代表真实模型质量验收。`workerModelOutputs` 按 Worker 身份提供模拟输出；真实 DSH 模式忽略该字段。原汇总样例显式设置 `payload.workerCount=0`。生产默认一个 Worker，最大五个任务，执行器默认最多三个并发；修改并发配置定位 Composition 中的 ConcurrentTasks。

## DocGen 拆分建议与继续单文档任务

DocGen 输出 splitProposal 时，统一入口的终端 JSON 增加 decisionRequired，完整提案保存在 result.json 的 outputs 中；不产生 bodyRef。生产工作流在 candidate_knowledge 展示原因和建议后 STOPPED，用户答复前不会继续生成。

若用户选择继续合成一份，将提案工件内容作为新样例的 `materials.proposal`（application/json），在 payload 传入 `documentDecision: { "action": "keep-single", "proposalRef": { "material": "proposal" } }`。保持 moduleId 与 sourceRefs 对应的源码工件不变；框架校验提案绑定后只接受一份文档。若用户选择拆分，先按用户选定的一份范围准备新任务，每次只处理一份。生产调用方也可在新场景 docGenDecision 传入相同结构，proposalRef 必须已存在于该运行环境的工件库。恢复同一已提交提案不会自动推定用户选择。
