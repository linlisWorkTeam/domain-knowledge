# ADR-001：TypeScript 平台与六边形边界

- 状态：Accepted
- 日期：2026-08-31

## 决策

V1 平台使用 TypeScript；领域与应用通过端口依赖 Agent、Workflow、Store、Sandbox 和语言插件。SDK 类型只能存在于 Adapter。

## 后果

可替换供应商并用架构测试守住边界；需要维护显式映射。DSH SDK 和语言工具链类型不得进入领域模型。
