# 测试策略

测试的目标不是只得到绿色退出码，而是为 Spec 中的行为、信任边界和恢复语义提供可复现证据。

## 提交门禁

涉及代码、配置或测试的 PR 执行：

```bash
npm run typecheck
npm run validate:specs
npm test
```

CI 在 Node.js 24 的 Linux 环境执行上述门禁及 `npm run test:ui`。仅修改根目录 Markdown 或 `docs/`、`specs/` 内 Markdown 的 PR 执行 `npm run validate:specs` 和 `node --test tests/contract/*.test.ts`，跳过类型检查、全量 Node 测试和浏览器安装/测试。混合改动、其他路径及手动触发均执行完整检查。

CI 只在 PR 更新时自动运行，合入 main 后不再重复执行；直接推送 main 也不会自动检查，需要在 Actions 手动运行 CI。`verify` 检查名称保持不变，新的 PR 提交会取消旧运行。网站部署也改为手动触发，启用 Pages 后按需运行。PR 中应记录实际结果；本地未运行的检查必须说明原因。

## 测试层级

以下是当前仓库已有测试。下一阶段 [DEV-019](../../specs/changes/active/DEV-019-dsh-agent-foundation/acceptance.md) 分别验收底座范例与外部完整闭环：先在普通 CPU 小模块上真实运行一个 DSH 角色，证明开发接线可复用；七角色实际协作和发布另行验收。Pi 或固定场景回归通过不表示新底座已完成，公司 CLI live 后置。CPU 范例也不替代既有 C++ 语言插件与权限门槛。

| 层级 | 目录/命令 | 主要证明 |
| --- | --- | --- |
| Unit | `npm run test:domain` | 领域规则、Gate、状态转换等纯逻辑 |
| Contract/Architecture | `npm run test:architecture` 与 `tests/contract/` | 依赖方向、目录归属、链接、Schema 和边界约束 |
| Integration | `npm run test:integration` | SQLite/CAS、Application Service、HTTP 等组合行为 |
| Acceptance | `npm run test:acceptance` | 从用户/系统边界观察的端到端闭环 |
| LangGraph integration | `tests/integration/langgraph-infrastructure.test.ts` | 真实 StateGraph 并行、循环、提示词追加和节点投影 |
| Automated flywheel | `tests/acceptance/automated-langgraph-flow.test.ts` | LangGraph 与 Knowledge Registry、真实项目评测和原子发布协同 |
| DSH SDK Adapter | `tests/integration/deepseek-harness-agent.test.ts` | stdin JSON-RPC、Schema 重试、超时、取消、审计脱敏与 Bubblewrap 来源隔离 |
| Company CLI Adapter | `tests/integration/company-codeagent-cli.test.ts` | 现有自建协议夹具；不证明实际 CLI 参数、认证、会话或文件权限兼容 |
| Agent workspace security | `tests/security/agent-workspace.test.ts` | 角色文件白名单、路径穿越与来源符号链接拒绝 |
| Demo report | `tests/integration/demo-report.test.ts` | Run 证据聚合、CAS 完整性和 Prompt/凭据脱敏 |
| Real-source acceptance | `tests/acceptance/real-source-flow.test.ts` | 固定受信源码的失败、Correction、再生成、独立执行和发布 |

`npm test` 运行仓库当前全部 Node 测试，并固定测试并发以避免共享运行目录互相干扰。

需要汇报当前框架机制而不评价真实模型质量时，运行 `npm run evaluate:framework`。它聚合 DDD 边界、七 Agent 拓扑、运行时 Schema、配置冻结、Checkpoint/路由和 Fixture 端到端证据；结果口径见[框架阶段性测评](../status/reports/框架阶段性测评.md)。

## 如何选择测试

- 纯领域规则：先写 unit；不要为了方便在 Adapter 测试中复制领域判断。
- Port 或序列化契约：写 contract，覆盖拒绝非法输入的 fail-closed 路径。
- SQLite、CAS、HTTP 或文件系统交互：写 integration，并使用临时目录。
- 用户可见工作流：写 acceptance，并映射到 `AC-*`。
- LangGraph 节点变化：同时断言 graph 路由和稳定的 `WorkflowNodeProjection`，不要让浏览器测试依赖 checkpoint 内部结构。
- 目录、文档入口或规范链接：扩展 `tests/contract/component-layout.test.ts`。

行为变更需要至少覆盖成功路径和最重要的失败路径。涉及 retry、checkpoint、publication 或幂等键时，还要覆盖完全重放与冲突重放。

## 真实源码验收

自动回归在临时目录创建独立的最小 Git 项目，不依赖外部 WorkPanel 仓库、固定预写资产目录或真实密钥：

```bash
node --test tests/acceptance/real-source-flow.test.ts tests/acceptance/automated-langgraph-flow.test.ts
```

真实 DSH 验收通过 `workflow-run --scenario /path/to/scenario.json --repository /path/to/project` 使用显式可信项目。场景固定 commit、公开接口、可生成路径与命令；测试必须非空，失败归因和修订路径必须可复验。底座 CPU 范例使用 `npm run example:docgen -- prepare|run|check`，完整闭环按 DEV-019 R3/R4 验收。未执行 live 验收不得标为通过。

## 测试数据纪律

- 使用临时目录或专用 `WP_FLYWHEEL_HOME`；不读写维护者的真实 `.workpanel/`。
- 不依赖公网、真实密钥或外部 CLI 登录态作为普通门禁。
- deterministic fixture 必须明确标识，不冒充真实模型响应。
- 时间、随机数、工具版本和 Git commit 等影响结果的输入应固定或记录。
- 失败证据应保留足够诊断信息，同时截断和脱敏敏感输出。

验收场景与需求映射见[验收计划](../../specs/13-verification/acceptance-plan.md)和[追踪矩阵](../../specs/13-verification/traceability-matrix.md)。
