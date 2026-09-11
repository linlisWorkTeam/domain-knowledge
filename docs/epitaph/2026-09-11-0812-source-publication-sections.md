# 来源发布章节原始证据

/tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线759815ac573e50ead95501d6cf76825079b38e77。原脏区/旧网站不变，未删知识，目标active；Node24/384MiB重任务串行。

新增Domain SourcePublication.assertSourcePublicationSection：明确PASS无风险/纠正，成功review/attribution同来源runId/commandId/rawRef；命令知识正文/source/观察/criteria引用对应；criteria schema/phase、完整card绑定、H2、verifyPreamble与单章授权路径一致。1单元含9类拒绝变体，8架构、类型/Spec通过。

实际只读 /tmp/VerifySourcePublicationSections.ts 从当前真实来源检查点读取CAS，15个已SOURCE_MATCHED章节通过，加入unresolvedRisks的内存副本均拒绝。证据publication-source-sections/ActualSections.json。没有修改原证据/调用模型，此检查不是全卡或全部来源通过。

此Domain规则尚未接入WorkbenchPublicationEvidence.prepare。下一步Application对source.result.summary.cards逐卡读正文，要求sections和markdownSections的H2完整一一对应；逐章读取reviewRef/reviewResultRef/result.commandRef/criteriaRef/referenceRef/referenceObservationsRef，校验CAS与信封schema，调用新规则。已知继承意见只可能MISMATCH，发布PASS不可继承；最终仍须检查来源reference文件与project匹配、观察suite/oracle与可信集对应。真实reviewResult.payload为{resultKind:attribution,corrections:[],unresolvedRisks:[]}。

接入的测试夹具当前正文只有body无H2，需改成实际含H2正文并生成真实形状的source章节/命令/结果CAS，不能跳过来源校验维持测试通过。其他未完成：接口/策略绑定与suite schema复验，项目identity/分析清单内容，SQLite/Markdown发布事务及Composition/API/UI。

来源task stage-3ac5a7c55407b750e1205020b04657f09b5e4d4590903f6e5592bf3ab3967b48，PID2411792/session82991再次确认活跃，最新RUNNING，22章节/2卡片，总共7卡。driver /tmp/RunWholeSourcePolicyV1.ts，日志 /tmp/RealWholeSourcePolicyV1.log，完整证据source-policy-v1/WholeSource.json。不要因等待重启，仍未整体完成。

完整剩余目标：来源修订后新重建/可信固定来源复测，双目标新版一键链路，最终发布，Make/CMake模块参数，完整TS分析/历史选择，全回归与网站部署。
