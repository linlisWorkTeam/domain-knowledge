<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：TestGenAgent 的职责、输入输出与确认状态。
-->
# TestGenAgent：测试生成

代码位置：[执行入口](../../../../../src/domain/agents/testGenAgent/TestGenAgent.ts)、[输入输出契约](../../../../../src/domain/agents/testGenAgent/TestGenAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/testGenAgent/TestGenAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/testGenAgent/TestGenAgent.test.ts)、[独立样例](../../../../../src/domain/agents/testGenAgent/examples/TestGenAgentSample.json)。

角色 ID：`test-gen`。共同执行、失败和交接协议见 [Agents](../Agents.md)。

## 输入输出确认记录

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-02 | TestGen 的输入与测试预期依据 | 确认中 | 现有设计输入固定源码、公开接口、语言和测试策略，不读取候选知识；用户业务描述为根据知识卡片生成测试。尚未决定最终输入及测试预期依据，用户要求先记录并继续下一问题。知识不变时复用已有用例的规则也需后续单独确认。 |

用户描述的目标是根据知识卡片生成测试；现有实现依据原始源码生成测试。两者仍有冲突，尚未确认读取原始源码的权限、测试预期结果的依据以及知识不变时复用已有用例的规则。讨论中的建议不作为已接受的契约，也不据此修改代码。

## 职责与当前输入输出

| 边界 | 当前实现 |
| --- | --- |
| 输入 | 模块标识 `moduleId`、固定源码 `sourceSnapshotRef`、公开接口 `publicInterfaceRefs`、语言 `languageId`、测试策略 `testPolicyRef` |
| 可读材料 | 源码及公开接口路径；不接收候选知识 |
| 模型输出 | 候选命令 `candidateCommands`、是否需要参考判定依据的声明 `oracleRequired` |
| 交接输出 | `resultKind: testCandidates`，候选集合 `candidateSetRef`、用例清单 `caseManifestRef` 和 `oracleClaims`；前两者当前均引用 raw 输出 |
| 当前限制 | 候选命令尚未接入正式门禁；不能把生成测试候选视为测试已经执行或通过 |

## 待确认与验收重点

对应 S2-04：先完成 IO-02，再确认输出究竟包含哪些测试文件、用例描述和执行信息，以及复用条件、测试执行和门禁接线。此处列出待讨论事项，不预设答案。执行与可信判定边界见 [Workflow](../../workflow/Workflow.md) 和 [Evaluation](../../evaluation/Evaluation.md)。

开发步骤与证据统一记录在 [Status](../../../../Status.md)，独立运行方法见 [AgentDevelopment](../../../../AgentDevelopment.md)。
