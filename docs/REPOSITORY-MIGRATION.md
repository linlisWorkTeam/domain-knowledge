# 从 wpKnowledge 拆出运行仓库

2026 年 9 月，Knowledge Flywheel 的代码从 `wpKnowledge/endlessWpKnowledgeRunner/` 迁到本仓库根目录。迁移不是复制一份长期维护的镜像：合并后，运行时只在 domain-knowledge 演进，wpKnowledge 只保存知识内容和证据。

## 迁移基线

- wpKnowledge 已合并基线：`63e6170`；
- wpKnowledge 开放 PR：[#27 重构知识飞轮目录与中文界面](https://github.com/linlisWorkTeam/wpKnowledge/pull/27)；
- PR #27 代码基线：`4e7695d`；
- domain-knowledge 迁移前基线：`68b0fde`。

迁移采用 PR #27 的最终目录和修复，因此包含 DDD 四层布局、自然中文界面、环境文件读取，以及该 PR 中对 Provider、评测器、Checkpoint、Gate 和发布事务的修复。PR #27 的调研、验收记录仍进入 wpKnowledge；代码、Spec 和工程文档进入本仓库。

## 路径映射

| 原路径 | 新路径 |
| --- | --- |
| `endlessWpKnowledgeRunner/src/domain/` | `src/domain/` |
| `endlessWpKnowledgeRunner/src/application/` | `src/application/` |
| `endlessWpKnowledgeRunner/src/infrastructure/` | `src/infrastructure/` |
| `endlessWpKnowledgeRunner/src/interfaces/` | `src/interfaces/` |
| `endlessWpKnowledgeRunner/{docs,specs,tests}` | `{docs,specs,tests}` |
| `endlessWpKnowledgeRunner/{web,site,deploy,acceptance}` | `{web,site,deploy,acceptance}` |

domain-knowledge 原来的实验框架没有继续作为第二套源码保留。它的提交历史仍在本仓库，迁移前状态可从 `68b0fde` 检出。新的 `src/infrastructure/workflow/langgraph/` 承接拓扑、并行、循环和 Checkpoint；治理状态与发布事务由同仓库的 Domain/Application 层负责。

## 本地知识仓库

推荐把两个仓库放在同一父目录：

```text
workspace/
├── domain-knowledge/
└── wpKnowledge/
```

启动前设置：

```bash
export WP_KNOWLEDGE_REPOSITORY="$(cd ../wpKnowledge && pwd)"
```

这个变量决定 CLI 摄取、迁移和扫描时的允许根目录。`.workpanel/` 始终留在 domain-knowledge，避免把数据库和 Agent 临时工作区写进知识仓库。自动把 `VERIFIED` 内容提交到 wpKnowledge 尚未实现；现在仍由贡献者整理文件并提交知识 PR。

<details lang="en">
<summary>English summary</summary>

The executable Knowledge Flywheel moved from wpKnowledge/endlessWpKnowledgeRunner to the domain-knowledge repository root. Runtime code and specs now evolve here, while reviewed knowledge and evidence remain in wpKnowledge. The migration includes the open wpKnowledge PR #27 changes; the previous domain-knowledge implementation remains available through Git history at commit 68b0fde.

</details>
