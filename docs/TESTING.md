# 测试策略

测试的目标不是只得到绿色退出码，而是为 Spec 中的行为、信任边界和恢复语义提供可复现证据。

## 提交门禁

每个 PR 至少执行：

```bash
npm run typecheck
npm run validate:specs
npm test
```

CI 在 Node.js 24 的 Linux 环境重复执行相同门禁。PR 中应记录实际结果；本地未运行的检查必须说明原因。

## 测试层级

| 层级 | 目录/命令 | 主要证明 |
| --- | --- | --- |
| Unit | `npm run test:domain` | 领域规则、Gate、状态转换等纯逻辑 |
| Contract/Architecture | `npm run test:architecture` 与 `tests/contract/` | 依赖方向、目录归属、链接、Schema 和边界约束 |
| Integration | `npm run test:integration` | SQLite/CAS、Application Service、HTTP 等组合行为 |
| Acceptance | `npm run test:acceptance` | 从用户/系统边界观察的端到端闭环 |
| LangGraph integration | `tests/integration/langgraph-infrastructure.test.ts` | 真实 StateGraph 并行、循环、提示词追加和节点投影 |
| Automated flywheel | `tests/acceptance/automated-langgraph-flow.test.ts` | LangGraph 与 Knowledge Registry、真实项目评测和原子发布协同 |
| DSH SDK Adapter | `tests/integration/deepseek-harness-agent.test.ts` | stdin JSON-RPC、Schema 重试、超时、取消、审计脱敏与 Bubblewrap 来源隔离 |
| Agent workspace security | `tests/security/agent-workspace.test.ts` | 角色文件白名单、路径穿越与来源符号链接拒绝 |
| Demo report | `tests/integration/demo-report.test.ts` | Run 证据聚合、CAS 完整性和 Prompt/凭据脱敏 |
| Real-source acceptance | `npm run acceptance:ohmyworkpanel -- ...` | 固定受信源码的失败、Correction、再生成、独立执行和发布 |

`npm test` 运行仓库当前全部 Node 测试，并固定测试并发以避免共享运行目录互相干扰。

需要汇报当前框架机制而不评价真实模型质量时，运行 `npm run evaluate:framework`。它聚合 DDD 边界、七 Agent 拓扑、运行时 Schema、配置冻结、Checkpoint/路由和 Fixture 端到端证据；结果口径见[框架阶段性测评](report/框架阶段性测评.md)。

## 如何选择测试

- 纯领域规则：先写 unit；不要为了方便在 Adapter 测试中复制领域判断。
- Port 或序列化契约：写 contract，覆盖拒绝非法输入的 fail-closed 路径。
- SQLite、CAS、HTTP 或文件系统交互：写 integration，并使用临时目录。
- 用户可见工作流：写 acceptance，并映射到 `AC-*`。
- LangGraph 节点变化：同时断言 graph 路由和稳定的 `WorkflowNodeProjection`，不要让浏览器测试依赖 checkpoint 内部结构。
- 目录、文档入口或规范链接：扩展 `tests/contract/component-layout.test.ts`。

行为变更需要至少覆盖成功路径和最重要的失败路径。涉及 retry、checkpoint、publication 或幂等键时，还要覆盖完全重放与冲突重放。

## 真实源码验收

固定 commit 的 ohMyWorkPanel 验收需要本地仓库包含 `acceptance/ohmyworkpanel/scenario.json` 指定的 Git object：

```bash
npm run acceptance:ohmyworkpanel -- \
  --repository /path/to/ohMyWorkPanel \
  --runtime /tmp/wp-ohmy-acceptance \
  --output summary
```

该验收证明当前编排和受信执行链路，不证明 live 模型质量，也不构成敌对代码隔离测试。若环境不具备固定 commit，应如实标为未运行。

## 测试数据纪律

- 使用临时目录或专用 `WP_FLYWHEEL_HOME`；不读写维护者的真实 `.workpanel/`。
- 不依赖公网、真实密钥或外部 CLI 登录态作为普通门禁。
- deterministic fixture 必须明确标识，不冒充真实模型响应。
- 时间、随机数、工具版本和 Git commit 等影响结果的输入应固定或记录。
- 失败证据应保留足够诊断信息，同时截断和脱敏敏感输出。

验收场景与需求映射见[验收计划](../specs/13-verification/acceptance-plan.md)和[追踪矩阵](../specs/13-verification/traceability-matrix.md)。
