<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：运行指标持久化设计。
-->
# 运行指标持久化设计

代码位置：[src/infrastructure/observability/SqliteOperationalMetrics.ts](../../../../src/infrastructure/observability/SqliteOperationalMetrics.ts)、[src/application/apps/OperationalMetricsApp.ts](../../../../src/application/apps/OperationalMetricsApp.ts)。


指标 Adapter 保存按 Run、节点、Provider、模型关联的排队与执行耗时、调用次数、重试、Token 和估算成本，提供带窗口与样本口径的聚合。P50/P95 仅基于有效样本；无可信定价时成本为 null，缺数据不当作 0。

指标不保存完整 Prompt、模型正文、凭据或未经处理的上游错误。它们描述执行成本和运行状态，不决定 Gate、知识评分或发布。Application 负责查询、聚合用例与响应口径，SQLite 负责落盘和读取，Console 只消费投影。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
