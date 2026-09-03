# ADR-005：标准协议与 Adapter

- 状态：Proposed（有实际消费者时再接受）
- 日期：2026-08-31

## 决策

当前 DSH 只通过版本化本地 HTTP API Adapter 使用知识服务，不通过 shell 或 Python CLI。MCP、ACP、A2A 只有在出现明确消费者、权限模型和契约测试后才进入具体 Adapter；核心始终只依赖端口。

## 后果

避免为了协议而扩张 P0 范围。未来协议升级和错误映射被隔离在 Adapter，失败时可替换而不污染核心。
