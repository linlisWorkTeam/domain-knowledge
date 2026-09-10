<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：跨角色工作流设计。
-->
# 跨角色工作流设计

代码位置：[src/domain/workflow/Workflow.ts](../../../../src/domain/workflow/Workflow.ts)、[src/domain/workflow/AgentDefinitions.ts](../../../../src/domain/workflow/AgentDefinitions.ts)、[src/application/services/AutomatedProjectWorkflow.ts](../../../../src/application/services/AutomatedProjectWorkflow.ts)。


## 输入、阶段和输出

当前阶段不实现外部知识关联，见 [Association IO-23](../association/Association.md)；不为该功能新增节点或阻塞单文档飞轮交付。该延期不影响 IO-22 已确认的文档描述和渐进加载索引。

输入是 Application 解析并固定的项目场景、材料引用、策略和 workerCount（传给 DocGen 的内部任务数量）。AgentDefinitions 显式绑定业务角色与节点；Workflow 给出固定连接及纯路由函数。角色自己的计划输出不驱动动态建图。

[Orchestrator IO-17](../agents/orchestratorAgent/OrchestratorAgent.md) 已确认的目标是根据业务目标、模块概况、项目配置及任务进度，输出本轮模块、承接 Agent 与输入材料的任务计划。当前单模块任务与材料槽位校验已接线，实际执行顺序继续由工作流负责；DocGen 自行拆分内部 Worker，测试复用按源代码变化规则处理。

| 阶段 | 规则 | 下游 |
| --- | --- | --- |
| orchestrator | 测试生成与知识生成并行，外层不调度内部 Worker | test_gen；doc_gen |
| 文档链 | DocGen 内部调用 DocWorker，汇总全部片段后输出正文，再进行候选质量判断 | candidate_knowledge |
| candidate_knowledge | ITERATE / STOPPED 跳过代码生成 | workflow_router；其余进入 code |
| 验证链 | code → check；test_gen → oracle_validation | 两条链都完成后 evaluation |
| evaluation | FAILED 进入失败；STOPPED 交路由；其余审查 | failed / workflow_router / review |
| review | 输出纠正意见交 Application 保存和判定 | workflow_router |
| workflow_router | PASS 发布；ITERATE 加一轮；FAILED 失败；其余停止 | publication / orchestrator / failed / stopped |

`ProjectWorkflowStages` 加载历史知识、纠正意见、质量反馈和可信工件，调用 RoleExecutionService；角色不查询历史数据库。质量拒绝反馈进入下一轮 DocGen，预算用尽停止。评测由独立执行器完成，生成测试在原始源码上通过后固定为门禁测试集合。

## Check、评测与 Review 的证据传递

[TestGen IO-21](../agents/testGenAgent/TestGenAgent.md) 已确认首次候选测试校验失败的兜底：Application 将失败证据交回 TestGen，有限修复后由执行器重新校验，仍失败则转人工处理；正常校验通过直接固定测试集，不进入修复分支。该流程不改变已校验测试的源码不变则复用规则，maxTestRepairs 默认 1（0～3）；源码身份只取输入路径及内容摘要，已通过测试跨 Run 保持不变。

[DocGen IO-18](../agents/docGenAgent/DocGenAgent.md) 明确每次飞轮以一份知识文档为修订对象，后续轮次在这份文档基础上修改，不将多份 Worker 产出直接作为多文档输入。初次生成时由 DocGen 将 Worker 产出合成一份文档；内容过大而建议拆分时先与用户沟通，以用户意见为准。即使用户同意拆分，每次飞轮仍只选择一份文档。单文档约束针对知识输入范围，不移除 Check 的源代码输入、测试材料或项目配置。DocGen 已校验单文档修订范围，并通过 userDecisionRequired 提案与 STOPPED 路由交接用户决策；资料保留与清理按 IO-19，达标结束按 IO-20；历史最佳与关键回归回滚已有目标要求，评分可比性和回退实现细节待落实。

2026-09-10 确认的 [IO-15](../agents/checkAgent/CheckAgent.md) 保持现有顺序：Check 与 oracle_validation 均完成后进入 evaluation，正常评测结果再进入 Review。Check 生成比较结果及差异依据，评测执行器生成测试结果；Application 将两类证据交给 Review，用于分析知识卡片的修订位置。差异结果不用于决定测试如何执行，Check 不直接跳到 Review。

evaluate 保存 Check 和固定测试集引用作为依赖，在独立副本中运行生成代码与固定测试文件。recordGateDecision 读取 check.blocking，Review 同时获得 evaluationReportRef 与真实 Check 原始输出 comparisonReportRef。Review 的多条 corrections 经可信证据映射后进入下一轮 DocGen。编译失败或崩溃尚无测试计数时，可记录零计数的明确失败；零测试成功仍不能通过门禁。

[Review IO-16](../agents/reviewAgent/ReviewAgent.md) 已确认修订意见列表包含卡片及段落位置、问题说明、代码差异或失败测试依据、修订建议；Application 将意见与原知识卡片交给 DocGen 执行修改。无修订意见时返回空列表，仍按既有确定性 Gate 和路由决定后续流转，不新增 Review 直接修改知识的能力。

## 运行生命周期

[Evaluation IO-20](../evaluation/Evaluation.md) 已确认文档达到验收标准后立即结束本次飞轮，不再为提高分数追加轮次。沿用既有自动通过路径，结束并交付达标文档；达到最大轮次仍未达标或预算耗尽时停止并转人工治理，不再作为待确认问题。候选结构检查通过不代表飞轮验收通过。后续验收需覆盖达标后不派发新一轮任务。

[FlywheelDomainService](../../../../src/domain/workflow/FlywheelDomainService.ts) 封装创建 Run、状态迁移和生成能力声明，调用 Domain.ts 中的共享实体规则拒绝非法状态变化。Application 决定何时调用并保存结果；本模块不执行模型调用或数据库写入。业务连接与生命周期同属 workflow，LangGraph 引擎接线保留在 Infrastructure。

## 恢复和可观察性

飞轮结束后的资料处理遵守 [Knowledge IO-19](../knowledge/Knowledge.md)：运行期间保留过程资料，达标后保留最终文档与验收记录；需要人工治理时提供精简问题清单并暂存相关证据，治理完成后再按结果清理。Application 协调材料交接与保留，Agent 不直接删除工件。达标且最终文档及验收记录保存成功后立即清理中间资料，不设额外保留期；清理机制待实现。未完成、失败或中断的运行不能仅凭停止状态套用达标清理规则。

Application 冻结配置，LangGraph 保存执行 checkpoint，Registry 记录业务提交和节点投影。相同 generationKey 的完成结果可重放；同版本失败节点可恢复，旧 roleExecutionVersion 明确拒绝。取消信号传到模型和外部执行，迟到角色结果不能提交。内部 Worker 使用 doc_gen/doc_worker:worker-N 投影与独立 Registry checkpoint；片段复用不依赖外层 LangGraph Worker 节点。DocGen 结果的 workerResultRefs 保留子任务血缘。

节点 status、attempt、iteration、readyAt 与开始/完成时间用于观测，不作为发布权威。状态不完整时显示不可用，不能从节点完成比例推断知识可信度。

## 验证边界

两轮源码、双场景图、质量不足、取消和同版本恢复有现有测试入口；内部 Worker 增加分块、失败取消、片段复用和独立组合样例验证。业务规则修改定位本模块；仅调整一个角色内部步骤定位 agents 目录。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。

### DocGen 待决结果接线

DocGen 可返回 userDecisionRequired（拆分原因与建议），candidate_knowledge 将提案引用和内容放入 docGenDecisionRequired，并沿现有 workflow_router → stopped 停止；不创建候选、不进入 code。该结果只用于 IO-18 的文档范围沟通，不改变正常测评、Review、Gate 与发布顺序。用户答复后由调用方准备显式单文档任务。
