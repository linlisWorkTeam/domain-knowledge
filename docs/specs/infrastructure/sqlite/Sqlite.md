<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：SQLite 与本地 CAS 设计。
-->
# SQLite 与本地 CAS 设计

代码位置：[src/infrastructure/sqlite/SqliteCas.ts](../../../../src/infrastructure/sqlite/SqliteCas.ts)、[src/infrastructure/sqlite/SqliteContentGovernance.ts](../../../../src/infrastructure/sqlite/SqliteContentGovernance.ts)、[src/infrastructure/sqlite/SqliteActionItems.ts](../../../../src/infrastructure/sqlite/SqliteActionItems.ts)。


SQLiteFlywheelRepository 实现 FlywheelRepository，保存 Run、版本、评测、Gate、发布回执、事件、节点投影、配置和生成 checkpoint。LocalCasArtifactStore 以内容摘要寻址正文，写临时内容后同步并原子落盘；读取和 verify 检查引用与实际字节的一致性。

业务提交先得到工件引用，再把结果、事件与生成 checkpoint 在仓库事务中绑定。生成租约和 generationKey 防止并发重复结果；发布键和事务保证唯一回执并同步版本状态。进程在正文写入后、事务提交前退出时，不能把尚未绑定的工件当成已完成角色结果。

validated_test_suites 以 source_key 唯一保存首个参考校验通过的集合引用，INSERT OR IGNORE 后返回实际胜出的集合；并发调用若输掉竞争，Application 重新验证胜出集合。源码身份与协议兼容规则见 [TestGen](../../domainFunction/agents/testGenAgent/TestGenAgent.md)，旧协议不能通过覆盖缓存或静默重新生成绕过迁移。

路由结果复用既有 generation checkpoint 与 CAS，以 runId/iteration/route-v2 标识；不新增第二个状态机。首次评测、Gate 与 REVIEWING 迁移原子保存；后续按 Run/版本取回既有报告和 Gate 时，Application 校验输入与证据一致性，不因 Run 已进入 ITERATING 而重复记录评测。

SqliteContentGovernance 提供来源、规则修订、血缘、Diff 和评测读模型；SqliteActionItems 根据已持久化事实形成幂等治理事项，revision 冲突拒绝覆盖。这些模块执行存储和投影，不替代 Domain Gate 或创建新的发布通道。

路径由组合根注入，运行数据库和 CAS 不进入 Git。历史记录保持可读，恢复权限由 RunConfiguration 检查。备份与排障操作见 Operations；数据库迁移不能借文档调整更改协议。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
