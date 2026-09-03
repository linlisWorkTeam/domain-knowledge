# ADR-009：运行仓库与知识仓库分离

- 状态：Accepted
- 日期：2026-09-03

## 背景

wpKnowledge 同时保存知识材料和完整运行时代码，导致仓库职责、Pages 发布和贡献入口混在一起。domain-knowledge 已经是多 Agent 工作流仓库，运行时继续留在 wpKnowledge 会让两个仓库都像执行层，也容易出现两套 LangGraph 实现。

## 决策

1. Knowledge Flywheel 的代码、Spec、测试、Console 和部署配置迁到 domain-knowledge 根目录。
2. wpKnowledge 只保存知识正文、研究、设计材料、运行证据和索引。
3. domain-knowledge 的 Registry/CAS 负责运行状态、版本、评测和发布事务；wpKnowledge 不运行服务，也不维护数据库。
4. `WP_KNOWLEDGE_REPOSITORY` 可以把摄取与扫描根目录指向本地 wpKnowledge 检出；运行目录仍属于 domain-knowledge。
5. Git 知识发布与运行时 `VERIFIED` 发布暂时分开。自动创建 wpKnowledge PR 属于后续 Adapter，不在本次迁移中假装实现。
6. wpKnowledge PR #27 的运行时修改迁入本仓库；其中知识调研和验收记录继续留在 wpKnowledge。

## 结果

代码只有一个演进位置，知识仓库也不再承担构建依赖。代价是两个仓库之间需要清晰链接，并且 `VERIFIED` 结果进入 Git 仍要人工创建 PR。未来若实现 Git Publication Adapter，它只能消费已经通过发布 Gate 的结果，不能绕过 Registry 中的事务和证据检查。

<details lang="en">
<summary>English summary</summary>

domain-knowledge is the sole runtime repository; wpKnowledge is the reviewed content and evidence repository. Runtime publication remains authoritative in the local Registry/CAS. Writing verified content back to Git requires a future adapter and is not claimed as part of this migration.

</details>
