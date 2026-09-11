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

## 达标结束规则（当前链路已验收，扩展目标保留）

| 编号 | 议题 | 状态 | 记录 |
| --- | --- | --- | --- |
| IO-20 | 达到验收标准后的飞轮行为 | 已确认 | 2026-09-10 用户确认文档达到验收标准后立即结束本次飞轮，不继续迭代以追求更高分，也不等待剩余轮次或预算耗尽。 |

“达标”指完成本次业务验收判定，不等于候选正文结构检查通过或模型自评通过。沿用 [Requirements](../../totalRules/Requirements.md) 的 KF-SYS-005、008、009 和 [UiuxDesign](../../totalRules/UiuxDesign.md) 的 KF-UI-003、006：完成验收后自动结束并交付达标文档，不新增人工确认；达到最大轮次仍未达标或预算耗尽时停止并转人工治理。2026-09-10 用户指出这属于原有设计，不应重复列为待确认。保留历史最佳、关键回归回滚及停滞转 LOW_CONFIDENCE 同样已有目标要求，当前尚未实现的能力应列为实现缺口。具体业务阈值、历史版本评分和可比性细节仍需细化，相似度仅用于归因的既有门禁边界不变。结束后的资料处理遵守 [Knowledge IO-19](../knowledge/Knowledge.md)，达标且最终文档及验收记录保存成功后立即清理中间资料。受控 SDK 两轮验收已确认 PASS 后结束、发布一次、不派发下一轮；最大轮次含首轮，IterationBudget 统一约束入口与继续条件。成本预算、停滞策略、历史最佳回退和自动清理仍未完成。

## 执行与发布边界

Domain 不编译、不运行子进程。Application 请求 ProjectEvaluator，保存报告和决定；基础设施执行可信项目命令并返回证据。publication 由 Application 校验当前版本和 Gate，再由 SQLite 原子写入回执。重复提交同一发布键返回原回执。

测试候选先作为工件保存，oracle_validation 将候选 C/C++ 源码和逐入口清单绑定到场景的原生编译/运行命令，在参考源码上实际校验。通过后按源码内容身份固定，重建评测必须复用同一集合；旧协议、未通过或无法绑定的候选不能进入当前门禁。外部监督器提供逐项完成事实，Domain 不信任模型 stdout 自报成功。完整部署沙箱、mutation 和更广泛的 oracle 质量机制仍未实现；当前参考校验不证明测试断言充分或原实现业务正确。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
