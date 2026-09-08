<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：确定性评测判定设计。
-->
# 确定性评测判定设计

代码位置：[src/domain/services/EvalRunnerDomainService.ts](../../../../src/domain/services/EvalRunnerDomainService.ts)、[src/domain/Domain.ts](../../../../src/domain/Domain.ts)。


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

测试候选先作为工件保存，当前 oracle_validation 使用场景声明的参考检查，不等于任意 LLM 候选已经被纳入门禁。C++ 沙箱、mutation 与完整 oracle 晋升仍属于未实现扩展。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
