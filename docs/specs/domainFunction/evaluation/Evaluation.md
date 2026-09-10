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

## 达标结束规则（已确认，待验收）

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-20 | 达到验收标准后的飞轮行为 | 已确认 | 2026-09-10 用户确认文档达到验收标准后立即结束本次飞轮，不继续迭代以追求更高分，也不等待剩余轮次或预算耗尽。 |

“达标”指完成本次业务验收判定，不等于候选正文结构检查通过或模型自评通过。沿用 [Requirements](../../totalRules/Requirements.md) 的 KF-SYS-005、008、009 和 [UiuxDesign](../../totalRules/UiuxDesign.md) 的 KF-UI-003、006：完成验收后自动结束并交付达标文档，不新增人工确认；达到最大轮次仍未达标或预算耗尽时停止并转人工治理。2026-09-10 用户指出这属于原有设计，不应重复列为待确认。保留历史最佳、关键回归回滚及停滞转 LOW_CONFIDENCE 同样已有目标要求，当前尚未实现的能力应列为实现缺口。具体业务阈值、历史版本评分和可比性细节仍需细化，相似度仅用于归因的既有门禁边界不变。结束后的资料处理遵守 [Knowledge IO-19](../knowledge/Knowledge.md)，达标且最终文档及验收记录保存成功后立即清理中间资料。本次只更新设计；验收需确认达标后不会派发下一轮生成任务。

## 执行与发布边界

Domain 不编译、不运行子进程。Application 请求 ProjectEvaluator，保存报告和决定；基础设施执行可信项目命令并返回证据。publication 由 Application 校验当前版本和 Gate，再由 SQLite 原子写入回执。重复提交同一发布键返回原回执。

测试候选先作为工件保存，当前 oracle_validation 使用场景声明的参考检查，不等于任意 LLM 候选已经被纳入门禁。C++ 沙箱、mutation 与完整 oracle 晋升仍属于未实现扩展。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
