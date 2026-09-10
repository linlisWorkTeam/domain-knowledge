<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：CodeAgent 的职责、输入输出与确认状态。
-->
# CodeAgent：代码生成

代码位置：[执行入口](../../../../../src/domain/agents/codeAgent/CodeAgent.ts)、[输入输出契约](../../../../../src/domain/agents/codeAgent/CodeAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/codeAgent/CodeAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/codeAgent/CodeAgent.test.ts)、[独立样例](../../../../../src/domain/agents/codeAgent/examples/CodeAgentSample.json)。

角色 ID：`code`。共同执行、失败和交接协议见 [Agents](../Agents.md)。

## 输入输出确认记录

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-03 | CodeAgent 的主要业务输入及公开接口来源 | 已实现，待业务验收 | 主要业务输入是知识卡片，公开接口资料包含在卡片中，不单独传入接口材料，也不通过额外读取原仓库接口文件补充。publicInterfaceRefs 与接口文件读取授权已移除；本轮已同步实现。 |
| IO-04 | CodeAgent 的其他输入与执行权限 | 已实现，待业务验收 | 接收项目配置中影响代码编写的语言、依赖约束和允许生成路径；框架冻结本轮可读文件白名单与输出位置，以受限工具和进程隔离落实。CodeAgent 返回文件列表，由框架校验并落盘，不直接写业务仓库。 |
| IO-05 | CodeAgent 的目标语言 | 已实现，待业务验收 | 用户业务代码为 C/C++，生成代码的目标语言限定为 C/C++。具体标准、依赖与工具链由项目/场景配置指定；现有 TypeScript 开发样例不能作为目标业务语言已适配的证据。 |
| IO-06 | 依赖与构建说明的存放边界 | 已实现，待业务验收 | 不放入知识卡片。框架侧按业务项目管理项目配置，场景引用对应配置版本；角色只获得必要部分，完整构建配置交编译、评测执行器。切换项目选择另一份配置，运行中使用已冻结版本。 |

## 当前输入输出

IO-03～06 已实现。CodeAgent 的模型输入仅为 `knowledgeRef`、`projectConfigurationRef`、`languageId` 和 `allowedGeneratedPaths`。知识正文包含接口说明；裁剪配置只含 languageId、standard、dependencies、constraints、allowedGeneratedPaths。完整 scenario、源码快照、独立接口和测试材料不会进入 Code 的 Prompt。

角色声明 `readablePaths: []`，生产 Adapter 为其创建空的仓库文件视图，知识与配置通过内联工件提供；DSH 继续使用已有受限工具及进程隔离。框架冻结场景和配置摘要，恢复不兼容的旧角色执行版本会明确失败。

输出为 `files: [{ path, content }]`。动态 Schema 和 Domain 校验拒绝白名单外、非规范相对路径、重复文件、非 C/C++ 扩展名和空内容。框架把文件写入独立评测副本，随后使用固定测试集编译、运行。Code 不直接修改业务仓库。

项目场景通过 `agentConfiguration` 配置 C/C++ 标准、依赖声明、编写约束与测试路径；完整编译命令留在 referenceCommands / finalCommands 中。当前支持 `gcc`、`g++` 和工作区内的 `binary` 执行入口。配置示例与冻结方式见 [Application](../../../application/Application.md)，读取边界见 [Workspace](../../workspace/Workspace.md)。

## 验证与边界

角色测试覆盖知识与配置的可见范围、空仓库读取授权、语言与路径拒绝。C++ 全链路回归用真实 g++ 编译两轮生成实现，覆盖失败后的知识修订与再次测评；原生 DSH SDK 的受控 HTTP 测试覆盖实际 Adapter 接线。受控模型输出不证明真实业务模型的生成质量，S3 / S4 的外部模型与公司 CLI 验收仍单独进行。
