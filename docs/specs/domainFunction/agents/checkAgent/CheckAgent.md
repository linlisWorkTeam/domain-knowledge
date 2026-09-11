<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：CheckAgent 的职责、输入输出与确认状态。
-->
# CheckAgent

## 1. 职责与边界

Check 根据项目给定的规则，比较原始源码与 Code 生成的实现，指出有依据的差异。它只读代码，不修改实现，也不运行测试。

比较报告提供给 Review 分析文档问题，并将阻塞标记交给 Gate。差异报告不能代替实际测试，也不能指定测试执行方式。

## 2. 输入与输出

输入包括固定版本的原始源码、公开接口、全部生成代码及比较规则。原源码按白名单提供，生成文件以内联材料提供；每条规则必须有唯一编号和非空说明。

输出包含比较范围、差异列表和是否阻塞。每条差异说明采用的规则、双方文件位置、两段原文、差异含义及严重程度。没有差异时可以返回空列表，但仍需声明完整比较范围。

## 3. 工作流程

### 检查比较条件

框架先加载 sourceSnapshotRef、generatedCodeRef、comparisonRulesRef 的正文，核对规则有效性。缺少规则时不调用模型，也不让模型自行创造规则继续。

### 按规则比较

例如，规则要求比较公开函数的返回行为，原实现为 return 4，生成实现为 return 3。Check 引用双方实际代码，解释这一差异，并按规则判断它是否阻塞通过。

Prompt 要求只读、使用给定规则并引用双方原文。比较完成后，框架核对覆盖范围、规则编号、位置和片段，拒绝虚构引用。

### 保存和交接报告

框架保存原始结构化报告，并转换为下游需要的差异记录。Check 完成后仍需等待参考测试校验，再进入重建评测。Review 收到真实比较报告正文及评测报告，Gate 使用 check.blocking 参与判定。

## 4. 关键约束与失败处理

规则缺失、说明为空或编号重复时，在模型调用前抛出 CHECK_RULES_REQUIRED。其他必需材料缺失同样提前失败。

scope 必须列全生成文件。每条差异只能引用授权源码、实际生成文件和给定规则；original 与 generated 片段必须分别存在于对应文件中。范围不完整、越界路径、伪造规则或片段均拒绝。

severity 只允许 BLOCKER 或 INFO；blocking 必须与是否存在 BLOCKER 一致，矛盾时拒绝。引用存在只能证明有这段原文，不能证明模型对业务差异的解释正确。共同执行与取消规则见 [Agents](../Agents.md)。

## 5. 验收场景

- **有规则才能比较。** 给定返回行为规则可以执行；删除规则、使用空说明或重复编号，在调用模型前失败，工作流不得发布。
- **差异引用真实原文。** 对 return 4 与 return 3 的比较可以引用对应片段；改为不存在的原文、未授权规则或文件路径，结果拒绝。
- **范围和阻塞一致。** 漏掉一个生成文件，或 findings 有 BLOCKER 而 blocking 为 false，均拒绝。无差异时完整 scope 配合空列表可接受。
- **报告进入后续流程。** Review 收到实际比较报告和独立评测结果，Gate 检查阻塞条件；比较结果不能替换测试结果。

输入校验、原文依据及报告交接已有角色和流程回归。真实业务规则是否充分、模型判断是否准确仍需业务验收。

## 6. 未实现与待定事项

相似度算法、评分、权重和阈值按 2026-09-10 的决定留待研究，尚未实现，也没有已确认的量化验收阈值。实现和评测不能自行给出一个相似度分数作为发布依据。

## 7. 实现及测试索引

角色 ID：`check`。规则对应：输入与比较规则为 IO-14；比较报告交接为 IO-15。

输出字段为 scope、findings、blocking；finding 包含 ruleId、sourcePath、path、original、generated、message、severity。下游记录映射为 findingId、severity、criterionId、evidenceLocation 和说明，原始报告仍完整保存。

- 缺规则、虚构源码及交接回归：[AgentSpecRegression.test.mjs](../../../../../tests/integration/AgentSpecRegression.test.mjs)。
- 比较与 Review 的完整流程：[AgentRevisionFlow.test.ts](../../../../../tests/acceptance/AgentRevisionFlow.test.ts)。
- 阻塞条件参与 Gate：[Domain.test.ts](../../../../../tests/unit/Domain.test.ts)。

代码位置：[执行入口](../../../../../src/domain/agents/checkAgent/CheckAgent.ts)、[输入输出契约](../../../../../src/domain/agents/checkAgent/CheckAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/checkAgent/CheckAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/checkAgent/CheckAgent.test.ts)、[独立样例](../../../../../src/domain/agents/checkAgent/examples/CheckAgentSample.json)。
