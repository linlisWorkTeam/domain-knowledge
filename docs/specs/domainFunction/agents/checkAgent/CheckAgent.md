<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：CheckAgent 的职责、输入输出与确认状态。
-->
# CheckAgent：找出新旧代码中需要关注的差异

Check 按项目提供的比较规则，阅读原始源码和 Code 生成的实现，指出有依据的差异。它只读代码，不修改实现，也不运行测试。

## 比较什么，交付什么

输入是原始源码、生成代码和比较规则。例如规则要求检查公开函数的返回行为：原始代码是 `return 4;`，生成代码是 `return 3;`，Check 应指出对应文件、两段原文和为什么需要关注。

每条差异要能回答：用了哪条规则、两边代码在哪里、具体差在哪里、是否阻塞通过。没有发现差异时可以返回空列表，但必须先拿到合法规则并完成比较。

## 开发规则与验收

### IO-14：比较前必须有明确规则

| 项目 | 约定 |
| --- | --- |
| 前提 | 原始源码和生成代码已冻结，项目提供带唯一编号和非空说明的比较规则。 |
| 行为 | 框架先校验材料与规则；Check 只读双方代码，按提供的规则报告差异，不改代码、不执行测试。 |
| 结果 | 合法输入进入比较；缺规则、空规则说明或重复编号在模型调用前失败，不能自行发明规则继续。 |
| 验收 | 给出返回行为规则时可比较；删除规则后模型不得执行，工作流不得发布。见 [角色测试](../../../../../src/domain/agents/checkAgent/CheckAgent.test.ts) 和 [AgentSpecRegression.test.mjs](../../../../../tests/integration/AgentSpecRegression.test.mjs)。 |
| 状态 | 已实现，有输入校验及流程回归；规则对真实业务是否充分需另行验收。 |

### IO-15：差异必须有双方原文依据

| 项目 | 约定 |
| --- | --- |
| 前提 | 模型已收到本轮全部生成文件、授权原源码和规则。 |
| 行为 | Check 交付完整比较范围及差异列表；框架核对每条规则、双方路径和原文，并检查 blocking 与是否存在 BLOCKER 一致。 |
| 结果 | 合法报告保存并交给 Review 和 Gate；无差异可为空列表。漏覆盖、伪造片段或阻塞标记矛盾均拒绝；报告不能代替实际测试结果。 |
| 验收 | 原实现 return 4、新实现 return 3 时可引用这两段原文；改为不存在的原文、未授权规则、漏一个生成文件或矛盾的 blocking，均须拒绝。见 [角色测试](../../../../../src/domain/agents/checkAgent/CheckAgent.test.ts) 和 [AgentSpecRegression.test.mjs](../../../../../tests/integration/AgentSpecRegression.test.mjs)。 |
| 状态 | 结构、依据和交接已实现；引用存在不证明模型对差异的业务解释正确。 |

## 保留的目标

相似度算法、评分、权重和阈值按 2026-09-10 的决定留待研究；尚未实现，也没有已确认的量化验收阈值。不能在实现或验收中自行填一个分数作为发布依据。

<details>
<summary>开发对照：报告字段和提示词</summary>

角色 ID 为 `check`。输入为 sourceSnapshotRef、generatedCodeRef、comparisonRulesRef；规则来自场景 `comparisonRules: [{ id, description }]`。原源码及接口按固定提交的白名单提供，生成文件以内联材料提供。

输出包括 scope、findings、blocking。scope 必须列全生成文件；每条 finding 包含 ruleId、sourcePath、path、original、generated、message、severity。severity 为 BLOCKER 或 INFO；blocking 必须等于是否存在 BLOCKER。

缺规则时抛出 CHECK_RULES_REQUIRED；非法范围、证据和阻塞标记分别拒绝。结果保存原始结构化报告，并映射为 findingId、severity、criterionId、evidenceLocation 和说明。Application 把真实原始报告作为 Review 的 comparisonReportRef，Gate 读取 check.blocking。

Prompt 要求只读、按规则比较并引用两边原文，禁止虚构算法和阈值。共同执行约定见 [Agents](../Agents.md)。

</details>

## 代码与样例

代码位置：[执行入口](../../../../../src/domain/agents/checkAgent/CheckAgent.ts)、[输入输出契约](../../../../../src/domain/agents/checkAgent/CheckAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/checkAgent/CheckAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/checkAgent/CheckAgent.test.ts)、[独立样例](../../../../../src/domain/agents/checkAgent/examples/CheckAgentSample.json)。
