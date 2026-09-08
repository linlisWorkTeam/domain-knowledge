<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明Agent 开发指南。
-->
# Agent 开发指南

七角色统一位于 `src/domain/agents/XxxAgent/`。Domain 代码控制业务阶段，模型运行 Adapter 在阶段内执行授权工具，LangGraph 负责跨角色调度。本轮只迁移现有行为，结构验收不代表七角色真实模型效果验收。

<details lang="en">
<summary>English summary</summary>

Each role owns its execution, contracts, prompts, tests and examples under `src/domain/agents/`. Production and standalone development share the same role and artifact transaction. The model adapter owns runtime retries and tools; LangGraph owns cross-role flow. This refactor preserves existing behavior and does not establish live model quality.

</details>

<a id="目录与类"></a>

## 目录与职责

每个角色目录包含 `XxxAgent.ts`、`XxxAgentContract.ts`、`XxxAgentPrompt.ts`、`XxxAgent.test.ts` 和 `examples/XxxAgentSample.json`。修改角色内部步骤、输出校验、提示词或材料可见性时，优先只修改这个目录。

| 文件 | 职责 |
| --- | --- |
| `XxxAgent.ts` | `execute(input, context)`：检查材料、调用模型、校验并转换业务结果，声明待保存工件 |
| `XxxAgentContract.ts` | 角色专属输入输出类型、输出 Schema、必需材料和语义校验 |
| `XxxAgentPrompt.ts` | 基础提示词、职责、授权能力、可见材料与源码路径 |
| `XxxAgent.test.ts` | 正常、缺失材料、非法输出、取消及角色特有规则 |
| `examples/XxxAgentSample.json` | 独立输入、显式上游材料、可控模型输出 |

共享边界：

- `src/domain/agents/AgentContracts.ts` 拥有角色 ID 和版本化命令/结果类型；`AgentExecution.ts` 定义最小模型 Port、取消和工件交接。
- `src/domain/agents/AgentRegistry.ts` 显式注册角色；没有自动发现、基类、步骤 DSL 或子 Agent 框架。
- `ProjectWorkflowStages` 加载可信快照和历史工件、构造命令、调用角色；`RoleExecutionService` 为生产和开发共用 CAS、信封绑定与事务提交。
- `src/infrastructure/agentAdapters/ModelExecution.ts` 将模型 Port 映射到现有 Provider、隔离工作区和审计。网络、格式修复重试仍由 Provider 负责；角色没有重复重试循环。
- `src/domain/services/workflow/AgentDefinitions.ts` 拥有节点名称映射，`src/domain/services/workflow/Workflow.ts` 拥有业务连接和路由，`src/infrastructure/langgraph/Graph.ts` 映射执行引擎。Orchestrator 返回业务计划，不控制图连接。

<a id="角色定位表"></a>

## 七角色

| 目录 | 材料与输出边界 |
| --- | --- |
| `OrchestratorAgent` | 策略与模块摘要 → 当前轮业务计划，无文件工具 |
| `DocWorkerAgent` | 分配源码与公开接口 → 有来源的知识片段 |
| `DocGenAgent` | 源码、片段、旧正文、纠正意见及质量反馈 → 知识正文 |
| `TestGenAgent` | 源码、公开接口和测试策略 → 候选测试；不读取候选知识 |
| `CodeAgent` | 知识与公开接口 → 完整路径白名单内的文件；拒绝重复路径 |
| `CheckAgent` | 生成文件和确定性判据 → 只读 findings |
| `ReviewAgent` | 知识和评测证据 → 归因、纠正意见及风险 |

保留的行为限制：Orchestrator 计划由代码固定生成；TestGen 候选命令尚未被门禁消费；Check findings 仍是字符串，`diffRef` 引用生成文件 JSON；Review 尚未单独绑定 Check 明细，原始 correction 为单项或 null。本轮没有扩展这些能力。质量、评测判定和发布资格由 Domain 服务负责，Application 协调评测与持久化。

<a id="agent-development-sop"></a>

## 独立开发与验收

1. 阅读最新 `docs/epitaph/`。使用 Node 24+；新 worktree 先运行 `npm run bootstrap:worktree` 至 READY，不共享 node_modules。
2. 运行自己的角色样例，再修改角色目录并执行角色测试。
3. 涉及公共契约时同步 `specs/schemas/`；涉及跨角色流程时修改显式注册和图连接，并跑集成回归。
4. 交付时区分结构测试、受控 DSH 链路测试和真实模型业务验收，记录未验证项。

```bash
npm run agent:run -- --role code --input src/domain/agents/CodeAgent/examples/CodeAgentSample.json --output /tmp/code-development
node --test src/domain/agents/CodeAgent/CodeAgent.test.ts
npm run typecheck
npm run validate:specs
npm run test:architecture
npm test
npm run test:ui
```

七份样例显式选择 `provider: fixture`，注入固定模型返回值，但经过生产角色、输出校验和提交链路。样例用 `{ "material": "name" }` 引用同文件 `materials` 中的明确内容；不会隐式执行上游角色。独立目录保存 `result.json`、配置摘要、`audit.json` 和 Run/CAS；失败时保存 `failure.json` 并保留运行记录。示例不启动 LangGraph、评测或发布，始终 `NOT_EVALUATED`。

真实 DSH 开发在已配置环境中追加 `--provider dsh`；样例 `scenario.repositoryRoot` 相对当前目录解析，源码从 `expectedCommit` 物化。真实模型输出不会采用样例中的 `modelOutput`。每次 CLI 调用创建独立 runtime；环境方式配置见 [DSH 运行说明](dsh-runtime.md)。需要复用 Console 中的已验证配置时，使用原有 [DocGen 示例](../tutorials/add-agent-capability.md) 的 `--runtime` 接口。

`npm run example:docgen -- prepare/run/check` 保留原输出接口；执行经过相同 Domain DocGen 和 `RoleExecutionService`，不再创建单节点图。正文的引用与语义仍需独立核验。

## 增加角色与版本兼容

新角色需要显式修改 `AgentContracts.ts` 的角色 ID、`AgentRegistry.ts` 的角色注册、版本化命令/结果 Schema、Domain Workflow 的节点映射与业务连接，以及 LangGraph 适配接线，以及 Application 的可信输入加载。只调整已有角色内部步骤不需要修改这些共享位置。新增公共工具还需 Adapter 授权与隔离测试。

运行配置记录 `roleExecutionVersion=domain-agents-v1`。以后改变执行语义时更新 `ROLE_EXECUTION_VERSION`。缺少该标识或版本不符的旧 Run 在恢复前明确失败，历史知识、结果及记录继续可读；不迁移 checkpoint。同版本恢复及幂等提交仍受现有测试保护。

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

生产基础指令在 `src/domain/agents/XxxAgent/XxxAgentPrompt.ts`；`examples/docgen/prompt.txt` 只用于范例。同执行版本的 Run 恢复继续使用冻结配置；重构前的 Run 保持只读，不支持跨版本恢复。

</details>
