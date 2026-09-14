# 批次删除已接通HTTP与Console，尚未部署

目标active。独立/tmp/domain-knowledge-workbench，线上仍d869e1a，PR50 Draft，不合并38/50；本轮无生产删除、模型调用或部署。

RuntimeDeletionOperations在maintenance独占会话内：获取当前/历史projectStore目录和已提交project-scenario来源保护；验证输出目录；打开registry/workbench/legacy/graph/journal额外连接；组装SqliteRuntimeDeletions后调用BatchDeletions，finally关闭额外连接。目标ID复用sqliteDeletionRecordId。initializeDeletionRecoveryJournal提取公共初始化，空journal失败不会永久封锁。固定路径index/card-index、publications、cas、当前legacy目录、agent-workspaces、codeagent/sessions、单个有数据的dsh或dsh-configured；必要空目录在范围校验后创建保证恢复scope。多个DSH根同时非空、独立保留evaluationArtifactsDirectory非空均明确拒绝，当前配置外历史发布目录也拒绝，不静默漏清理。

HTTP /api/v1/batch-deletions：GET pending、POST /{runs|batches}/:id/{preview|confirm|recover}及POST /recover{planId}。特殊路由在普通operation.enter前交给删除维护会话；本地也沿用写鉴权，免登录模式可用。confirm仅原planId+confirmed:true；200 DELETED，202 pending。恢复只推进已确认意图，不新建范围；完成后recover阶段/流程并tick批次。维护与范围错误中文返回，不泄漏底层路径/内容。

web/BatchDeletion.js共享弹窗：第一次点击读预览，第二次确认删除；取消不动数据，部分提交转继续删除；响应丢失可原确认重试。App旧run详情及ModuleBatches所选批次按钮接入。boot先读maintenance，RECOVERY_REQUIRED显示恢复入口，完成后重载工作台。不能删除运行中的批次。窄屏确认操作可见，提交中阻止关闭。

验证：/tmp/DeletionEndpointTests.log35/35，类型/Spec通过；/tmp/DeletionConsoleRegression.log31/31（原Console29+新增删除2）；新增模块项目删除后/tmp/DeletionBrowserTests.log3/3（旧run取消/确认/窄屏、持久故障重载恢复、真实本地C项目模块删除且源文件保留）。受控SQLite触发器导致部分提交用于恢复验收，不是线上故障。截图和上述日志已复制/root/projects/domain-knowledge-releases/2026-09-14-delete-ui-evidence；已查看窄屏截图。当前站点仍旧版，不能声称在线可删除。

下一步：提交推送PR50并更新body（/tmp/Pr50DeletionEndpointsBody.md已准备，如已完成看Git）；补明确拒绝的多DSH根/保留评测目录/历史发布目录授权范围，不能把这些限制当全goal完成。适当全面回归和当前服务停机备份后部署（旧服务无进程锁，必须先停止再新版本启动，保留现有tunnel/work/ljy）。部署不能自动删除用户历史，实际删除由前台二次确认。C/C++新修订后的来源质量、全部门禁和最终发布仍未完成；不要重启旧真实驱动，先查具体PID/日志及冻结任务。整体目标继续active。
