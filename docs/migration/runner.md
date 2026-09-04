# 从旧版 Runner 迁移

> 中文是本文默认语言。命令、目录和状态值保留英文。

<details lang="en">
<summary>English summary</summary>

The TypeScript runtime replaces the former Python runner with separated domain, application and adapter layers. Legacy cards are imported as `CANDIDATE`, even when their old frontmatter said `verified`; only new behavioral evidence and a `PASS` decision may publish a `VERIFIED` version.

</details>

## 主要变化

旧 Python 系统把摄取、文档评分、状态、存储、反馈、调度、DSH shell 执行和 Dashboard 写操作放在一起，还通过目录和 frontmatter 表示状态。文档分数足够高时，它会直接把内容提升为 `verified`。

新实现把这些职责拆到 domain、application、port 和 adapter。SQLite/CAS 是当前运行时事实源；`knowledge/` 继续作为经 Git 评审的资料和导入格式。

## 一次性导入

1. 保留现有 `knowledge/` 目录，并确保它受版本控制。
2. 使用空的运行目录，或先备份 `.workpanel/`。
3. 在仓库根目录运行：

```powershell
npm install
npm run knowledge -- migrate-legacy --root knowledge
npm run knowledge -- status
```

导入器使用维护中的 `yaml` 包，读取 `knowledge/concepts/` 和 `knowledge/drafts/`。它会保留旧状态与版本元数据，并写入 `requiresBehavioralVerification: true`。旧卡片即使标过 `verified`，导入后仍是 `CANDIDATE`；只有新 Run 提供真实执行证据并获得 `PASS`，才能发布。

导入操作是幂等的：同一 `moduleId + body artifact` 再次导入时，会返回既有 `KnowledgeVersion`。

## 发布 VERIFIED 版本

创建 Run，将它推进到 `EVALUATING`，绑定不可变测试报告，再使用对应的 `PASS` 决定发布。完整命令见[运维手册](../OPERATIONS.md)。

## 回滚

切换前请保留旧 Git commit 和运行目录。新运行时的数据单独放在 `.workpanel/`；删除这个本地目录即可回到导入前的运行状态，不会修改 `knowledge/`。

回滚后也不要恢复旧 `verified` 语义。旧状态只代表文档质量验收，不代表行为已经验证。
