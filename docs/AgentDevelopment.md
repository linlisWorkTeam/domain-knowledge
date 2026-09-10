<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明七角色的独立开发、显式材料样例和 DocGen 固定源码范例。
-->
# Agent 开发指南

角色设计从 [Agents 索引](specs/domainFunction/agents/Agents.md) 进入各自独立文档，跨角色流程见 [Workflow](specs/domainFunction/services/workflow/Workflow.md)。本文件只说明如何定位、运行和修改角色，DocGen 的固定源码教程合并在后半部分。

CodeAgent 的目标输入输出已于 2026-09-10 确认：知识卡片包含接口，项目配置提供 C/C++ 运行约束，框架冻结读取权限并校验源码输出，详见 [CodeAgent 目标设计](specs/domainFunction/agents/codeAgent/CodeAgent.md) 和 [S2-05 任务](Status.md)。以下命令与样例仍对应现有实现，尚未支持新的项目配置入口；原 TypeScript 样例不能用作 C/C++ 业务验收结论。

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

真实模型开发在样例命令追加 `--provider dsh`，环境配置见 [Runtime](Runtime.md)。此时不使用样例 modelOutput，源码按 expectedCommit 物化，scenario.repositoryRoot 相对当前目录解析。每次调用创建独立 runtime；独立入口使用 Runtime 中的环境配置方式。

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
