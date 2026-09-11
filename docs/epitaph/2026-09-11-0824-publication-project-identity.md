# 项目身份与清单校验完成

/tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线1e1faa166c7d27649bb38b59e418884c36b2cae8。原脏区/旧网站未动，未删知识，目标active，Node24/384MiB重任务串行。

prepare(v8)接Domain ProjectPublication：原createProjectSnapshot重算identity，不改旧快照身份；分析manifest绑定repository/directory/commit/sourceDigest，选定module完整等于manifest项；sourceFiles路径唯一且覆盖选定source与全部build文件，objectId/kind/size匹配。夹具现在通过真实snapshot factory生成ID；17定向单元/集成、8架构、类型/Spec通过。测试包含删构建文件再重算合法ID仍拒绝。

实际 /tmp/VerifyPublicationProjectIdentities.ts 对C31/CPP37所在的旧真实project做identity/manifest验证通过；此前项目build、接口policy/schema及原始观察继续通过。无模型/编译调用，退出0。证据publication-project-identity/ActualReports.json、VerifyActualIdentities.ts与日志。

现在发布准备的跨任务/版本/项目/构建/接口/策略/固定/可信/来源H2与材料核验已接齐。下一步应直接实现最终发布事务和入口，不再按小检查无限拆分：独立workbench publication记录（勿借用旧Flywheel runId），SQLite记录PREPARED/COMMITTED与审计，按CAS生成Markdown/YAML和manifest，可恢复文件发布后才COMMITTED/VERIFIED。重复提交同证据复用，不改卡片正文/旧门禁。新增Composition/API/UI与pipeline最终提交；旧已成功流程只读，当前未接任何发布入口，不能宣称已经发布。准备v8仍PREPARED/publicationVerified=false。

真实source-policy-v1 task stage-3ac5a7c55407b750e1205020b04657f09b5e4d4590903f6e5592bf3ab3967b48，PID2411792/session82991再次确认活跃；最新RUNNING，31章节/3卡片，总7卡。driver /tmp/RunWholeSourcePolicyV1.ts，日志 /tmp/RealWholeSourcePolicyV1.log，完整source-policy-v1/WholeSource.json。保持运行，不重启。等整来源完成后依SOURCE_MISMATCH用SourceRevision消费原意见再重建/可信固定来源复测。

完整目标还含双目标新版完整一键真实链路、最终发布、Make/CMake模块参数、TS完整分析/历史选择、最终全回归与网站部署。仍不可标complete。
