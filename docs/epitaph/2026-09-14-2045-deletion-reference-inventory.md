# 删除引用清单已接真实表，尚未开放删除

目标 active，本轮 progress。独立工作树 /tmp/domain-knowledge-workbench，原用户树未动。网站仍是d869e1a、原URL；本轮未部署、未删除用户数据、未启动模型。上一轮f90d0b7只记录已部署前台；PR50仍Draft，不处理38/50合并。

新增 SqliteDeletionInventory：读取实际表主键、摘要、JSON引用；batch→pipeline→stage、生成/修订metadata→version，旧candidate_knowledge检查点输出→旧version归属，不用module或evaluation猜。未知表受保护并列未分类；序号、用量、配置、幂等记录保留（目前这些回指仍可能使删除计划拒绝，须墓碑协议解决）。仅输出摘要与引用，不输出配置正文。新增 DeletionArtifacts：串行校验CAS摘要/大小，递归JSON工件及实体引用，共享/来源依赖保留。只有裸artifactId且缺可验证ref时明确UNRESOLVED，不忽略。

只读扫描d869 pre-deploy-backup/data三库得到966记录、10/10知识归属、0未分类表，/tmp/DeletionInventoryBackupAudit.json。递归真实CAS审计发现历史action_items引用 sha256:4292ee379fb4bfaf06b2925361cde072c0a4eba6acd82505a0dcdc5c94f2a0e0 不存在；owner节点registry/action_items/9892bb75d43427606e416ead6af2ab26a133fb7b06f7c0f778ce8233f91e3b83。不是所有CAS成功，需区分历史缺失记录与可安全清理的现存工件。不要伪造/补空工件。错误cause只含ownerId、artifactId，便于定位。

本地bootstrap READY；删除14+架构5=19/19，类型、Spec通过。/tmp/DeletionGraphRegression.log、Types.log、Specs.log。现扫描器未接API或生产写事务；完整跨库一致快照、裸引用解析与缺失处理、预算/序号墓碑、跨库崩溃恢复、安全文件清理及二次确认UI仍须实现。单库SqliteBatchDeletions不能证明跨库WAL原子；CAS异步写入也不能只靠SQL锁保护。优先继续实际接入，避免仅增加框架。

C/C++状态沿用2034及报告：C修订3卡1未知，新版门禁未重跑；C++完整来源/当前引擎发布仍未通过。没有新的验收进程；恢复前核对终态与版本，不重置用量、不改可信预期。全部完成后再比较处理PR38/50。
