# JSON Schema

首版 Schema 使用 JSON Schema Draft 2020-12。文件名稳定，`$id` 使用 `https://wpknowledge.local/schemas/.../v1`；破坏性修改新建 v2，不原地改变 v1 语义。

跨文件 `$ref` 必须引用目标 Schema 的绝对 `$id`；校验器加载契约集时必须将本目录全部 Schema 注册到同一 registry，不能依赖当前工作目录碰巧解析相对文件名。Agent 命令和成功结果按 `agentType` 使用封闭的角色 payload，未知字段与角色不匹配均失败；失败结果统一使用 `error` payload。

运行 `npm run validate:specs` 可完成 Draft 2020-12 元校验、跨文件引用解析、角色正反 fixture、Markdown 链接及 P0 追踪矩阵检查。

当前 Agent 命令、结果和语言插件 Schema 是规划中的边界信封，尚未作为运行时 `AgentProvider` 的传输信封。校验夹具必须复用领域层的工件/事件构造器与应用层 `AGENT_IDS`，以保证规划词表不会偏离已经运行的事实；在接入运行时前不得宣称这些信封已被生产路径消费。

| Schema | 用途 |
|---|---|
| `artifact-ref.schema.json` | 不可变 Artifact 引用 |
| `agent-command.schema.json` | 全部 Agent 输入信封与角色 payload |
| `agent-result.schema.json` | 全部 Agent 输出信封 |
| `correction.schema.json` | Review → DocGen 修订指令 |
| `evaluation-report.schema.json` | 确定性评测报告 |
| `event.schema.json` | 领域事件信封 |
| `language-plugin.schema.json` | 插件能力、请求和标准化结果 |
