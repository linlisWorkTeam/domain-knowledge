<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接真实修订超时、未修改卡片的真值缺口及失败尝试审计。
-->
# 角色失败尝试审计

继续 /tmp/domain-knowledge-workbench，feat/five-stage-workbench；基线7afb0d9cfa6e99b631e55ebd611f9aeb0bf00223。完整目标 active 未完成。Node24/384MiB，重任务串行；原wxc和taste/4310/v0.2.0未改，仅加原树交接指针。磁盘约160MiB，未删旧知识。

本轮实际运行 v8/revision-v4：pipeline-2fa905c1ace72c9beb46d18f47c58ad3c6ba04c3eb0d8ba9833e0a3e98d9d7c1，runtime /tmp/workbench-revision-acceptance-20260911。两目标源码提交与Targets.json全部摘要重新核对一致（只是摘要检查，不是上游固定测试执行）。使用7张当前卡片，明确包含旧模型错误卡片kv_76d70f740868291e0a0849be。新人工init故障kv_d285bb9b21f81f726735d804。首Code受控，31条可信测试全部复用、5/31通过。真实Review两次：错误parse卡片竟返回PASS/UNCHANGED；init卡片正确指出pos必须从1改0。DocGen第一次输出被语义校验拒绝，第二次在240秒共享阶段期限内超时。第一尝试最终FAILED/AGENT_STAGE_TIMEOUT，5次阶段调用（含受控Code）、165234已报告tokens，取消请求未报告的用量不能当作0。没有新卡片提交，未调用修订后源码Review。

证据 real-knowledge-revision/source-review-v4：Pipeline-attempt-1-timeout.json、Run-attempt-1-timeout.log、ProviderAudit-attempt-1.json、PinnedInputsVerified.json；UnchangedCardTruthGap.json绑定known mismatch与错误PASS。原进程2205163/会话88799已明确退出1；不能继续等旧句柄。/tmp/RunRevisionAcceptanceV4.ts 支持argv[2]同pipeline恢复，已加roleAttempts到周期报告；需先确认新ResumeLaunch是否存在及进程是否活着再决定启动。此交接写入时尚未恢复，计划提交后启动一次同任务恢复，不重新生成或清预算。

新增失败尝试审计：WorkbenchRoleExecution接入既有stageJournal，CAS保存STARTED/PASSED/REJECTED/FAILED的原始输出和校验反馈；PROGRESS事件仅记录角色、key、taskAttempt、语义attempt及ref、可读hint。同任务尝试读原审计；显式恢复的新taskAttempt隔离新会话，但所有旧记录/累计用量保留；成功role检查点继续复用。失败不晋升成功，不增加时限、不改模型输入/角色语义/两次尝试上限。此次是可观测性补齐，revision-v4/pipeline-v8保持不变。下载入口只读取同任务登记的审计ref，跨任务按摘要读取返回null。Console展示失败原因与下载按钮。

测试：类型/Spec/架构8、集成208、相关Console2通过；另定向角色恢复/实际gcc修订7项通过。集成刻意让首次DocGen输出非法H2，再反馈修复，断言四条审计状态、原始非法正文、精确校验码及跨任务下载拒绝；原有其他断言保留。Console也让真实应用中的受控DocGen先拒绝后成功，页面显示中文反馈，并实际下载确认原始正文与校验码。原始受控fixture未考虑attempt-2导致一次测试失败，已按两个模式精确断言stage后通过。证据目录 role-attempt-audit，含Controlled桌面/窄屏面板截图（受控，不是真实模型浏览器验收）。最后类型/Spec检查见RoleAuditPost*.log。

领域Spec补充完整最终来源一致性门禁为待实现：失败归因PASS不等于真值，通过行为测试也不能消除固定源码矛盾；最终必须复核所有实际冻结卡片，包括未修改卡片。目前只修订后H2做源码复核。最终Review的明确源码错误不能伪造行为失败来进入旧修订入口，应有独立证据/定点修订交接。旧repository.publish同时更新旧runs，不能构造不存在旧Run骗过发布；需要独立工作台验证事务及凭据，再复用本地文件发布端口。现有published状态仍false。

下一步先恢复同v8任务以取得真实DocGen失败输出或实际完成源码复核；依据新审计修复具体问题，不盲目加时限/反复重启。如果恢复已启动，必须轮询ResumeLaunch记录的现有句柄，不能重复运行。然后实现完整所有卡片源码一致性/固定及可信行为发布门禁，解决已知parse错误卡片，而非只追求Code通过。TS共同边界/markdownLite最终验收、构建参数缺项、多项目旧快照范围、双目标最终真实运行及网站部署仍未完成。完整目标保持active。
