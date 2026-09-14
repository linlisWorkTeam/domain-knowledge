# 删除行冻结与工作台执行墓碑已测，仍未开放删除

目标active，本轮progress。独立/tmp/domain-knowledge-workbench，原用户树未动；网站d869e1a，原URL不变，未部署/删用户数据/启动模型。PR50 Draft，38/50不处理。

SqliteDeletionRecovery改deletion-recovery-v2，participant必须capture，首次prepare冻结各库witness后持久化；重试已有intent仅核对plan/契约，不重复capture。remove获得原plan和witness的深拷贝。旧v1不可跨版本恢复（仅旧临时测试使用过，未线上启用）。原跨库崩溃回执测试仍通过。

新增SqliteDeletionRows：真实表定位+行SHA witness，白名单去除派生记录；remove强制现有写事务和foreign_keys=ON，先复核全行摘要再按子表顺序DELETE。wb_batches/wb_pipelines/wb_stage_tasks写deletion_execution_tombstones（执行ID/plan/原digest/usage），触发器拒绝相同ID再次INSERT/UPDATE。序号/命令/用量账本在保护表不可删除。SqliteWorkbenchBatches旧command已找不到batch时明确BATCH_NOT_FOUND，不再返回undefined。

19/19（row2/recovery3/inventory3/batch6/arch5），类型和Spec通过。/tmp/DeletionRowsRegression2.log、Types2.log、Specs.log。真实Stage/Batch存储临时测试stage用量2calls/7tokens保留、同ID再建被拒、新批次编号-2；冻结后行变化、无事务、foreign_keys关闭均拒绝。捕获只一次，重启用原witness。测试明确只验证行执行器，选定行清单由测试直接构造，不声称完整domain授权或HTTP E2E。

剩余：旧runs目前不在row删除白名单，必须处理run_configuration_snapshots FK及必要审计/预算墓碑；完整图中配置/命令回指execution会阻止删除，不能随便去掉引用来让测试绿，须统一墓碑语义（共享产物/执行功能引用与审计关联要分清）。Source/config禁止删除。实际confirm仍需维护屏障+多库快照/完整写入互斥；SqliteDeletionRows尚未装配进Composition，文件清理、二次确认、恢复后重启独立阶段/流程队列未完成。现有单库BatchDeletions与跨库Recovery仍需统一公开用例。

2053关于336工件全SHA/size通过、0缺失仍正确，旧2045指纹误判已归档更正。C新修订版本还没重建和重跑门禁；C++当前引擎完整来源与最终发布未通过，无本轮模型运行。下一步应完成真实删除端到端，再继续真实C/C++验收与最终PR38/50处理，不把存储测试等同上线完成。
