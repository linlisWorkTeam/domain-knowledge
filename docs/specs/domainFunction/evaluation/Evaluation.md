<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：确定性评测判定设计。
-->
# 确定性评测判定设计

代码位置：[src/domain/evaluation/EvalRunnerDomainService.ts](../../../../src/domain/evaluation/EvalRunnerDomainService.ts)、[src/domain/Domain.ts](../../../../src/domain/Domain.ts)。


## 输入与判定顺序

输入为同一 Run 的 EvaluationReport、GatePolicy 和当前时间，先校验报告 runId 一致。报告包含测试计数、criticalFailures、stability、Check / Review 阻塞、基础设施失败和 evidenceRefs。

| 事实 | 结果 |
| --- | --- |
| infrastructureFailure | STOPPED，记录 INFRASTRUCTURE_FAILURE |
| checkBlocking / reviewBlocking | 未达到最大轮次则 ITERATE，否则 STOPPED |
| criticalFailures > 0 | 同上，记录 CRITICAL_TEST_FAILURE |
| requireAllTests 且通过数不等于总数 | 同上，记录 TESTS_INCOMPLETE |
| stability 低于 minimumStability | 同上，记录 STABILITY_BELOW_THRESHOLD |
| 无阻塞 | PASS，记录 ALL_DETERMINISTIC_GATES_PASSED |

STOPPED 优先保留，多原因去重后形成 GateDecision。相似度、模型自评分和自然语言“通过”不能覆盖这些条件。当前输出只有 PASS / ITERATE / STOPPED，没有自动 rollback。

## 执行与发布边界

Domain 不编译、不运行子进程。Application 请求 ProjectEvaluator，保存报告和决定；基础设施执行可信项目命令并返回证据。publication 由 Application 校验当前版本和 Gate，再由 SQLite 原子写入回执。重复提交同一发布键返回原回执。

独立模块场景中，测试候选以 `module-cases-v1` 保存，包含案例说明、参数和预期 JSON 值。`oracle_validation` 先在固定提交参考实现验证候选，全案通过才允许追加到生成实现评测。固定隐藏门禁在生成前冻结，候选不得替换它；旧候选命令只保持可读，不能被执行或宣称已通过 oracle。C++ 沙箱、mutation 与任意项目工具链仍属于未实现扩展。

Check 阻塞必须带判据编号、生成文件路径和合法行号证据；Review 将纠正意见绑定本轮评测与 Check 工件，定位 `knowledge/<moduleId>.md#<已有H2>`。无法定位的原因保留为 unresolvedRisks，不猜测修订范围。PASS 不能同时带阻塞、纠正意见或未解决风险。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。


## 知识风险的证据复核（执行版本 v4）

代码：[KnowledgeRisks.ts](../../../../src/domain/knowledgeRisks/KnowledgeRisks.ts)。`seven-role-mvp-v4` 禁止旧 v3 检查点恢复；历史输出和失败记录继续可读，不重判旧门禁。`knowledge-risk-v1` 原始记录包含稳定 riskId、来源工件、种类与声明；`knowledge-risk-assessment-v1` 工件绑定 runId、versionId、iteration 和每项证据。报告独立使用 knowledgeRiskBlocking，原因 KNOWLEDGE_RISK_UNRESOLVED，不再混入 CHECK_BLOCKING。

普通 unresolvedRisks 是任意缺证据声明，始终 OPEN，不能靠 Review PASS、字符串分类或测试总分自动关闭。DocWorker 可以另外声明 verificationNeeds 的三个预定义编号；编号不接受自定义描述，由 Domain 生成精确范围声明：MODULE_BEHAVIOR_TESTS 只要求当前版本固定与晋升案例全部通过；SYSTEM_INTEGRATION 与 OUTSIDE_PUBLIC_TYPES 只在冻结 moduleContract 限定独立模块公开类型验收时记 OUT_OF_SCOPE，仍保留未验证限制。不能用预定义事项替换具体源码缺失、未知行为或安全缺陷。

Domain 按 Application 绑定的冻结场景与本轮可信评测逐项形成 OPEN / VERIFIED / OUT_OF_SCOPE。只有完整、非空、无基础设施失败、稳定性为 1 的通过评测能验证 MODULE_BEHAVIOR_TESTS；不声称覆盖所有输入。没有模块契约或证据不足保持 OPEN；未知种类和篡改的声明不能通过。每轮重新评估，不沿用上一版本的通过。原始记录不删除、不修改，处置工件作为门禁 evidenceRefs 保存，可从 Console 评测证据下载；页面独立显示知识风险原因。

本版普通自由文本缺证据风险尚不支持自动解除，需要补充材料后重新提取事实；不提供任意风险的模型自评清除接口。验收覆盖失败后修订通过且保留逐轮风险审计、未解决风险拒绝、缺少范围证据、跨版本评测不复用及旧版本拒绝恢复。
