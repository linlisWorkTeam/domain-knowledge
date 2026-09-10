<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接原生可信用例协议、缓存与待接通阶段。
-->
# 原生可信测试应用边界完成，完整目标继续

隔离工作树 /tmp/domain-knowledge-workbench，feat/five-stage-workbench，前序7422ca29677cae769a96323a15a96900ac70d207。用户完整目标仍active，当前无阻塞。原wxc工作树保留，仅追加指针；线上taste/4310与v0.2.0未更新。Node24、384MiB堆、重测试串行。磁盘约282MiB，未删除旧知识库。

NativeBehaviorSuite/Schema 定义 native-cases-v1 声明式变量、公开调用及可观察值，拒绝源代码表达式、越界索引和与目标调用无关的观察。NativeCaseHarness不含预期，NativeCaseExecutor分别隔离参考与生成代码，由宿主解析严格wire并比较；64位整数保持字符串，浮点误差1e-7乘max(1,abs(expected))。ASan/UBSan开启，128TiB仅虚拟地址上限，物理128MiB/16进程/3秒不变，必须cgroup，取消整个进程树，无降级隔离。

TestGen现有角色新增原生策略分支，候选只输出PENDING_ORACLE数据清单；旧TS分支保留。CodeAgent实际仅声明read_material，与当前材料模型边界兼容。KnowledgeSections从DocGenRevision抽出共用，旧修订语义保持。NativeSuiteEvaluation已在Composition暴露，但未注册EVALUATE或FLYWHEEL handler，页面尚不能启动这两步。

SQLite wb_native_test_sets/head保存不可变测试集。缓存绑定cardId/正文/参考文件/接口/策略/实际工具链，可信head事务比较父版本。错误候选REJECTED不能评测生成实现；知识修订保留原用例和预期并重验，历史可信集不删除。cardId#H2绑定明确版本；删除章节保留历史链接matchesInput=false，重复标题拒绝歧义。生成源文件与报告保留CAS；publicationVerified始终false，行为通过不代替发布门禁。

NativeFingerprint在隔离环境查询编译器和动态依赖，哈希系统头文件、编译器/运行库及执行引擎文件。宿主ldd曾注入libonion路径，改隔离查询后解决；大清单用固定构造JSON而非受256KiB限制的Stage canonicalJson。每次验证前后比较指纹，阶段接线还需在启动冻结expectedToolchainDigest。尚未覆盖部署捆绑库映射或Clang多AST文档的全部情况。

验证：类型与Spec通过，领域46/46，架构8/8，完整integration187/187；随后重复标题修复的NativeCases6/6通过。覆盖真实C/C++编译、错预期拒绝、自报stdout拒绝、UB检测、64位输出、TestGen生产角色受控模型、重启缓存、正文修订重验、工具链/源码失效、失败章节映射。没有真实模型调用、新真实运行编号、Console新截图或网站更新。

下一步优先完成FLYWHEEL/EVALUATE实际接线，不能停留在测试基础：复用Code/TestGen角色与RoleArtifacts，冻结卡片版本/公开接口/配置/工具链；Code绝不能取得参考源码或隐藏用例。TestGen材料可含正文和公开接口，sourceSnapshotRef仅元数据。准备阶段应区分参考基线/依赖失败与错误候选，不将所有编译失败判为知识错误。case级context.step已有恢复支持，跨进程取消/完整测试恢复仍需阶段集成验证。

jsmn与TinyXML2固定源仍见tests/fixtures/nativeTargets/Targets.json、/tmp/workbench-reference-inputs及/tmp/workbench-native-acceptance-20260910。需通过本轮声明式协议真实验证固定目标，再跑真实模型多卡片链路。完整接口/结构/规范化差异、可解释修订、质量/固定可信行为门禁、关联与指定材料、持久化一键顺序、TS新工具链边界、最终部署均未完成。原markdownLite回归保留。本轮无权限请求，无真正阻塞，继续执行完整目标。

最终真实工具链指纹检查：3852项，相同环境两次摘要一致，c11改c17摘要变化；当前c11摘要77ba4d73ddad6dcbfcd260bfb09594b76bc7a6b36cbb4b1ceb549956cfc85096。
