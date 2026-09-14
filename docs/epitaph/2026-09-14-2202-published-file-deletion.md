# 发布文件和索引镜像已纳入删除适配

目标active，/tmp/domain-knowledge-workbench。线上仍d869e1a，未部署/删除用户数据/调用模型；PR50 Draft，38/50不合并。

PublishedDeletionManifest读取对应数据库行并核对库存摘要，三类文件：local_publications_v1复用LocalPublicationContent输出Knowledge.md/Provenance.json；wb_publications用冻结files；wb_card_index用markdownRef和共用knowledgeIndexFilename。收据身份/正文指纹/根目录不一致拒绝，返回相对路径和摘要、不含正文。

PublishedDeletionFiles观察磁盘并生成文件节点，捕获published-deletion-files-v1见证，可重复清理。DeletionFileRoot抽出CAS和发布文件共用scope/句柄unlink逻辑，CasDeletionReader增加受限relative访问。只清理已确认文件，保留用户额外文件、空目录、存储标记及Git；不递归删目录。SQLiteDeletionSnapshot接受published配置并在CAS扫描前后复核文件；有发布/索引记录却未配置范围时拒绝。旧只做CAS的临时审计脚本如今需显式配置发布范围，不能绕过报错继续删除。

PublishedFilesFinalTests.log41/41，PublishedFilesFinalTypes.log通过，含三类真实发布字节、链接/越界/未知文件保留、CAS与文件恢复、原发布/Git本地回归、图及架构。PublishedFilesBackupAudit.json只读临时数据库副本+只读备份文件：2107记录、336CAS（5725914bytes）及4发布文件（28679bytes）全通过，0missing，0unknown tables。逻辑原根固定/root/.local/share/domain-knowledge-mvp/data，物理读取映射部署备份；不将收据任意目录自动授权。测试已确认index文件路径编码与原写入一致。

下一步：生产Composition提供授权根且排除当前源码，接入统一应用的published-files参与者和启动恢复；仍需全写入排他、其他执行目录清理、HTTP二次确认及UI、恢复后队列重启。这些适配器未上线，不声称全文件目录已覆盖。C/C++质量/修订后门禁/最终发布无新进展，仍未完整验收。
