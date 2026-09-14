# 文件见证已进入持久恢复

目标active。独立/tmp/domain-knowledge-workbench，线上仍d869e1a，未部署/删除用户文件/调用真实模型。PR50 Draft，38/50不合并。

SqliteDeletionRecovery升级deletion-recovery-v3，支持文件参与者（name/contract/scope/capture/clean）。首次prepare持久文件见证；重试不重capture，命名空间删除项缺参与者拒绝。applyRecords在修改记录前检查文件契约/scope。completeAfterFiles实际调用清理器，全部成功才COMPLETE；失败留RECORDS_COMMITTED。旧v2不跨契约恢复，线上没有启用过旧删除API。

CasDeletionFiles.scope绑定绝对目录路径/dev/inode摘要；构造锚定绝对路径，capture/clean前复核目录身份，重启换目录不允许继续。文件清理期间仍要求完整写入排他。

PersistentFileRecoveryTests.log27/27（数据库/图/CAS/恢复/架构）。最终相对路径及scope类型校验小修后PersistentFileRecoveryFinalTests.log11/11，PersistentFileRecoveryTypes2.log和PersistentFileRecoverySpecs.log通过。真实临时SQLite与CAS测试在清理成功后注入回执丢失，关闭重开数据库后恢复：capture一次、数据库删除一次、清理两次、usage17保留；缺参与者、目录替换、scope变化均拒绝且保留记录。

下一步需要把旧单库BatchDeletions与跨库恢复收敛成统一应用入口，保持维护屏障并完成写入排他；持久文件见证现在可用，不能继续留两个并行生产实现。还需发布Markdown/索引镜像/执行目录清理、HTTP二次确认与UI、恢复后队列重启。2107记录/336CAS审计仍有效，但不是全文件范围完成。C/C++来源质量、新修订全部门禁与最终发布仍未通过，无新真实模型任务。
