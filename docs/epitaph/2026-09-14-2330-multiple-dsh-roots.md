# 多套DSH根可共用删除计划

目标active，/tmp/domain-knowledge-workbench。网站仍d869e1a，未部署/删除用户数据/调用模型，PR50 Draft，不合并。

DshHomeDeletionFiles构造新增稳定name（默认dsh-homes），节点ID及选择/见证检查绑定该命名空间。SqliteRuntimeDeletions.dshHomes改为roots记录：每个根独立文件参与者/目录scope/持久见证，同一计划同时覆盖全部根。聚合限制全部根10万entries/128MiB，不按根放大。根配置复制避免外部字典变化越过边界。RuntimeDeletionOperations固定dsh-homes→runtime/dsh、dsh-homes-configured→runtime/dsh-configured，在校验后创建空目录，不再根据有无文件动态切换参与者，也不因两套非空而拒绝。旧单根见证的参与者集合若不同会拒绝跨契约恢复；当前线上从未启用删除，不存在该旧接口线上意图。

/tmp/MultiDshTests.log20/20，MultiDshTypes.log和MultiDshSpecs.log通过。真实HTTP用真实legacy run+两套home+阶段材料manifest+审计：两root进入计划，第二root清理注入故障返回202 CLEANUP_PENDING，第一root文件已消失，恢复后第二root成功；准备/提交时间不变，外部依赖文件保留。跨namespace交换见证拒绝。其余接口/单根/存储组合/跨库恢复/架构回归通过。没有改前台，本轮未重复全Console（上一提交31+删除专项3已通过）。

PR50 body更新文件/tmp/Pr50MultiDshBody.md。查过上一head84d738b的verify工作流34857243249仍IN_PROGRESS；推送新提交后需查询新head检查，不能沿用旧状态。上一head已交付真实删除HTTP/UI与恢复页面，截图在/root/projects/domain-knowledge-releases/2026-09-14-delete-ui-evidence。

下一步优先核对新head CI并准备当前网站更新：当前服务仍旧d869e1a无运行目录锁，部署须先停止旧服务再启动新服务，备份当前data并保留tunnel/work/ljy；不得自动删除用户历史，前台二次确认才执行。生产默认单当前发布根可用；历史多发布目录授权仍需补齐，独立保留evaluationArtifactsDirectory也仍明确拒绝（普通服务器入口未设置此调试选项，默认临时评测目录自动清理）。这些限制不能冒充全goal完成。

C/C++最新修订后来源质量、可信/固定门禁与最终发布仍未通过，全任务仍active。真实驱动恢复前需检查原PID/日志和冻结taskId，不另起重复任务；公开网站新后端尚未更新。
