<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：CodeAgent 的职责、输入输出与确认状态。
-->
# CodeAgent：只看文档，重新写出实现

CodeAgent 用候选知识文档和必要的编写配置，生成一份新的 C/C++ 实现。这样，后面的测试才能检查文档是否足以描述原来的业务行为。

## 它能看到什么

知识文档要包含需要实现的接口和行为。框架另给语言标准、依赖声明、编写约束，以及允许生成的文件路径。

Code 看不到原始实现、原仓库的独立接口文件、测试用例或测试答案，也不会拿到整份项目场景。项目编译命令和完整运行配置交给评测器。

例如，文档说“calculate() 返回 4”，并要求生成 `src/module.cpp`。Code 根据这份说明写函数；如果文档漏写了边界行为，Code 不能去偷看原实现补答案。是否漏写，需要后面的评测和 Review 发现。

## 开发规则与验收

### IO-03 / IO-04：只凭文档与必要配置重建

| 项目 | 约定 |
| --- | --- |
| 前提 | 候选文档已包含接口和行为；框架已裁剪编写配置。 |
| 行为 | 框架只提供知识正文、语言标准、依赖声明、编写约束和输出范围，工具仓库视图为空。Code 根据这些材料实现，不读取原实现、独立接口、测试及答案。 |
| 结果 | 生成的实现可用于检验文档是否足以重建行为。缺少必需材料在模型调用前失败，不能扩大读取范围补材料。 |
| 验收 | 在场景中放入原源码和测试答案，检查模型实际收到的 Prompt、配置和读取范围，均不得带入这些内容；缺知识引用须在模型执行前失败。见 [角色测试](../../../../../src/domain/agents/codeAgent/CodeAgent.test.ts)。 |
| 状态 | 已实现，有材料裁剪回归；完整部署隔离另行验收。 |

### IO-04 / IO-05：完整交付规定的 C/C++ 文件

| 项目 | 约定 |
| --- | --- |
| 前提 | 配置给出允许生成路径；生产工作流另给必须重建的实现路径。 |
| 行为 | Code 返回路径和非空源码。框架校验语言、相对路径、授权、重复及必需文件；评测器先删除必须重建的原实现，再写入生成文件。 |
| 结果 | 合法输出成为候选代码；漏必需文件、越界或重复输出均失败，不能用残留原实现补齐，也不能凭生成成功发布。 |
| 验收 | 合法文件通过；增加越权路径、重复同一路径或漏一个必需文件必须拒绝。流程中漏重建文件不得发布；正常输出交真实编译与评测。见 [角色测试](../../../../../src/domain/agents/codeAgent/CodeAgent.test.ts) 和 [AgentSpecRegression.test.mjs](../../../../../tests/integration/AgentSpecRegression.test.mjs)、[AgentRevisionFlow.test.ts](../../../../../tests/acceptance/AgentRevisionFlow.test.ts)。 |
| 状态 | 已实现，有角色、失败流程和受控 C/C++ 编译回归；真实模型重建质量待验收。 |

### IO-06：编写配置与评测命令分开提供

| 项目 | 约定 |
| --- | --- |
| 前提 | 项目场景包含 Agent 编写配置及参考/最终评测命令。 |
| 行为 | 框架校验并冻结场景，仅把编写配置交给 Code；完整构建、运行命令由评测器读取。 |
| 结果 | Code 输入不含整份场景或测试命令；非法语言、配置字段或不一致的输出范围被拒绝。 |
| 验收 | 提供含构建命令的完整场景，模型只应收到契约允许的配置字段；语言与输出范围不一致时拒绝。见 [角色测试](../../../../../src/domain/agents/codeAgent/CodeAgent.test.ts)。 |
| 状态 | 场景冻结和配置裁剪已实现；独立项目配置文件及版本管理（KF-SYS-044）尚未实现，继续保留。 |

公司 CodeAgent CLI 属于另一项适配工作，当前角色实现不代表已接入该 CLI。

<details>
<summary>开发对照：字段、权限和提示词</summary>

角色 ID 为 `code`。输入为 knowledgeRef、projectConfigurationRef、languageId、allowedGeneratedPaths；生产工作流还提供 requiredGeneratedPaths。独立角色契约允许省略最后一项，生产值取 sourcePaths 中不属于 publicInterfacePaths 的实现路径。

裁剪后的配置只允许 languageId、standard、dependencies、constraints、allowedGeneratedPaths。场景的 agentConfiguration 经校验并冻结；referenceCommands/finalCommands 由执行器使用，详细配置见 [Application](../../../application/Application.md)。

模型输出 `files: [{ path, content }]`。角色 `readablePaths: []`，知识和配置以内联材料提供，Adapter 创建空的仓库文件视图。输入、动态 Schema 和 Domain 校验共同检查范围、语言、配置、重复路径及必需重建文件；旧执行版本不兼容时拒绝恢复。

Prompt 要求按文档生成全新实现、完整返回规定文件，并禁止读取参考源码或门禁答案、添加未授权测试/文档/配置。提示词以外的读取控制见 [Workspace](../../workspace/Workspace.md)；通用执行规则见 [Agents](../Agents.md)。

</details>

## 代码与样例

代码位置：[执行入口](../../../../../src/domain/agents/codeAgent/CodeAgent.ts)、[输入输出契约](../../../../../src/domain/agents/codeAgent/CodeAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/codeAgent/CodeAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/codeAgent/CodeAgent.test.ts)、[独立样例](../../../../../src/domain/agents/codeAgent/examples/CodeAgentSample.json)。
