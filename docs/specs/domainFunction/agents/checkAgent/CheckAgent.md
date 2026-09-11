<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：CheckAgent 的职责、输入输出与确认状态。
-->
# CheckAgent：只读检查

代码位置：[执行入口](../../../../../src/domain/agents/checkAgent/CheckAgent.ts)、[输入输出契约](../../../../../src/domain/agents/checkAgent/CheckAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/checkAgent/CheckAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/checkAgent/CheckAgent.test.ts)、[独立样例](../../../../../src/domain/agents/checkAgent/examples/CheckAgentSample.json)。

角色 ID：`check`。共同执行、失败和交接协议见 [Agents](../Agents.md)。

## 输入输出确认记录

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-14 | CheckAgent 输入与比较依据 | 输入范围已确认；规则与算法待论文调研 | 2026-09-10 用户确认输入为原始源码、CodeAgent 生成的临时代码和比较规则。原始源码作为比较基准，临时代码作为待检查对象，规则规定比较范围及关注的差异；具体规则和相似度算法待论文调研后确定。 |
| IO-15 | Check 输出及评测、Review 的结果交接 | 已实现，待业务验收 | 2026-09-10 用户确认 Check 输出比较结果及差异依据，评测负责输出测试结果，之后 Review 同时读取两者，分析知识卡片需要修订的位置。保持 Check 后进入评测、再到 Review 的流程，不将差异结果误作测试执行指令。 |

## 当前输入输出

IO-14、15 的契约和交接已实现。输入为 `sourceSnapshotRef`、`generatedCodeRef`、`comparisonRulesRef`。原始源码通过固定提交的源码/接口文件白名单只读访问，生成实现通过内联工件提供。比较规则来自场景 `comparisonRules: [{ id, description }]`。

模型输出：

- `scope`：实际生成文件的完整路径集合。
- `findings`：每项包含 ruleId、sourcePath、path、original、generated、message、severity（BLOCKER / INFO）。original 和 generated 是对应的原文片段。
- `blocking`：必须与 findings 中是否存在 BLOCKER 一致。

Domain 校验范围覆盖全部生成文件、每项 ruleId 来自配置、sourcePath 属于授权源码/接口范围，path 属于生成文件；original 必须出现在冻结源码清单对应文件的正文中，generated 必须出现在对应生成文件中。片段存在性由代码核验，差异是否具有所述业务含义仍需模型判断，不等于 AST 等价证明。结果信封将每项独立映射到 findingId、severity、criterionId、evidenceLocation 和说明，保留原始结构化输出引用。

Application 将真实 Check 原始报告作为 Review 的 `comparisonReportRef`，与测评报告一起加载。评测器运行配置指定的命令；Gate 继续读取 check.blocking。

## 延后事项与验证

相似度算法、评分、权重和阈值仍属下一版本研究范围。当前不内置这些判据；规则为空、内容为空或标识重复时，在模型调用前以 CHECK_RULES_REQUIRED 拒绝，不能把缺配置当作无差异。只有提供合法规则并完成比较后，才允许返回空 findings。

角色回归覆盖规则伪造、生成片段伪造、越界位置和 blocking 不一致。完整 C++ 流程验证 Check 报告进入 Review，报告引用进入最终 Gate 输入。

## 本轮缺口修复验收

比较规则必须非空且标识唯一；缺少配置必须停止，不能返回无差异。original 和 generated 证据都必须在冻结原文及生成文件中核验。
