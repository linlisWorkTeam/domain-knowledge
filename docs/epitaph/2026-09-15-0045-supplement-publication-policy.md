# 补证策略发布校验已修复

/tmp/domain-knowledge-workbench，PR50 Draft，线上956fe26不变，全goal active。真实C++43例补证成功状态见0041记录及报告，不再恢复28fc任务。

本轮原计划处理来源旧意见无条件继承，检查发布链发现补证策略摘要误拒绝，先修复：NativeTestCache.nativeTestPolicyDigest由执行与发布共用；WorkbenchEvaluation导出workbenchSupplementDemand，发布重读原来源/固定正文并比较冻结需求；验证目标及候选绑定，指定候选必须完整存在可信suite（只允许caseId别名）。原来源、可信/固定观察门禁不弱化。

28项发布/来源准备/候选回归、类型、Spec、架构通过，日志/tmp/SupplementPublicationFinal.log及SupplementPublicationArchitecture.log。新增fixture修正自身任务身份、可信集摘要和观察引用，不改变旧断言。完整CI待本提交。未启动模型或新真实任务，未部署。

下一步查CI，然后处理priorFindings在新版来源中的可审计复核机制。当前只跑新来源仍直接继承旧ToInt接口误判；不能删除旧意见或用测试全通过抹去风险。43例oracle已可信，原来源434571仍35匹配27未知1差异。C最新卡后续门禁、真实最终发布、删除owner/历史产物兼容和线上完整链路均未完成。现网站、work/ljy及数据保留。
