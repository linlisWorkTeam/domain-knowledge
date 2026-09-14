# DSH临时home文件与符号链接可持久清理

目标active，独立/tmp/domain-knowledge-workbench。线上仍d869e1a；未部署、删除用户数据或调用模型，PR50 Draft，不合并。

DshHomeDeletionFiles是dsh-homes文件参与者，按受保护SDK审计的幂等键前24摘要+UUID目录名关联runs/stage所有者；未知完全归属跳过、未知共同所有者用配置引用保护。扫描逐层pinned fd/O_NOFOLLOW，目录只身份，文件身份+内容摘要，链接身份+目标摘要不保存目标文本、不访问目标。单file32MiB、总128MiB、10万项、depth24；未知顶层不清理。capture核对原树，clean预检全部，然后逐叶unlink+fsync父目录。缺叶可恢复，缺目录/新成员/替换/变化拒绝；空目录保留供重试。

SqliteRuntimeDeletions新增可选dshHomes{root,audits}并加入持久协调器；目前一个DSH根，多个根需要组合支持或显式拒绝未覆盖配置。根纳入源目录隔离检查。SqliteDeletionSnapshot.additional由protectedNodes更名为nodes，可附加DSH artifact与保护节点，摘要双扫描保持。

DshHomeDeletionTests.log33/33，包括DSH5（链接目标保留、失效链接、部分清理、变化拒绝、未知/共享保护、回执丢失后真实SQLite重开原见证capture1/remove1）、运行组合、session、workspace、published、统一恢复和架构。DshHomeDeletionTypes.log及DshHomeDeletionSpecs.log通过。

/tmp/DshHomeBackupAudit.json只读备份验证：临时复制registry/workbench/publications数据库及sidecars后只读库存，原备份homes只读扫描，结束删除临时数据库副本。75审计→75homes→8已知所有者，0protected；600files、36375links、2700dirs，逻辑bytes10655287（含link长度）。全部真实扫描通过，无删除原始/备份文件。上次8255242是仅普通文件字节，不冲突。

下一步优先把已验证组合接到公共Composition的维护会话和批次删除HTTP/UI，别继续只添孤立适配器。应在排他内打开额外数据库连接，构建factory，用BatchDeletions执行预览/二次确认/恢复，finally关闭连接；journal首次创建须在维护内（否则空journal会被pending检测拒绝）。源码保护要包括全部projectStore历史directory及旧scenario来源；发布根只能明确配置，旧receipt不扩权。检查可选evaluationArtifactsDirectory：默认TrustedProjectEvaluator临时目录finally清理，保留目录若启用需补归属或明确拒绝不完整清单。无审计工作区/DSH home只保留与报告，不猜归属。默认运行root缺失的可选sessions/dsh目录不要误当数据损坏，但恢复scope必须稳定。

仍需HTTP二次确认及前台、启动恢复后队列重启、浏览器/部署回归；C/C++新修订后来源质量、全部门禁与最终发布未完成，目标不能完成。
