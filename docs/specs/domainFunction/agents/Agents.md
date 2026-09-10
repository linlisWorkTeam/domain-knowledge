<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：七角色执行设计。
-->
# 七角色执行设计

代码位置：[src/domain/agents/AgentRegistry.ts](../../../../src/domain/agents/AgentRegistry.ts)、[src/domain/agents/AgentExecution.ts](../../../../src/domain/agents/AgentExecution.ts)、[src/domain/agents/AgentContracts.ts](../../../../src/domain/agents/AgentContracts.ts)。


## 输入输出确认记录（2026-09-10）

本节记录本会话的确认进度；下方角色契约表仍描述现有设计，待确认项不作为修改代码、Schema 或材料权限的依据。

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-01 | Agent 划分与业务阶段 | 已确认 | 保留原有 Orchestrator、DocWorker、DocGen、TestGen、Code、Check、Review 七个 Agent。知识生成、知识检索、知识飞轮、知识评测、知识关联是多 Agent 协作的五个业务阶段，不分别改为五个独立 Agent。各阶段到角色的具体分工仍待逐项明确。 |
| IO-02 | TestGen 的输入与测试预期依据 | 确认中 | 现有设计输入固定源码、公开接口、语言和测试策略，不读取候选知识；用户业务描述为根据知识卡片生成测试。尚未决定最终输入及测试预期依据，用户要求先记录并继续下一问题。知识不变时复用已有用例的规则也需后续单独确认。 |
| IO-03 | CodeAgent 的主要业务输入及公开接口来源 | 已确认（待实现） | 主要业务输入是知识卡片，公开接口资料包含在卡片中，不单独传入接口材料，也不通过额外读取原仓库接口文件补充。现有 publicInterfaceRefs 与接口文件读取授权需要在实现阶段同步调整；本次只记录目标。 |
| IO-04 | CodeAgent 的其他输入与执行权限 | 已确认（待实现） | 接收项目配置中影响代码编写的语言、依赖约束和允许生成路径；框架冻结本轮可读文件白名单与输出位置，以受限工具和进程隔离落实。CodeAgent 返回文件列表，由框架校验并落盘，不直接写业务仓库。 |
| IO-05 | CodeAgent 的目标语言 | 已确认（待实现与验收） | 用户业务代码为 C/C++，生成代码的目标语言限定为 C/C++。具体标准、依赖与工具链由项目/场景配置指定；现有 TypeScript 开发样例不能作为目标业务语言已适配的证据。 |
| IO-06 | 依赖与构建说明的存放边界 | 已确认（待实现） | 不放入知识卡片。框架侧按业务项目管理项目配置，场景引用对应配置版本；角色只获得必要部分，完整构建配置交编译、评测执行器。切换项目选择另一份配置，运行中使用已冻结版本。 |

## CodeAgent 目标输入输出（已确认，待实现）

本节是 2026-09-10 用户确认的目标，关联 KF-SYS-003、044、045；旧代码差异见下方当前实现表。TestGen 的 IO-02 继续保持确认中，本次不替其决定输入。

| 边界 | 目标约定 |
| --- | --- |
| 主要业务输入 | 本轮选定且固定版本的知识卡片，包含公开接口及实现所需的业务知识。不得额外传入原仓库接口文件或读取它们补充卡片。 |
| 必要运行约束 | 从项目/场景配置裁剪出的 C/C++ 标准、允许使用的依赖与影响编写的约束、允许生成的相对文件路径。依赖和构建说明不写入知识卡片。 |
| 可读材料 | 本轮知识卡片和经过裁剪的必要配置；原始实现、参考测试、其他角色材料与其他运行文件不可见。传入 Prompt 的正文与工具可读文件遵循同一范围。 |
| 工具权限 | 只允许读取本轮授权材料；模型不能扩大白名单，不授予全局文件读取、Shell 或直接写业务仓库的能力。 |
| 输出 | `files` 数组，每项为相对于本轮输出根目录的 `path` 与源码 `content`；由框架校验并写入临时目录，交后续比较、编译和测试。 |

输出形式沿用文件列表，例如：

```json
{
  "files": [
    { "path": "src/example.cpp", "content": "// 本轮生成的 C/C++ 源码" }
  ]
}
```

业务知识不足时应由后续检查、评测向知识生成环节反馈，不能通过开放原仓库读取来补答案。完整构建命令和参考测试交执行器，CodeAgent 不负责执行编译、评测或发布。可读路径、隔离及输出落盘规则见 [Workspace](../workspace/Workspace.md)，配置归属和版本冻结见 [Application](../../application/Application.md)。

实施时需要同步修改 CodeAgent 的 Payload、Prompt、材料加载、读取授权、Schema 和样例：移除独立 `publicInterfaceRefs` 及其文件授权，不再把整份 `scenarioRef` 当作 `buildContractRef` 传入；保留输出路径校验。具体机器字段和配置加载入口在实现时落到现有契约，不以本文示例伪称已有配置支持。

## 共同协议

每个 XxxAgent 目录有入口、Contract、Prompt、测试和显式样例。`execute(input, context)` 的 input 使用角色专属 Payload 与已加载材料；context 注入模型 Port、promptAddon 与取消信号。入口依次检查取消和材料、构建 Prompt / Schema、调用一次模型、再次检查取消、校验输出、返回 output / payload / artifacts。格式及网络重试由 Adapter 负责，本轮角色不新增业务修订循环。

`RoleResult` 中 pending 引用由 Application 保存正文后绑定，Domain 不操作 CAS 路径或信封事务。材料的可见范围由角色 Prompt 定义与载荷引用共同限制，不能把完整工作流上下文交给所有角色。

## 角色契约与业务步骤

下表为当前实现；CodeAgent 的目标输入与执行边界已按 IO-03～06 确认，尚未改入代码，后续不能把这里的旧接口输入当作用户最终要求。

| 目录 / 角色 | 输入材料 | 返回结果与约束 |
| --- | --- | --- |
| orchestratorAgent / orchestrator | 策略、模块材料 | 校验模型输出后生成固定六类任务计划；计划不改变跨角色连接 |
| docWorkerAgent / doc-worker | 模块源码、公开接口、分块身份 | 文档片段和来源引用，交 DocGen 汇总 |
| docGenAgent / doc-gen | 源码、接口；可选片段、上一版、corrections、质量反馈 | body、title、description；正文至少 200 字符，待保存知识正文及来源 |
| testGenAgent / test-gen | 固定源码、接口、语言、测试策略 | 测试候选与 oracle 声明；不接收候选知识，候选命令当前不进入门禁 |
| codeAgent / code | 知识、接口、构建契约、允许生成路径 | files；动态 Schema 限定白名单，语义校验拒绝重复路径，不读取参考源码和门禁测试 |
| checkAgent / check | Diff、判据、公开接口 | blocking、字符串 findings；只返回检查意见，不修代码 |
| reviewAgent / review | 知识、评测报告、判据 | correction 为一项或 null，标准化编号并绑定可信评测证据；结果信封使用 corrections 数组 |

DocGen 修订必须由 Application 显式提供旧正文和纠正材料；Review 不能自行捏造评测引用。目前 Review 未单独绑定 Check findings 明细，不把结构迁移写成完整归因能力。

## 输出与失败

闭合 Schema 拒绝缺失字段、额外字段或角色错配；Code 额外检查路径语义。缺材料在模型前失败；取消在模型前后检查。失败由 Application / Adapter 记录，不能伪造正常业务结果。角色只有授权工具，发布、Registry 和图调度不属于角色能力。

## 开发入口

使用 `npm run agent:run -- --role code --input src/domain/agents/codeAgent/examples/CodeAgentSample.json --output /tmp/code-agent-run`，其他角色替换角色 ID 和样例。Fixture 与 DSH 都经过同一入口和提交链路；默认样例使用可控模型，`--provider dsh` 需要明确接入配置。结果为独立开发 Run，不自动评测或发布。步骤详见 [角色开发](../../../AgentDevelopment.md)。

## 独立检索方向（未实现）

SearchAgent 不属于七角色枚举。目标是 KnowledgeSearchApp 直接调用，只读已发布、当前 VERIFIED 且正文摘要有效的知识，不创建 FlywheelRun、不经 Orchestrator 或 LangGraph。当前 KnowledgeSearchApp 仍是普通查询服务，治理目录允许多状态，不能直接充作该角色的合格材料读取工具。KF-SYS-043 保持 Planned。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。

固定源码 DocGen 样例为 `docGenAgent/examples/DocGenFixedSourceSample.json`，含原始源码、公开接口和追加指令；检查器与四项迁移测试由同一角色目录拥有。统一 agent:run 负责执行和提交，固定参考测试不作为生产角色阶段。
