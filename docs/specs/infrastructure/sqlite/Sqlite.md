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
