# 知识生命周期

```mermaid
flowchart TD
    Ingest["Ingest"] --> Candidate["CANDIDATE"]
    Candidate --> Quality["Quality Gate"]
    Quality --> Accepted["ACCEPTED"]
    Accepted --> Workflow["Agent Workflow"]
    Workflow --> Evaluation["Independent Evaluation"]
    Evaluation --> Gate["Publication Gate"]
    Gate --> Iterate["ITERATE"]
    Gate --> Rollback["ROLLBACK"]
    Gate --> Stopped["STOPPED"]
    Gate -->|PASS| Publish["原子发布成功 / 发布回执"]
    Publish --> Verified["VERIFIED"]
    User["用户"] --> App["Application: KnowledgeSearchApp"]
    App -->|直接调度| Search["SearchAgent：待实现"]
    Search -->|受控只读检索| Verified
    Search -->|命中文档与引用| App
    App -->|检索结果| User
```

`ACCEPTED` 只表示候选具备进入行为评测的条件；只有完整证据通过发布 Gate 并完成原子发布，才能进入 `VERIFIED`。

SearchAgent 只读取当前仍为 `VERIFIED` 且正文完整性有效的已发布文档，不消费候选或已替代版本。它由 Application 直接调度，不参与图中的治理状态迁移，也不在无命中时自动生成文档；检索能力当前处于设计阶段。
