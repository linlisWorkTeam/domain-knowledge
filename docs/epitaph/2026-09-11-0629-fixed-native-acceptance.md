<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接固定原生参考验收与正在运行的逐章来源复核。
-->
# 固定用例与真实逐章复核

工作树/tmp/domain-knowledge-workbench，feat/five-stage-workbench；基线07d1c3148e8731d1e4bd4dd13597cd905298e7ed（v10来源门禁，source-v2）。完整目标active未完成；原wxc脏树、旧taste4310/v0.2.0不改，Node24/384MiB、重任务串行。未删知识，剩约5.6GiB。

新增冻结声明式固定测试：JsmnFixedCases.json 11案，Tinyxml2FixedCases.json 40案，Targets.json记录SHA/数量/配置，仍PENDING_REFERENCE_VALIDATION。jsmn默认C11覆盖token类型/起止/size及错误码，对象键size=1、字符串结束引号位置；TinyXML2限定转换/ToStr重载/布尔序列化。编写时按固定源码确认jsmntype_t枚举为1/2/4/8，未执行前修正草稿中的3/4；没有根据生成代码修改预期。已有上游jsmn四配置参考16案结果在native-toolchain，仅参考结果不能作生成代码自报门禁。

RunNativeFixedCases.ts校验固定Git对象和suite摘要，取得真实工具链指纹、公开接口，用现有NativeCaseExecutor逐案隔离运行，expected留宿主。保存实际观察，首次失败保留结果并拒绝，不自动晋升、不更新Targets状态、不发布。当前只做参考验收，尚未接入最终工作台发布门禁。

RunNativeWorkbench.ts报告版本native-workbench-acceptance-v2：steps模式行为通过后也调用sourceVerification，来源矛盾/未知明确失败保留编号，之后才关联；pipeline模式拒绝恢复旧契约，成功结果名称BEHAVIOR_AND_SOURCE_PASSED_PUBLICATION_PENDING。修正Operations若干过时的“尚未接通”文字。

本次类型/Spec通过，11+40用例通过Domain schema与harness生成检查（使用已有接口证据并补当前命名空间前缀，仅结构检查，非参考执行）。最终真实参考执行尚未开始，不能说51项原生通过。此前07d1c31全212集成/75单元/8架构/31Console/19受控acceptance通过，见0624交接。

真实source-v2已启动：stage-64103783a686e63184d2188e8101a3f0e078053fad82d622489381bb452ee086，PID2311150/session83839，/tmp/RunWholeSourceVerificationV2.ts，runtime /tmp/workbench-revision-acceptance-20260911。日志/tmp/RealWholeSourceVerificationV2.log，证据real-knowledge-revision/whole-source-v2。交接观察RUNNING、5calls/125781reported tokens/reserved566933，逐章检查点持续产出。首卡kv_1312e3b8dc85e3a3a49fd91e已有明确MISMATCH：字段size描述遗漏对象键递增、primitive严格模式终止条件遗漏。前一整卡v1曾错误MATCHED，不能以旧意见覆盖本次发现。当前尚未完整聚合，尚未真实来源修订。下一步先检查实际PID/WholeSource.json，勿重复启动。

固定参考任务已排队：/tmp/RunFixedAfterSource.py，PID2317543/session67894，等待上述source进程退出，再串行运行jsmn和tinyxml2固定参考测试。日志/tmp/FixedAfterSource.log；证据fixed-native-reference/Queue.json、随后各target.json/log、Execution.json。不能在该队列运行时另启模型/原生重任务。两个目标分开保留结果，即使前者失败仍验证后者。队列没有开始时不要宣称参考验证通过。

后续：完整来源结果后执行明确来源修订→新版本重建/可信评测/再来源复核，或新v10一键流程；旧v9只读。先等固定队列结束再启新模型。需要最终固定+可信行为+来源联合发布门禁和独立工作台发布事务，禁止虚构旧FlywheelRun调用旧publish。TS公共边界/markdownLite最终回归、构建配置解析/模块参数及多项目旧快照、双目标最终真实闭环、截图/报告/网站仍未完成。保留完整目标active。
