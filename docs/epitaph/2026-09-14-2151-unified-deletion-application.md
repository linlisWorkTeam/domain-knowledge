# 删除应用已统一到跨库协调器

目标active，/tmp/domain-knowledge-workbench，网站仍d869e1a；未部署、删线上数据或调用模型，PR50 Draft，38/50不合并。

BatchDeletions/BatchDeletionStore升级异步库存+exclusive(work,recovery)边界，预览/确认/恢复共用应用。确认前重新计算清单，已有意图重新核对target及confirmed并走恢复边界。SqliteBatchDeletions不再有单库执行引擎，只映射SqliteDeletionRecovery。旧测试里的同步preview改await；存储失败、显式确认、共享引用、并发幂等、原提交时间等核心断言继续覆盖。

恢复deletion-recovery-v4，应用receipt-v2：RECORDS_PENDING/CLEANUP_PENDING/DELETED，增加持久preparedAt/committedAt/completedAt。旧v2/v3意图不跨版本恢复。各库回执失败回滚本库并保留PREPARED，文件清理不运行；后续恢复沿原意图继续。原wb_deletion_receipts表仍在库存保护规则中但不再写入，线上未曾开放旧删除。

UnifiedDeletionTests.log28/28，UnifiedDeletionTypes.log通过，覆盖领域应用确认规则、真实SQLite统一入口、文件/图/旧run恢复及架构。统一入口集成测试在RuntimeMaintenance下串行执行，用受控投影/文件适配器，不把它当真实生产全文件删除；所有底层适配器另有既有测试。

下一步生产Composition组装前仍须全写入排他及发布Markdown、索引镜像、其他执行目录的库存/清理；目前只完整覆盖数据库/CAS。还需HTTP预览/二次确认/UI和启动恢复后队列重启。时间字段从v4开始，旧记录不伪造。C/C++来源质量、新修订全部门禁、最终发布未完成，本轮无模型调用。
