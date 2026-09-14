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

## 知识风险的证据复核（执行版本 v4）

代码：[KnowledgeRisks.ts](../../../../src/domain/knowledge/KnowledgeRisks.ts)。`seven-role-mvp-v4` 禁止旧 v3 检查点恢复；历史输出和失败记录继续可读，不重判旧门禁。`knowledge-risk-v1` 原始记录包含稳定 riskId、来源工件、种类与声明；`knowledge-risk-assessment-v1` 工件绑定 runId、versionId、iteration 和每项证据。报告独立使用 knowledgeRiskBlocking，原因 KNOWLEDGE_RISK_UNRESOLVED，不再混入 CHECK_BLOCKING。

普通 unresolvedRisks 是任意缺证据声明，始终 OPEN，不能靠 Review PASS、字符串分类或测试总分自动关闭。DocWorker 可以另外声明 verificationNeeds 的三个预定义编号；编号不接受自定义描述，由 Domain 生成精确范围声明：MODULE_BEHAVIOR_TESTS 只要求当前版本固定与晋升案例全部通过；SYSTEM_INTEGRATION 与 OUTSIDE_PUBLIC_TYPES 只在冻结 moduleContract 限定独立模块公开类型验收时记 OUT_OF_SCOPE，仍保留未验证限制。不能用预定义事项替换具体源码缺失、未知行为或安全缺陷。

Domain 按 Application 绑定的冻结场景与本轮可信评测逐项形成 OPEN / VERIFIED / OUT_OF_SCOPE。只有完整、非空、无基础设施失败、稳定性为 1 的通过评测能验证 MODULE_BEHAVIOR_TESTS；不声称覆盖所有输入。没有模块契约或证据不足保持 OPEN；未知种类和篡改的声明不能通过。每轮重新评估，不沿用上一版本的通过。原始记录不删除、不修改，处置工件作为门禁 evidenceRefs 保存，可从 Console 评测证据下载；页面独立显示知识风险原因。

本版普通自由文本缺证据风险尚不支持自动解除，需要补充材料后重新提取事实；不提供任意风险的模型自评清除接口。验收覆盖失败后修订通过且保留逐轮风险审计、未解决风险拒绝、缺少范围证据、跨版本评测不复用及旧版本拒绝恢复。

## 原生声明式行为案例（接入中）

C/C++ 使用版本化 native-cases-v1：有限变量、公开函数调用序列、变量/数组元素/公开字段观察，以及保留在宿主的预期值。模型不能提供测试源码、表达式、执行命令或通过计数。函数、类型和路径来自冻结公开契约；案例必须实际调用所选接口，观察只能引用返回值或参与调用的变量，不能以常量输出冒充行为。整数以十进制字符串保留64位精度，浮点和布尔独立类型；每个案例绑定知识章节，失败供后续修订定位。

受信执行器将用例数据编译为固定harness，源码中不含expected；参考与生成分别构建、独立运行，宿主检查进程结果、协议和精确观察。候选先通过参考，错误候选保留拒绝原因，不晋升、不当作知识错误。可信用例的预期不可修改；缓存必须绑定知识正文、参考源码/接口、策略和工具链摘要。当前正在实现协议与执行器，尚不代表新EVALUATE阶段或真实模型闭环已完成。


NativeInterfaceComparison 对 native-interface-v1 声明进行确定性比较：忽略函数参数名字与类型多余空白，保留返回类型、参数类型、公开字段/枚举值及类成员。ratio 为匹配的唯一参考声明数除以参考声明总数，空参考不通过；此数值不是行为相似度。输出缺失/变化声明和 method 标识，behaviorVerified=false。当前不计算实现结构或规范化源码相似度，调用方必须将其保留为未解决项。

真实TestGen运行暴露重复的顶层JSON括号错误。原生提示明确oracleRequired先于nativeSuite输出，且结构体/数组沿受信harness默认零初始化，字符串参数直接使用string参数而不声明不支持的指针变量。这是对现有native-cases-v1能力的说明，不放宽Schema、oracle或变量类型规则；恢复仍使用原任务累计用量。

原生 TestGen 的 Schema 按 oracleRequired、nativeSuite 顺序序列化，与提示词保持一致；仅调整字段展示次序，必填与参考验证规则不变。真实第四次仍出现顶层闭合错误，未晋升候选。

候选参考拒绝后的恢复，将同阶段、同模块最近一次拒绝的输入、预期与结构化参考观察作为 rejectedCandidate 提供给 TestGen。只传用例数据，不传参考正文、编译日志或生成实现。该材料明确为未可信，重新提出的候选仍须独立参考验证；已有可信测试及预期不可改写。

生成代码编译拒绝与资源中断由 NativeCodeRepair 区分：仅非超时、非输出超限、明确退出码1且无已知资源故障的生成接口编译失败允许重新提出代码。修复材料限定原生成文件及其诊断；不证明知识错误，不修改可信测试，也不向 Code 暴露参考实现。恢复复用同阶段输入与累计用量，资源暂停保留原 Code 结果。没有明确编译错误证据时不能用重新生成掩盖执行器或环境问题。

原生 TestGen 指令显式展示重载参数的类型变量、数组衰减为指针的 read 访问及独立返回值变量。TinyXML2 真实候选曾将输出参数当作返回值、对整个数组取地址而无法匹配函数；这类候选问题必须由参考验证拒绝并反馈，不自动修订知识。

已拒绝候选的构建反馈可由Domain从原始DSL推导具体调用/实参位置及数组整体取地址的类型语义，Application随原始候选交TestGen。提示不读取编译器stderr或参考正文，不自动重写候选，不认定知识错误；没有参数表示的调用保持未覆盖，不能用布尔值假冒空指针。

可信门禁继承契约 `native-trusted-gates-v1`：同一稳定卡片集合的所有历史可信套件形成门禁并集，不能因源码、工具链或策略摘要变化而消失。仅完全相同的用例内容去重；同名不同用例保留并给确定性别名，不合并或改写预期。缓存绑定并集摘要，旧缓存不能跳过后来建立的门禁。公开接口变化且无法证明旧套件仍适用时明确暂停，不能自动丢弃旧用例或由模型重写。超出协议用例上限时同样显式停止。已有可信用例在新参考上失败属于可信门禁冲突，不是可重新生成的候选错误。旧记录保持不可变，新记录记录继承套件编号。
