<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接独立来源修订和真实整卡复核超时恢复。
-->
# 来源意见驱动修订

继续 /tmp/domain-knowledge-workbench / feat/five-stage-workbench，基线30aa16eadf23176cf831c75125cf98e2eae183b6，完整目标active未完成。Node24/384MiB，模型/原生构建/浏览器串行；原wxc脏树及taste4310/v0.2.0保留。此前仅清理npm下载缓存释放5.5GiB，未删除知识或证据。

新增 knowledge-source-revision-v1 / KNOWLEDGE_SOURCE_REVISION：POST /api/v1/source-revisions 接收 sourceVerificationTaskId，独立FLYWHEEL任务。Domain authorizeSourceCorrection 校验来源Review原命令、成功结果、原始输出、固定正文、既有H2和标准化纠正意见，保留PINNED_SOURCE_CONTRADICTION，不制造行为失败。Application WorkbenchSourceRevision冻结整个来源复核结果，保留其他未知风险，消费明确矛盾，调用共享WorkbenchCardRevision执行DocGen、最终H2源码Review和候选保存，再增量索引。原WorkbenchKnowledgeRevision也调用该共享能力，原v5行为材料/角色键不变；source-v1是新独立操作，没有升级原v9流程。卡片metadata记录sourceVerificationTaskId/revisionOrigin；来源修订后的新版本直接重建，不传仅适用于行为失败的retryEvaluationTaskId。

Console 在来源面板显示「按来源意见修订」，复用正文对照和索引/恢复面板；两类修订的点击事件限定所属容器，避免串台。来源复核新增最近输入下载、逐卡进度、失败角色尝试及超时中文说明。未知/矛盾不表示发布。

验证：类型/Spec通过；SourceRevisionTests共10（Domain授权/整卡覆盖、实际gcc普通/来源修订、多轮协调）通过；SourceRevisionFinalTests为架构8+实际gcc2通过；最后添加索引失败恢复后SourceRevisionRecovery实际gcc2通过，DocGen只执行一次、累计调用和tokens保留。初次故障注入错误挂在已经关闭的composition上导致测试未实际失败，修正为当前index.write后通过，未放宽断言。Console1通过，保留原行为修订断言并新增来源入口→修订→新版本重建路径。最新全208集成是30aa16e基线，本次未重复全208，只做受影响回归。证据目录source-driven-revision，/tmp/SourceRevision*.log。

真实v9已完成：pipeline-26ff040eebfe5415bb550501454d55e5cee41daf860d699830b072279643e8d3。第二次显式恢复Code返回合法协议并完成重建，EVAL stage-19c8986876fdeb687da9149055b5a1d97ad173dfcada73e2222d1fb191c45374：31/31，通过、复用31、重新验证、proposed0，接口兼容，关联完成。累计12calls/457583reported tokens，reserved1879044；与前次11calls/418061相比只有Code请求新增。PID2262692/session24836终止0。保留source-subject-v5/Pipeline-attempt-2-completed.json和Run-attempt-2-completed.log。仍有已知错误parser卡kv_76d70f740868291e0a0849be，因此publicationVerified=false，不能宣称真实知识已验证。

随后 /tmp/RunWholeSourceVerification.ts 启动真实整卡来源复核，runtime /tmp/workbench-revision-acceptance-20260911，task stage-066d361592caf606e13309f5c7c80157a576487d76c8150afbcb39626378a39f。PID2270370/session26305终止1，FAILED AGENT_STAGE_TIMEOUT。前三张检查点：kv_1312e3b8dc85e3a3a49fd91e MATCHED；kv_49fb44b0a7ea00128a597c64 MISMATCH、H2适用条件与内存前提（Review指出计数模式和size语义问题）；kv_5a349841e097407f136c1325 MATCHED。第4张kv_64a8511123f9ce28f31ab0ff的Review evidence-attribution单次attempt1超时；并非已知坏parser版本，也没有语义重试记录。总4calls/123668reported tokens/reserved439394/236350ms。失败角色与固定输入已保留，具体观点不是发布凭据。

real-knowledge-revision/whole-source-v1/WholeSource-attempt-1-timeout.json和Run-attempt-1-timeout.log保存第一次证据，WholeSource.json将由后续恢复更新。新/source修订实现没有改变verification-v1的输入或执行语义，可使用 /tmp/RunWholeSourceVerification.ts 加上述taskId恢复，复用前三卡、累计预算保留。交接写入时尚未恢复，提交后计划执行；先检查ResumeLaunch和实际PID，不能重复启动。当前没有真实source-revision执行，只有受控验证；完整来源复核完成后再决定具体已绑定修订，不能把部分失败任务冒充完整成功意见。

后续：完成真实整卡复核→来源修订→新版本重建/可信评测/再整卡复核；将来源门禁/修订接入新显式版本一键流程，旧v9只读，不能跨版本恢复。来源修订需要独立进展口径，不能把行为已通过却在修正H2的轮次误算无行为进展而固定三轮停止。仍需固定/可信行为与来源联合发布门禁、独立工作台事务（禁止虚构旧Run调用repository.publish）、TS共用边界/markdownLite最终回归、构建参数及多项目旧快照缺项、TinyXML2 XMLUtil真实最终链路、浏览器和网站部署。原v0.2.0不重写。
