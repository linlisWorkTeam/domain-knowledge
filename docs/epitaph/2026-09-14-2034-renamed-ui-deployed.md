# 新名称和发布折叠已部署

目标active，本轮progress。独立树/tmp/domain-knowledge-workbench，原用户树不动。d869e1a已推50并部署；PR保持Draft，未处理38/50合并。CI34843360221全部成功627代码、41Console、25验收，/tmp/WorkbenchD869CiPassed.log。新导航“知识飞轮管理”“知识治理”，发布设置默认折叠/自动加载/悬停说明，视口放大导航修复均在公网上验证。/tmp/WorkbenchD869Browser.log，发行browser截图已查看并同步报告。原8run/1card、免登录写入不变，模型配置仍未验证。

当前Console PID131134，app=/root/projects/domain-knowledge-releases/2026-09-14-workbench-d869e1a/app，local4310，原https://contract-strict-warren-theories.trycloudflare.com/。tmux mvp-console-review、mvp-console-tunnel、work、ljy保留。独立npm ci依赖；完整backup在新发行pre-deploy-backup，保留符号链接。/tmp/DeployWorkbenchD869.py硬编码已退出的113062不可再直接跑。仅删本轮从未启用的875a210发布副本，检查无进程、无运行备份后清理；用户数据、旧启用发行/备份全保留。磁盘约1.5GiB剩余，后续注意缓存体积。

本轮修复Console主题用例遗漏的/^知识$/定位。全量本地40过1失败，修正后1/1；远端最终41/41。d869新增SqliteBatchDeletions回执适配器：给定同连接投影的记录删除+回执事务提交，清理失败持久pending/尝试次数，重启继续并在同实例合并并发清理。两个真实SQLite集成通过，/tmp/DeletionSqliteTests.log；类型与Spec通过。没有完整业务投影、文件适配器或HTTP/删除按钮，不能声称历史批次已可删除。尤其当前适配器只证明单库事务，不能把ATTACH多个WAL库当作断电原子，未来跨库要持久恢复协议。

只读核对线上3个SQLite：registry有8run、10knowledge_versions、8evaluation、8gate、495events、112checkpoints、124node、74provider_invocations；publications有2本地发布和1配置；workbench无任务/项目/批次。/tmp/DeletionRuntimeInventoryTables.json只有表计数无配置内容。页面1卡是10历史版本聚合。后续删除需明确归属/共享引用、保留编号与预算墓碑及必要审计；不可以只隐藏列表。CAS、卡片索引和发布文件必须受引用保护并可恢复清理，开发测试仅临时数据。

原始目标其余未完成：完整历史删除；独立阶段与模块批次归属/调度统一核对；C来源修订3卡通过1卡未知（见2018及报告，原335refs完整），新版本需要重建与可信/固定/来源门禁；C++当前引擎完整来源和最终发布。无模型任务在本轮启动，不降门禁、不删可信预期、不主动搜索。完成后再依用户要求比较处理38/50。
