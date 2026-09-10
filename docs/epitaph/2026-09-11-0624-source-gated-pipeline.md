<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接来源门禁流程和逐章节真实验收。
-->
# 来源门禁与逐章恢复

工作树 /tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线 c3bc39a5352c3bbef488dfbf66fa47423039f344。完整目标未完成。原 wxc 脏树和 taste4310/v0.2.0 保留；Node24/384MiB，重任务串行。磁盘5.6GiB；只清过npm下载缓存，没有删除知识。

pipeline-v10 在可信行为通过后调用独立来源复核，未知暂停，明确矛盾调用来源修订，增量索引后新版本重建。缺执行器不能跳过；输入冻结和累计用量包含来源子任务。行为失败进展按连续失败阶段计算；来源以新完成 cardId/H2 计数，重复同章节连续无进展暂停，不固定总三轮。旧v9只读。

source-verification-v2 改为逐H2调用既有Review，仍提供真实完整正文/固定源码/可信参考观察。全部H2覆盖才可匹配；首章也检查标题/前言，超出授权的矛盾保留风险。逐章节材料、意见、检查点及进度持久化，可重启后只补未完成章节。多处矛盾保留所有意见，source-revision-v2逐轮修订首个问题章节。旧source-v1只读，不跨版本恢复。Console展示来源子任务和逐章节详情。

通过：集成212、单元75、架构8、Console31、受控acceptance19；最后前言准则改动后实际gcc定向2通过，最终类型和Spec通过。日志在发布进展目录 source-gated-pipeline；受控测试不代表真实模型质量或发布完成。

真实v9 pipeline-26ff040eebfe5415bb550501454d55e5cee41daf860d699830b072279643e8d3 已成功，最后EVAL stage-19c8986876fdeb687da9149055b5a1d97ad173dfcada73e2222d1fb191c45374 为31/31、复用31、参考重新验证；累计12calls/457583reported tokens。已知坏parser kv_76d70f740868291e0a0849be仍未修正，不能发布。

真实source-v1 stage-066d361592caf606e13309f5c7c80157a576487d76c8150afbcb39626378a39f 两次终止超时，第4卡 jsmnerr kv_64a8511123f9ce28f31ab0ff。最后5calls/123668reported tokens/reserved544998；最后中断请求用量未知不能算0。前三卡检查点保留；第二次PID2284133已退出1。SDK元数据表明两个请求都被180秒角色截止中断，没有最终文本。未复制推理正文。whole-source-v1/TimeoutDiagnosis.json及两次结果保留。不要第三次恢复旧契约。

下一真实执行 /tmp/RunWholeSourceVerificationV2.ts，runtime /tmp/workbench-revision-acceptance-20260911，证据 real-knowledge-revision/whole-source-v2。从上述完成EVAL创建全新v2来源任务，不恢复v1；启动前检查进程及RunLaunch，避免重复。交接写入时尚未启动。来源完整后按明确意见执行真实source-revision-v2，并重建/评测/再复核。当前没有真实来源修订完成证据。

仍需：固定+可信行为+来源联合发布门禁、独立工作台发布事务（不虚构旧FlywheelRun）、TS共同边界与markdownLite最终回归、构建配置解析/模块参数及多项目旧快照缺项、双目标最终真实闭环/截图/网站。Targets.json仍PENDING_REFERENCE_VALIDATION，不以31/37普通可信测试冒充固定测试。保持目标active。
