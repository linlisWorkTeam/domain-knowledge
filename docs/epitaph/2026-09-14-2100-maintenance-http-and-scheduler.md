# 维护屏障已接Server与批次调度，完整删除仍未开放

目标active，本轮progress。独立树/tmp/domain-knowledge-workbench，原用户树未动。网站仍d869e1a、原URL https://contract-strict-warren-theories.trycloudflare.com/；本轮未部署或删除用户/备份数据。PR50继续Draft，38/50未处理。

新增RuntimeMaintenance：数据操作许可计数，exclusive拒绝其他请求及idle=false，recover保留待恢复状态；Server所有API数据请求进入许可，finally释放。GET /api/v1/maintenance只返回AVAILABLE/MAINTENANCE/RECOVERY_REQUIRED，保留既有鉴权；维护时其他API503中文，静态页面/health可读。特别处理两处SSE定时flush，维护时不查数据库，不能仅屏蔽新连接。

Composition装配deletion-recovery.sqlite只读pending探测和持久idle检查。后者检查registry运行及workbench stage/pipeline/batch未完成或租约；未知状态/读取失败不判空闲。本进程stage/pipeline/batch/publication pending也必须为空。WorkbenchBatches canSchedule控制start恢复与tick领取；Server启动pending时不recover stage/pipeline。测试实际排队batch保持QUEUED，非只检查空队列。

20/20：维护7、原Server7、批次1、架构5；/tmp/MaintenanceRegression2.log。类型和Spec通过/tmp/MaintenanceTypes2.log、MaintenanceSpecs.log，bootstrap READY。没有运行浏览器或模型，本轮HTTP服务测试均临时数据库。

下一步必须做实际删除投影/墓碑/文件清理/二次确认接入。维护屏障尚只保护Console入口和其调度，不能声称外部CLI或任意直接SQL连接互斥；最终confirm必须完整写入边界及跨库快照复核。RuntimeMaintenance.recover入口尚未接真正的恢复投影；启动pending只保留状态，不自动完成删除。恢复完成后也需调用stage/pipeline recover，使此前未恢复的队列继续；目前批次timer会自动重试但独立队列不能遗漏。现有SqliteBatchDeletions与SqliteDeletionRecovery要统一真实路径，不并列两套公开删除用例。

2053记载336工件全通过、0缺失的证据仍有效；2045关于缺失工件是指纹误判，已纠正，别修补备份。C/C++当前引擎完整来源/最终发布仍未验收，新C版本未重跑门禁，未启动新的模型进程。完整完成后才比较处理PR38/50。
