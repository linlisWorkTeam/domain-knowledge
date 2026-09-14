# 声明式补证入口已接入，等待完整回归

/tmp/domain-knowledge-workbench，PR50 Draft，全goal active；线上仍956fe26，未部署本轮。沿用0030记录的真实来源质量与删除限制。

NativeSupplementTargets新增native-supplied-candidates-v1；WorkbenchEvaluation.start/prepare第三参数及POST native-evaluations的candidateSuites可提供模块声明式suite。固定CAS、输入身份和补证缓存摘要，校验同源码/卡片/模块/H2/接口，只接受有补证需求模块，不接受外部可信标志/观察报告。参考验证、历史门禁、生成评测仍走NativeSuiteEvaluation，指定候选不调用TestGen或改预期。旧输入不升级。失败保持原候选，新候选形成新任务，旧用量不改。

4项Domain单测、1项HTTP透传/错误响应、类型与Spec通过。HTTP测试曾重复关闭composition导致清理失败，已修复并重跑通过。完整WorkbenchEvaluation四项两次均在参考构建前WORKBENCH_RESOURCE_INSUFFICIENT，未放宽门槛；第一次与typecheck重叠，第二次串行仍不足。日志/tmp/SuppliedCandidateIntegrationSerial.log。新增混合风险场景断言验证错误候选不评测生成代码、正确候选保留历史用例、0模型调用、冻结预期、重启复用，必须由隔离CI确认。

下一步查本提交CI，修复真实失败再运行实际六例补证。用/tmp/VerifyCppHexDeclarative.ts及cpp-source-v5/HexPrefixDeclarative.json中的suite，source434571、reconstructioncf781完整ID见验收报告，通过新start第三参数{schemaVersion,modules:[{moduleId:'tinyxml2',suite}]}创建阶段。先检查无活跃任务及可用资源；不要改老可信测试，成功后原37加6预计43（以实际去重结果为准）。本轮尚未开始真实阶段。之后仍需处理source priorFindings无条件继承错误ToInt接口意见，不能直接清掉原历史来发布；未知风险与C完整后续验收、删除兼容仍未完成。
