# 部署包与 Provider 隔离

## 1. 目标

公司环境只能通过 CodeAgent CLI 使用内部模型，不能安装、加载或静默降级到 Codex。云服务器 Demo 仍可使用 Codex 登录额度。

## 2. 物理边界

```text
根包 domain-knowledge-agent-framework
├── LangGraph 核心图
├── AgentRunner 接口
├── FakeAgentRunner
└── CompanyCodeAgentCliRunner

providers/codex
├── CodexAgentRunner
├── Codex 登录检查
└── @openai/codex-sdk
```

核心通过 `RuntimeOptions.configureRunners` 接受外部 Provider 注入，不导入 Provider 源码。这保证了 Agent 后端替换不改变图拓扑、GraphState、Gate 和 checkpoint。

## 3. 公司安装

在仓库根目录执行：

```bash
npm ci
npm run build
npm run verify:company
npm test
```

根 `package-lock.json` 不包含 `@openai/codex-sdk` 或 `@openai/codex`。`verify:company` 同时检查根 manifest、锁文件、核心源码和 npm 发布白名单。

如果公司政策连仓库中的可选 Provider 源码也不允许出现，不应直接分发完整 Git 工作树；应使用根 `package.json` 的 `files` 白名单生成公司发布包。

## 4. 云端 Codex Demo

Codex 依赖使用独立 manifest 和锁文件：

```bash
npm install --prefix providers/codex
npm --prefix providers/codex test
codex login
npm --prefix providers/codex run demo -- run --codex-agent doc-gen
```

不允许在根 `package.json` 中重新添加 Codex SDK，也不允许核心 `src/` 静态导入 `providers/codex`。

## 5. 验收标准

- 根 `npm ci` 后 `@openai/codex-sdk` 不存在于依赖树；
- 根 `package-lock.json` 不包含 Codex 包；
- 根 `npm run verify:company` 通过；
- 根 npm 发布包不包含 `providers/`；
- `providers/codex` 可独立安装、构建和注入一个代表节点；
- 两种部署均不修改 LangGraph 节点和边。
