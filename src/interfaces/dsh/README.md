# DeepSeek Harness Adapter

此 Adapter 把 `wp_knowledge_*` 工具注册到需要鉴权的 Knowledge Flywheel HTTP API。它不启动 Python 或 shell，也不判断知识是否可以发布。

<details lang="en">
<summary>English summary</summary>

The DSH adapter only translates `wp_knowledge_*` tool calls to the versioned HTTP API. It has no shell access and no publication authority. Read tools work without a write token; mutation tools fail closed when the token is missing.

</details>

配置：

```text
WP_KNOWLEDGE_URL=http://127.0.0.1:4174
WP_KNOWLEDGE_WRITE_TOKEN=<与 Runner 相同的 token>
```

只读工具不需要写 token。`wp_knowledge_scan` 只能检查服务端预先配置的 acquisition root。未配置 token 时，候选摄取和反馈接口会 fail closed。

DSH 只存在于 Adapter 层；它的类型不能进入 `src/domain` 或 `src/application/services`。旧版基于定时器的 harvester 已删除。调度和恢复属于工作流层，这个 Adapter 只负责把工具请求转换为带版本的 API 调用。
