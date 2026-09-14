# 指纹误判已纠正，跨库恢复已测，删除尚未接服务

目标active，本轮progress。独立树/tmp/domain-knowledge-workbench，原用户树未动；网站仍d869e1a，原URL，未部署本轮删除代码，未删除用户/备份数据或启动模型。PR50仍Draft，38/50合并未进行。

必须纠正2045墓志铭的缺失结论：action_items两项sha256值是fingerprint；第三个工具链值是toolchainFingerprint，不是CAS引用。此前seed扫描所有sha字符串误判。现在按artifactId/Ref字段或明确ARTIFACT subject识别；不会把指纹/源码版本当文件。只读重扫d869 pre-deploy-backup/data：966记录，336个工件全部SHA/size通过、5725914字节、0缺失、0未知表。/tmp/DeletionRecursiveBackupAuditV3.json为当前证据，V1/V2作废于缺失结论。没有填补任何文件。

CasDeletionReader新只读端口：仅合法sha256ID，Linux逐级目录FD锚定，O_NOFOLLOW，不读链接/非普通/超限文件，校验读前后状态与内容摘要；根目录丢失和权限错误不能解释为文件不存在。expandDeletionArtifacts现在返回{nodes,missingArtifacts}，实际ENOENT列缺失/0字节，状态入plan指纹，文件恢复使旧确认失效。文本碰巧以JSON开头仍检查有效JSON中的引用；JSON媒体声明与解析冲突拒绝。新测试保留所有已有共享保护及损坏拒绝断言，并增加指纹非引用、裸ID、缺失/恢复与链接边界。

SqliteDeletionRecovery持久中央意图+每库本地回执，phase PREPARED→RECORDS_COMMITTED→COMPLETE；投影契约冻结，第二库失败、中央ACK丢失后重启不重复本地变更。所有记录提交后才能文件清理，调用completeAfterFiles确认才解除pending；缺少已提交回执不再次删除。真实SQLite磁盘3项通过，保留budget=17且removal=1。它不是多库原子事务，维护屏障、startup恢复、真实remove投影、预算/编号墓碑、文件清理与HTTP/UI仍未接入，当前不能开放删除。回执已在inventory中列为受保护配置。另注意SqliteBatchDeletions旧单库用例与新恢复协调器尚需统一接线，不能形成两套真实执行路径。

26/26删除相关+架构、类型、Spec通过。/tmp/DeletionRecoveryRegression.log、DeletionRecoveryTypes.log、DeletionRecoverySpecs.log。bootstrap READY。当前服务数据未改，C/C++状态无新进展（详2034及报告）；C新修订版本仍需重建/门禁，C++当前引擎完整来源/最终发布未完。下一步优先真实删除投影和维护屏障接入，再文件清理和二次确认，而非继续增加孤立基础组件。
