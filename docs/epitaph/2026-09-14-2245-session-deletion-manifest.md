# CodeAgent会话清理与DSH备份审计

目标active，/tmp/domain-knowledge-workbench，线上仍d869e1a，未部署/删除用户数据/调用模型；PR50 Draft，不合并。

SessionDeletionManifest从company-codeagent-cli审计以sha256(idempotencyKey).json定位配置的会话根，校验当前sessionId在同键审计中。关联库存runs/wb_stage_tasks；共享或未知共同所有者保护，完全未知归属不读。文件通过pinned O_NOFOLLOW读取并冻结摘要；清单/见证不包含sessionId或原始key，缺文件允许。SqliteRuntimeDeletions增加sessions(rootName,audits)，publicationRoots显式含session根，additional合并工作区和会话。

SessionDeletionTests.log25/25：真实FileCodeAgentSessionStore删除/重试、其他会话和额外文件保留、共享/活跃共同所有者保护、文件变化/审计身份/JSON/符号链接拒绝，加workspace、runtime、发布、恢复、架构回归。SessionDeletionTypes.log与SessionDeletionSpecs.log通过。生产入口尚未接线，尚未开放线上删除。

只读检查不可变pre-deploy-backup/data：readWorkspaceAudits读75条，全部deepseek-harness-sdk，均含workspaceRoot和metadata.runId；agent-workspaces顶层73目录；dsh-configured75目录；无dsh和codeagent/sessions。DSH目录名均匹配既有审计idempotencyKey前24摘要+UUID（75matched/0unknown）。不跟随链接遍历：600普通文件共8255242bytes，36375符号链接；顶层仅.anonymous-user-id、RoleTools.mjs、profiles、role-policy.json、sessions。未输出文件内容或会话标识，未修改备份。大量profiles链接意味着必须单独安全unlink链接本身，不能递归跟随删除依赖。

下一步：DSH临时home文件/链接见证参与者，按审计归属并核对目录结构；处理中途失败无审计须保留/明确报告，不能凭名字猜归属。链接清理用pinned parent+目标摘要/身份检查只unlink叶子，目标依赖必须保留。旧homes全部75可关联是有用证据，不代表生产全覆盖。还需保留evaluationArtifactsDirectory归属、无审计角色目录处理；然后Composition维护会话、HTTP二次确认/UI、恢复后队列及部署回归。C/C++最新修订后的来源质量、门禁及最终发布仍未完成。
