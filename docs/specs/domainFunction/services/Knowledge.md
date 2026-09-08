<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：知识实体与领域服务设计。
-->
# 知识实体与领域服务设计

代码位置：[src/domain/Domain.ts](../../../../src/domain/Domain.ts)、[src/domain/services/FlywheelDomainService.ts](../../../../src/domain/services/FlywheelDomainService.ts)、[src/domain/services/AssociationDomainService.ts](../../../../src/domain/services/AssociationDomainService.ts)、[src/domain/services/MarkdownDiff.ts](../../../../src/domain/services/MarkdownDiff.ts)。


## 实体与不变量

ArtifactRef 以 sha256、大小和媒体类型描述正文。KnowledgeVersion 保存版本身份、moduleId、父版本、正文引用、来源与状态；同模块同正文可去重，修订创建新版本。Run 保存业务状态和当前轮次；非法状态迁移由 Domain 拒绝。

CANDIDATE 是未发布版本；质量评分 ACCEPTED 只表示可进入后续生成和评测。VERIFIED 必须关联有效 Gate 与唯一发布回执；被后继发布替代的版本保留 SUPERSEDED 历史。LOW_CONFIDENCE 保留停止证据。回滚状态仅为迁移兼容，当前不自动选择历史最优并回滚。

FlywheelDomainService 包装创建和生命周期规则；EvalRunnerDomainService 调用确定性 Gate；AssociationDomainService 注入提取与映射策略，验证事实 ID 唯一、引用目标存在、confidence 在 0..1 且 reason 非空，返回数据副本。该领域能力不等于已实现检索 Agent。

## 查询与差异

MarkdownDiff 对正文做结构化行差异，给出段落与范围校验信息；Application QueryService 与内容治理服务提供血缘、关系、评测、来源和反馈投影。查询不改变发布状态。HTTP 管理目录可读取多个状态，消费端若只接受已发布知识必须明确过滤和验证正文。

## 持久化交接

Domain 产生状态、事件、工件描述和 Gate 判定；Application 协调写入，SQLite 实现事务、幂等和约束。领域代码不直接更新数据库。内容评分的现有实现位于 Application QualityPolicy，所属设计在 Application 文档中说明。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
