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
| IO-03 | CodeAgent 的主要业务输入及公开接口来源 | 已确认（待实现） | 主要业务输入是知识卡片，公开接口资料包含在卡片中，不单独传入接口材料，也不通过额外读取原仓库接口文件补充。现有 publicInterfaceRefs 与接口文件读取授权需要在实现阶段同步调整；本次只记录目标。 |
| IO-04 | CodeAgent 的其他输入与执行权限 | 已确认（待实现） | 接收项目配置中影响代码编写的语言、依赖约束和允许生成路径；框架冻结本轮可读文件白名单与输出位置，以受限工具和进程隔离落实。CodeAgent 返回文件列表，由框架校验并落盘，不直接写业务仓库。 |
| IO-05 | CodeAgent 的目标语言 | 已确认（待实现与验收） | 用户业务代码为 C/C++，生成代码的目标语言限定为 C/C++。具体标准、依赖与工具链由项目/场景配置指定；现有 TypeScript 开发样例不能作为目标业务语言已适配的证据。 |
| IO-06 | 依赖与构建说明的存放边界 | 已确认（待实现） | 不放入知识卡片。框架侧按业务项目管理项目配置，场景引用对应配置版本；角色只获得必要部分，完整构建配置交编译、评测执行器。切换项目选择另一份配置，运行中使用已冻结版本。 |

## 目标输入输出（已确认，待实现）

本节是 2026-09-10 用户确认的目标，关联 KF-SYS-003、044、045；旧代码差异见下方当前实现章节。[TestGen 的 IO-02](../testGenAgent/TestGenAgent.md) 已另行确认以源代码为输入、不读取知识卡片；IO-12 暂时保留在原始源码上校验生成测试，IO-13 已确认源代码不变时复用已有测试，IO-21 已确认首次候选失败时有限修复、仍失败转人工，仅作为兜底；具体接线待实现。

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

业务知识不足时应由后续检查、评测向知识生成环节反馈，不能通过开放原仓库读取来补答案。完整构建命令和参考测试交执行器，CodeAgent 不负责执行编译、评测或发布。可读路径、隔离及输出落盘规则见 [Workspace](../../workspace/Workspace.md)，配置归属和版本冻结见 [Application](../../../application/Application.md)。

实施时需要同步修改 CodeAgent 的 Payload、Prompt、材料加载、读取授权、Schema 和样例：移除独立 `publicInterfaceRefs` 及其文件授权，不再把整份 `scenarioRef` 当作 `buildContractRef` 传入；保留输出路径校验。具体机器字段和配置加载入口在实现时落到现有契约，不以本文示例伪称已有配置支持。

## 当前实现与目标差异

当前仍输入知识、独立公开接口、构建契约和允许生成路径；输出 files。动态 Schema 限定路径白名单，语义校验拒绝重复路径，不读取参考源码和门禁测试。读取文件路径仍来自 publicInterfacePaths，Application 仍以 scenarioRef 充当 buildContractRef；目标中的项目配置裁剪、读取白名单和 C/C++ 链路尚待实现。

## 后续实现与验收

对应 S2-05：设计已确认，实现、样例和业务验收待完成。关联 KF-SYS-003、044、045 与 AC-CODE-001、002、AC-CONFIG-001、AC-SEC-001；具体场景及追踪状态见 [Verification](../../../totalRules/Verification.md)。旧 TypeScript 样例不能作为 C/C++ 目标业务已验收的证据。

开发步骤与证据统一记录在 [Status](../../../../Status.md)，独立运行方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。
