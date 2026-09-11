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

## 怎么交付，怎样算失败

Code 返回文件路径和内容，框架检查整组输出，再写入独立评测副本。Code 本身不修改业务仓库。

- 必须生成的文件一个都不能漏；允许生成的文件可以多于必需文件。
- 文件必须位于允许范围，使用规范相对路径，内容非空，扩展名符合 C/C++ 约定。
- 绝对路径、越界、重复文件及未授权输出会被拒绝。
- 评测前删除必须重建范围内的原实现，再写入新文件，防止漏生成的代码被原文件悄悄补上。

后续用已固定的测试集编译、运行这些文件。生成成功只表示拿到了候选代码，是否通过仍由评测和 Gate 决定。

## 已确认的规则与完成情况

| 编号 | 规则 | 当前状态 |
| --- | --- | --- |
| IO-03 | 主要输入是知识文档，接口也写在文档里 | 已实现 |
| IO-04 | 接收必要配置，读取和输出范围由框架限制 | 已实现；完整部署隔离另行验收 |
| IO-05 | 当前业务目标语言为 C/C++ | 已有角色和真实编译回归；真实模型质量待验收 |
| IO-06 | 依赖和构建说明由项目配置管理，不塞进知识文档 | 场景冻结和材料裁剪已实现；独立项目配置文件及版本管理（KF-SYS-044）仍未完成 |

已有测试验证材料裁剪、输出路径、漏文件拒绝，以及两轮重建和评测。公司 CodeAgent CLI 是另一项适配工作，不能把当前名为 CodeAgent 的角色当作已接入公司 CLI。

<details>
<summary>开发对照：字段、权限和提示词</summary>

角色 ID 为 `code`。输入为 knowledgeRef、projectConfigurationRef、languageId、allowedGeneratedPaths；生产工作流还提供 requiredGeneratedPaths。独立角色契约允许省略最后一项，生产值取 sourcePaths 中不属于 publicInterfacePaths 的实现路径。

裁剪后的配置只允许 languageId、standard、dependencies、constraints、allowedGeneratedPaths。场景的 agentConfiguration 经校验并冻结；referenceCommands/finalCommands 由执行器使用，详细配置见 [Application](../../../application/Application.md)。

模型输出 `files: [{ path, content }]`。角色 `readablePaths: []`，知识和配置以内联材料提供，Adapter 创建空的仓库文件视图。输入、动态 Schema 和 Domain 校验共同检查范围、语言、配置、重复路径及必需重建文件；旧执行版本不兼容时拒绝恢复。

Prompt 要求按文档生成全新实现、完整返回规定文件，并禁止读取参考源码或门禁答案、添加未授权测试/文档/配置。提示词以外的读取控制见 [Workspace](../../workspace/Workspace.md)；通用执行规则见 [Agents](../Agents.md)。

</details>

## 代码与样例

代码位置：[执行入口](../../../../../src/domain/agents/codeAgent/CodeAgent.ts)、[输入输出契约](../../../../../src/domain/agents/codeAgent/CodeAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/codeAgent/CodeAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/codeAgent/CodeAgent.test.ts)、[独立样例](../../../../../src/domain/agents/codeAgent/examples/CodeAgentSample.json)。
