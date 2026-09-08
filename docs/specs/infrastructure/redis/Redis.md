<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：Redis 运行上下文适配设计。
-->
# Redis 运行上下文适配设计

代码位置：[src/infrastructure/redis/Redis.ts](../../../../src/infrastructure/redis/Redis.ts)、[src/application/ports/ApplicationPorts.ts](../../../../src/application/ports/ApplicationPorts.ts)。


Redis Adapter 实现 AgentContextStore、RunningStateStore 等可重建运行数据端口。上下文只保留轮次、attempt、工件引用和路由等小型数据，单项上限 64 KiB。运行租约使用 ownerId、leaseId 与 TTL 防止旧持有者覆盖新租约，相关 Lua 操作在 Redis 端原子执行。

Redis 不保存唯一知识版本、Gate 或发布回执，不替代 SQLite Registry 或 LangGraph checkpoint。连接、认证与生命周期通过外部配置注入；本地默认组合根未将 Redis 设为执行事实源。断连和过期必须向调用方显式报告，不能虚构租约成功。

契约和租约行为见 RedisRuntimeState 集成测试；支持替换实现不代表已经完成生产 Redis 部署。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
