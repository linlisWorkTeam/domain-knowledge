<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接多语言案例边界未提交改动和串行验证队列。
-->
# 多语言案例边界

/tmp/domain-knowledge-workbench，feat/five-stage-workbench，HEAD ac5c740d5111ae0912875a5360eb2a7a909fded6；本次改动未提交，等实际模块回归后提交。完整目标active；原wxc和taste网站保留，Node24/384MiB，重任务串行。

LanguageToolchainPorts新增TypeScriptModuleInput及LanguageCaseToolchain分派端口，统一语言/通过数/总数/原始报告包络。IsolatedLanguageCases复用NativeCaseExecutor和evaluateModuleSuite，保留原报告对象、信号、隔离和重复次数；同时实现NativeCaseRunner桥接。Composition的NativeSuiteEvaluation和TrustedProjectEvaluator的TS模块分支已接通。没有实现TS多卡片生成，源码/公开接口仍是各自能力，不能声称完整语言接口已统一。

NativeFingerprint引擎加入分派器正文，TS工具链摘要增加执行器与分派器正文hash。新构建须重新验证缓存；不可跨旧工具链摘要恢复。正在运行的来源复核只读其冻结原EVAL证据，不重新执行编译，不被该接线替换。

修复分析页默认勾选TS后生成失败：Domain保留typescript身份但注明TYPESCRIPT_MODULE_REGRESSION_ONLY，默认不可选；UI说明现有模块回归保留，此多卡生成入口尚不支持。现有C/C++和旧TS回归断言不放宽。

轻量验证：LanguageCasesUnit 3通过（分派/报告/信号和错误语言绑定、TS原报告保留、默认选择）；架构8通过；类型/Spec此前通过，最后默认选择改动后再运行，检查LanguageCasesTypecheck.log/LanguageCasesSpecs.log实际终态。首次TS1294参数属性已改为显式字段赋值修复。实际隔离回归尚未运行，不能写已通过。

真实source-v2仍运行：PID2311150/session83839，task stage-64103783a686e63184d2188e8101a3f0e078053fad82d622489381bb452ee086，日志/tmp/RealWholeSourceVerificationV2.log。交接观察RUNNING、15calls/388086reported tokens/reserved1669964；14个左右章节检查点已产出，实际数量读WholeSource.json。不要重复启动。来源仍不完整、未修订、未发布。

串行队列1：/tmp/RunFixedAfterSource.py PID2317543/session67894，等待source退出，执行jsmn11和TinyXML2 40固定参考案例。队列2：/tmp/RunLanguageAfterFixed.py PID2322890/session85205，等待队列1进程退出，执行ModuleCaseEvaluator、NativeCases、WorkbenchEvaluation三个既有集成文件。结果/tmp/LanguageCasesIntegration.log和LanguageCasesIntegrationResult.json。先检查三个PID/会话，勿并发新模型/原生任务。源复核即使失败，后两队列仍运行；必须等队列2结束再决定恢复源复核。

后续检查真实结果与固定参考报告，修复测试发现问题，不改预期迎合生成；完成回归后提交本次改动。完整来源意见后来源修订→重建/评测/再复核；最终发布门禁与独立事务、完整TS能力边界、构建配置解析/模块参数、多项目旧快照、两个目标最终真实闭环及网站部署仍未完成。保留目标active。

本轮后续终态补充：source-v2已退出1，AGENT_STAGE_TIMEOUT，15calls/388086reported tokens/reserved1669964/699123ms。完成14章节：10MATCHED、4MISMATCH、0UNRESOLVED；完整卡片聚合尚未完成。whole-source-v2/WholeSource-attempt-1-timeout.json与Run-attempt-1-timeout.log已保存。固定队列随后完成退出0：jsmn11/11、TinyXML2 40/40，原始报告在fixed-native-reference。核对suiteDigest/总数/状态后手动记录Targets.fixedSuite的REFERENCE_VALIDATED与reportSha256/toolchainDigest；旧trustedSuiteStatus仍pending，未发布。最后类型/Spec通过。模块回归队列已开始，具体结果仍以LanguageCasesIntegration.log及Result.json为准。

提交前最终补充：模块回归队列终止0，17/17通过，包括原TS模块9项、原生案例与完整卡片修订集成；原断言保留。证据language-case-boundary含3单元/8架构/17集成/类型/Spec日志。此次未再运行Console。三条旧进程均已终止，可以显式恢复source-v2同taskId；恢复前看新的ResumeLaunch/进程，不能重复。
