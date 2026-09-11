<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：CodeAgent 的职责、输入输出与确认状态。
-->
# CodeAgent

## 1. 职责与边界

CodeAgent 根据候选知识文档和必要编写配置，重新生成 C/C++ 实现。后面的独立测试用这份实现检查文档能否准确描述业务行为。

Code 看不到原始实现、原仓库的独立接口文件、测试用例和答案，也不会拿到整份项目场景。它返回生成文件，不直接修改业务仓库，不执行发布。

## 2. 输入与输出

| 输入 | 用途 |
| --- | --- |
| 候选知识文档 | 描述需要实现的接口和业务行为 |
| 编写配置 | 语言、标准、依赖声明和编写约束 |
| 允许生成路径 | 限定可以交付哪些文件 |
| 必须重建路径 | 在生产流程中指定一个也不能漏的实现文件 |

知识和配置以内联材料提供，工具仓库视图为空。配置只包含 languageId、standard、dependencies、constraints、allowedGeneratedPaths；编译及运行命令由评测器持有。

输出是 `files: [{ path, content }]`。允许生成的集合可以大于必须重建的集合。独立角色契约允许省略 requiredGeneratedPaths；生产流程必须提供，取 sourcePaths 中不属于 publicInterfacePaths 的实现路径。

## 3. 工作流程

### 接收文档与配置

框架先校验并冻结项目场景，裁剪出 Code 可以看到的编写配置，再加载知识正文。接口必须由文档说明，不能额外提供原仓库接口文件补足信息。

### 生成全新实现

例如，文档要求 calculate() 返回 4，并将实现写入 src/module.cpp。Code 按此描述生成函数；如果文档遗漏边界行为，不能读取原源码补答案，应由后续评测和 Review 发现缺口。

Prompt 要求完整交付规定文件，禁止添加未授权的测试、文档或配置。框架收到结果后检查整组文件，合法结果才成为候选代码。

### 交给独立评测

评测器在独立副本中先删除必须重建范围内的原实现，再写入生成文件，防止漏生成被旧文件补齐。随后使用已固定测试集，按项目配置编译运行。

生成成功只表示拿到了候选代码。知识是否通过仍由评测、Review 和 Gate 决定。

## 4. 关键约束与失败处理

必需材料缺失，在模型调用前失败。只支持 C/C++ 及对应语言标准；非法语言、额外配置字段、配置与授权路径不一致均拒绝。

文件内容必须非空，扩展名符合 C/C++ 约定，路径是允许集合内的规范相对路径。绝对路径、路径越界、重复文件、未授权输出，以及遗漏必需文件都会失败。

输入、动态 Schema 与 Domain 校验共同限制输出；Prompt 之外的实际读取控制见 [Workspace](../../workspace/Workspace.md)。旧执行版本不兼容时拒绝恢复，其他取消与失败规则见 [Agents](../Agents.md)。

## 5. 验收场景

- **材料不泄露答案。** 场景带有原源码、接口路径和测试配置时，检查模型实际收到的材料与读取范围：只有知识和裁剪配置，不能出现参考实现或测试答案。
- **拒绝不完整交付。** 合法文件可接受；增加越权路径、重复文件或漏一个必须重建的文件，均拒绝，流程不得发布。
- **检查配置。** 输入不支持的语言或不一致的输出范围时失败；完整场景中的构建命令不能进入模型配置。
- **真实编译与评测。** 正常输出交给执行器编译；文档写错导致重建行为错误时评测失败，文档修订后再重建、再评测。

材料裁剪和文件校验已有角色回归，完整流程已有受控 C/C++ 编译证据。真实模型的代码质量及完整部署隔离仍需单独验收。

## 6. 未实现与待定事项

场景冻结和配置裁剪已实现；独立项目配置文件及其版本管理尚未实现，仍保留为目标。详细配置边界见 [Application](../../../application/Application.md)。

公司 CodeAgent CLI 是另一项适配工作，当前同名角色的实现不代表已接入该 CLI。

## 7. 实现及测试索引

角色 ID：`code`，readablePaths 为空。规则对应：文档及接口输入为 IO-03；材料和输出范围为 IO-04；C/C++ 目标为 IO-05；配置管理为 IO-06，独立配置版本管理目标为 KF-SYS-044。

- 漏文件等失败流程：[AgentSpecRegression.test.mjs](../../../../../tests/integration/AgentSpecRegression.test.mjs)。
- 两轮重建与独立评测：[AgentRevisionFlow.test.ts](../../../../../tests/acceptance/AgentRevisionFlow.test.ts)。

代码位置：[执行入口](../../../../../src/domain/agents/codeAgent/CodeAgent.ts)、[输入输出契约](../../../../../src/domain/agents/codeAgent/CodeAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/codeAgent/CodeAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/codeAgent/CodeAgent.test.ts)、[独立样例](../../../../../src/domain/agents/codeAgent/examples/CodeAgentSample.json)。
