# 混合风险原生应用测试准备

实际/tmp/domain-knowledge-workbench，feat/five-stage-workbench，ef4b3d58ab68e7e16bd30a058e3f4674e416bf18，Node24/384MiB。目标active，旧站原树未动。

WorkbenchEvaluation.test.ts新增第三个参数场景：rejectSourceReview=false,mixedSourceRisks=true，原两场景保留（false/false、true/false）。仅在已有正确代码但错误知识的source测试段启用exposeMixedRisk，Limits返回独立未知风险，Behavior继续真实绑定的明确纠正。期待来源/携带来源UNRESOLVED，DocGen只改Behavior，sourceRevision.indexed=true且unknown保留，索引故障恢复不重复DocGen和用量，新Code/可信评测后Behavior SOURCE_MATCHED、Limits UNRESOLVED、publicationVerified=false。原错误候选/可信恢复/源码拒绝/行为与缓存断言均保留。新增sourceCorrectionPolicy断言。

已typecheck及diff通过，但该测试未运行！不是应用集成已通过证据。因为真实模型进程仍活跃，遵守重资源串行。下一轮模型结束后第一件事运行：PATH=/root/.nvm/versions/node/v24.13.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=384 node --test tests/integration/WorkbenchEvaluation.test.ts > /tmp/MixedApplicationActual.log 2>&1。现在应有3项，若失败读真实日志修复，不放宽断言。之后再Console及完整回归。0932记载v16已通过轻量集成/领域/架构，不替代此原生路径。

真实source task stage-826fed86bba18a7aa3b75ead348d503aac5181395798f5f4a1d341194f734bd4仍运行，PID2522760/session32339，/tmp/SourceAfterCorrectionBindings.log；最新17calls/321059tokens/reserved1501118，elapsed约560s。继续同handle，勿重启。Source.json已有2个source-card检查点：kv_1312...、kv_2071...都是SOURCE_MISMATCH（各9节，无unknown），不是整任务结果；其余5卡尚待。旧明确矛盾仍保持，需要后续新policy修订。不能在当前任务未结束时创建重叠来源修订。

原生测试后，用新完成source task826fed...调用workbenchSourceRevision.start；当前新source-correction-selection-v1会选择混合风险明确章节，v16可推进已保存/索引的局部修订但发布仍阻断，详细实现见0932。双目标全部真实链路/最终发布/关联截图/报告和当前网站仍未完成，不能标goal完成。
