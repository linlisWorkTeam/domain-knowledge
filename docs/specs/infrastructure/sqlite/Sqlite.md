<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：SQLite 与本地 CAS 设计。
-->
# SQLite 与本地 CAS 设计

代码位置：[src/infrastructure/sqlite/SqliteCas.ts](../../../../src/infrastructure/sqlite/SqliteCas.ts)、[src/infrastructure/sqlite/SqliteContentGovernance.ts](../../../../src/infrastructure/sqlite/SqliteContentGovernance.ts)、[src/infrastructure/sqlite/SqliteActionItems.ts](../../../../src/infrastructure/sqlite/SqliteActionItems.ts)。


SQLiteFlywheelRepository 实现 FlywheelRepository，保存 Run、版本、评测、Gate、发布回执、事件、节点投影、配置和生成 checkpoint。LocalCasArtifactStore 以内容摘要寻址正文，写临时内容后同步并原子落盘；读取和 verify 检查引用与实际字节的一致性。

业务提交先得到工件引用，再把结果、事件与生成 checkpoint 在仓库事务中绑定。生成租约和 generationKey 防止并发重复结果；发布键和事务保证唯一回执并同步版本状态。进程在正文写入后、事务提交前退出时，不能把尚未绑定的工件当成已完成角色结果。

SqliteContentGovernance 提供来源、规则修订、血缘、Diff 和评测读模型；SqliteActionItems 根据已持久化事实形成幂等治理事项，revision 冲突拒绝覆盖。这些模块执行存储和投影，不替代 Domain Gate 或创建新的发布通道。

路径由组合根注入，运行数据库和 CAS 不进入 Git。历史记录保持可读，恢复权限由 RunConfiguration 检查。备份与排障操作见 Operations；数据库迁移不能借文档调整更改协议。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。

## 可恢复 Markdown 发布

`LocalMarkdownPublisher` 使用独立 `publications.sqlite`，表名 `local_publications_v1` 与输出信封 `schemaVersion: 1.0` 显式版本化。先将内容指纹、原始授权材料和 PENDING 收据以 SQLite FULL 同步持久化，再将 Markdown 与来源 JSON 写入同目录临时版本目录，fsync 后原子 rename，最后将收据改为 PUBLISHED。重试沿用原路径、时间、输入指纹与正文摘要；已存在的不同内容拒绝覆盖。

恢复只处理已有授权的 PENDING 日志，不推断候选状态。知识目录只接受授权服务器根下独立的空目录，拒绝源码目录交叠和符号链接越界。Git 仓库必须属于该知识目录，仅精确 add 已发布文件，忽略无关未跟踪文件，拒绝包含无关跟踪文件的仓库。默认不同步，手动同步限制时长并禁止强推；冲突和认证失败不回滚本地发布。Git 令牌不出现在设置读取模型、日志或发行物中。

Git fetch 后、任何 merge 前读取远端完整树，拒绝非允许路径和非普通文件模式，逐字节比较所有远端已发布正文/来源与本地已核验工件；共同祖先已有的发布文件不得在远端删除。本地新增发布尚未出现在远端可以继续同步。远端内容污染返回 `GIT_REMOTE_CONTENT_DENIED`，不快进、不覆盖本地文件，SQLite 发布状态保留；操作者恢复远端后可以重试。
