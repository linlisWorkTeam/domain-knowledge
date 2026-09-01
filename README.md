# Domain Knowledge Agent Framework

TypeScript + LangGraph 的多 Agent 框架骨架。当前版本优先验证编排、并行、循环、Artifact 和 Checkpoint，不提前固化各 Agent 的业务 Prompt。

设计文档入口：[docs/README.md](docs/README.md)。

## 已实现

- 7 类 Agent 节点全部进入实际 LangGraph；
- `DocWorkerAgent × N` 使用 LangGraph `Send` fan-out；
- Test/Doc 两条链路在 Eval 前汇聚；
- 所有有效 Eval 报告经过 ReviewAgent；
- 确定性 Gate 支持 pass、iterate、rollback、stopped、failed；
- Fake Agent/Evaluator、CommandEvaluator；
- 本地 Artifact、SHA-256 和 completion marker；
- InMemory/SQLite Checkpointer；
- Service API 与 CLI；
- 公司 `CodeAgent CLI` Adapter，通过非交互子进程接入，不依赖底层模型 API。
- `configureRunners` Provider 注入接缝，核心包不静态导入任何外部 Agent SDK。

## 快速开始

```bash
npm install
npm test
npm run cli -- run --workers 2
```

运行产物位于 `.agent-runs/{runId}/`，SQLite checkpoint 位于 `.agent-runs/checkpoints.sqlite`。

CLI：

```text
run [--workers N] [--max-iterations N]
    [--codeagent-agent KIND] [--codeagent-cli PATH]
    [--codeagent-timeout-ms N] [--codeagent-bare]
    [--codeagent-dangerously-skip-permissions]
resume <runId>
status <runId>
cancel <runId>
artifacts <runId>
```

## 公司 CodeAgent CLI

CodeAgent 通过 `CompanyCodeAgentCliRunner` 接入，默认先执行 `codeagent auth status --json`
检查 IDAAS 登录，然后使用 `--print --output-format stream-json --verbose` 在节点独立工作目录运行。

例如，只把 DocGenAgent 换成公司 CodeAgent：

```bash
npm run cli -- run --codeagent-agent doc-gen
```

默认使用 `--permission-mode dontAsk`，避免后台任务等待交互授权。以下两个开关必须在确认公司政策后显式开启：

```bash
npm run cli -- run --codeagent-agent doc-gen --codeagent-bare
npm run cli -- run --codeagent-agent doc-gen --codeagent-dangerously-skip-permissions
```

- `--codeagent-bare` 会跳过 hooks、插件等能力，可能也会跳过公司审计链路；
- `--codeagent-dangerously-skip-permissions` 会绕过 CLI 权限检查；
- Check/Review 节点只启用 `Read,Glob,Grep`，Code 节点才启用 `Bash`；
- CLI 工具事件只作为辅助证据，Artifact 以可写目录的执行前后文件快照为准。

## 公司与云端依赖隔离

根包就是公司运行时，仅包含 LangGraph、Fake 和 CodeAgent CLI Adapter；根
`package.json`、`package-lock.json`、`src/` 均不包含 Codex SDK 依赖或静态导入。

```bash
npm ci
npm run build
npm run verify:company
```

Codex 仅存在于独立的可选包 [`providers/codex`](providers/codex)，只在云服务器 Demo 中单独安装：

```bash
npm install --prefix providers/codex
npm --prefix providers/codex test
codex login
npm --prefix providers/codex run demo -- run --codex-agent doc-gen
```

根包的 `files` 白名单不包含 `providers/`，因此生成的公司 npm 发布包也不含 Codex 源码。完整边界和验证方式见 [部署包与 Provider 隔离](docs/06-部署包与Provider隔离.md)。

## 当前边界

WorkspaceProvider 已建立节点独立工作目录和权限清单，但 V1 尚未接入容器/虚拟机级强制沙箱；各 Agent 的 Prompt、ContextBuilder、分块算法、报告 Schema 和真实质量指标仍是后续工作。框架验收范围见 [docs/03-框架测评与验收.md](docs/03-框架测评与验收.md)。
