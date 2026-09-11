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

## 框架怎样检查报告

框架要求报告覆盖所有生成文件，并逐条检查规则编号和文件路径。报告引用的原始片段必须在冻结源码中存在，生成片段必须在对应的新文件中存在。

这能拦住虚构的原文引用。至于“这段差异是否真的意味着业务错误”，仍然依赖模型判断，当前没有证明两段程序行为等价的算法。

规则未配置、规则内容为空或编号重复时，在调用模型前就失败。报告范围不完整、引用不存在的片段，或者阻塞标记与差异严重程度不一致时，也会拒绝结果。

## 报告交给谁

Check 完成后，还要等参考测试校验完成，再进入实际评测。Review 同时收到比较报告和评测报告，分析文档需要改哪里。Check 的差异不能代替测试结果，也不能指定测试应该怎样执行。

## 目前做到哪

IO-14 的输入范围及 IO-15 的比较报告交接已实现。测试覆盖缺规则、伪造规则/双方片段、越界位置、覆盖不完整和阻塞标记不一致；完整流程验证报告进入 Review 和 Gate。

具体业务比较规则的适用性仍需验收。相似度算法、评分、权重和阈值按 2026-09-10 的决定留待研究，当前不虚构评分，也不把相似度当发布依据。

<details>
<summary>开发对照：报告字段和提示词</summary>

角色 ID 为 `check`。输入为 sourceSnapshotRef、generatedCodeRef、comparisonRulesRef；规则来自场景 `comparisonRules: [{ id, description }]`。原源码及接口按固定提交的白名单提供，生成文件以内联材料提供。

输出包括 scope、findings、blocking。scope 必须列全生成文件；每条 finding 包含 ruleId、sourcePath、path、original、generated、message、severity。severity 为 BLOCKER 或 INFO；blocking 必须等于是否存在 BLOCKER。

缺规则时抛出 CHECK_RULES_REQUIRED；非法范围、证据和阻塞标记分别拒绝。结果保存原始结构化报告，并映射为 findingId、severity、criterionId、evidenceLocation 和说明。Application 把真实原始报告作为 Review 的 comparisonReportRef，Gate 读取 check.blocking。

Prompt 要求只读、按规则比较并引用两边原文，禁止虚构算法和阈值。共同执行约定见 [Agents](../Agents.md)。

</details>

## 代码与样例

代码位置：[执行入口](../../../../../src/domain/agents/checkAgent/CheckAgent.ts)、[输入输出契约](../../../../../src/domain/agents/checkAgent/CheckAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/checkAgent/CheckAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/checkAgent/CheckAgent.test.ts)、[独立样例](../../../../../src/domain/agents/checkAgent/examples/CheckAgentSample.json)。
