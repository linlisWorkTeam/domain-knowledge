<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：确定性评测判定设计。
-->
# 确定性评测判定设计

代码位置：[src/domain/services/evaluation/EvalRunnerDomainService.ts](../../../../../src/domain/services/evaluation/EvalRunnerDomainService.ts)、[src/domain/Domain.ts](../../../../../src/domain/Domain.ts)。


本服务位于 `services/evaluation`，对外契约为 EvaluationService。既有 `evaluation-agent` 能力 ID 保持不变，但没有对应的生成 Agent。TestGen、Check、Review 提供候选或意见，最终门禁仍由本服务调用共享不变量决定。

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


文档关系：[设计目录](../../../README.md)负责代码与设计定位；[开发指南](../../../../Development.md)说明修改和交付步骤。
