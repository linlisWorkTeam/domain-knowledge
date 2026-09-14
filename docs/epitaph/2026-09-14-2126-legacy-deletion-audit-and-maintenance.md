# 旧运行删除与异步维护核验

目标仍active。独立工作树/tmp/domain-knowledge-workbench，网站仍d869e1a；本轮再次只读确认公网导航为知识飞轮管理、知识治理。原树未修改，无用户数据删除，无模型执行，PR50仍待完整交付。

旧运行删除计划升级batch-deletion-v2，审计引用只允许执行身份；行契约deletion-rows-v2保留最小runs父行和配置/累计调用，清除best_version_id并设置墓碑。业务列表、详情及统计隐藏墓碑，触发器阻止恢复同ID或追加结果。发布归签发门禁/一致run收据，catalog事件按模块/版本/正文三项一致归属。真实临时库测试从完整库存规划到事务删除、重启及预算保留。

LegacyDeletionRegression3.log 37/37、LegacyDeletionSpecs.log通过；LegacyDeletionTypes4.log通过。RuntimeMaintenance新增可选锁内异步verifyIdle，检查期间拒绝并发请求，检查后确认请求仍有效；AsyncMaintenanceTests.log 4/4。此入口尚未接生产执行探测，不宣称解决所有存活判断。

只读备份审计发现业务GENERATING/EVALUATING可能对应工作流FAILED，不能当成当前进程运行，也不能直接放行删除。LegacyExecutionStateAudit.json基于独立复制的LangGraph检查点读取，不证明线上进程状态。旧LegacyDeletionPlanAudit2.json早于catalog归属修复，不能当最终计数。

未完成：生产实时执行核验/写入排他；LangGraph checkpoints.sqlite及pending writes完整归属与清理；安全文件删除；统一跨库应用用例、HTTP二次确认与前台入口；恢复后重新启动队列。临时测试不等于完整删除可用。C新修订仍需重建与全部门禁，C++完整来源质量与最终发布仍未过。保持目标，不合并PR。
