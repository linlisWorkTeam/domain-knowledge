<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：事实提取与目标关联的领域设计。
-->
# 事实关联设计

代码位置：[AssociationDomainService.ts](../../../../../src/domain/services/association/AssociationDomainService.ts)。

本服务位于 `services/association`，向 Application 提供关联能力。DocWorkerAgent 属于内部源码分析角色，其事实工件用于 DocGen；本服务当前不调用 DocWorker，也不重复角色的 Prompt、模型步骤或源码引用校验。

输入包含正文、来源、候选目标和显式注入的提取与映射策略。领域服务先校验正文与来源非空，提取事实并检查 factId 非空且唯一，再将事实映射到候选目标。

每条关联必须引用已提取的事实和已提供的目标，confidence 在 0..1 范围，reason 非空。失败直接拒绝结果；成功返回事实和关联的数据副本。Application 协调调用与持久化，本模块不访问数据库或模型 SDK。

当前能力是已有策略的领域校验边界，不表示已实现 SearchAgent 或检索链。调用入口见 [Application 设计](../../../application/Application.md)，修改步骤见 [开发指南](../../../../Development.md)。
