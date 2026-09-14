# LangGraph检查点删除适配器

目标active，独立/tmp/domain-knowledge-workbench。线上仍d869e1a，无部署、模型调用、用户数据删除。上一提交a166a6a及PR50说明已推送；当前仍不合并38/50。

新增SqliteGraphDeletion，专用处理LangGraph的checkpoints/writes，不与业务同名表混淆。按线程关联真实run，未知线程保留；JSON纯数据扫描不调用SDK反序列化，提取CAS/实体/检查点跨线程引用。单字段8MiB/累计128MiB/10万行限制，逐条读取；未知编码/表列/损坏JSON拒绝。

graph-deletion-rows-v1冻结整线程行集和存储摘要，所有命名空间与writes整体删除。新增write或部分线程保留会拒绝；事务同时写deletion_graph_threads并安装INSERT/UPDATE拒绝触发器。SqliteDeletionRecovery参与者回执可复用本适配器，后续库失败后跳过已提交清理。尚未在Composition生产删除用例接线，不等于前台删除已可用。

GraphDeletionRegression2.log 26/26：实际SqliteSaver读写、线程隔离、命名空间、重写拒绝、共享检查点引用、超限与编码、跨库恢复及已有行/引用/领域/架构测试。GraphDeletionTypes4.log与GraphDeletionSpecs.log通过，包含最终控制表列校验。

GraphDeletionBackupAudit.json只读临时备份副本扫描：125检查点、1016writes，共1141行/8线程，274条含工件引用，0无归属行。没有修改源备份，副本已删除；尚未声称完整新增CAS引用都通过文件存在性校验。原336CAS审核未覆盖这些新增内部种子，最终递归图须重新检查。

继续：统一完整库存与跨库应用用例、完整跨进程写入边界、安全文件清理、HTTP二次确认/UI、恢复后队列重启。C修订后重建/全部门禁和C++来源质量/最终发布仍未完成，无新实际模型验收。
