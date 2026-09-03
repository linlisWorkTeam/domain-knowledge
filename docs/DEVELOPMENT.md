# 开发指南

## 开发基线

从仓库根目录开始：

```bash
npm ci
npm run typecheck
npm test
```

要求 Node.js 24+。运行数据默认写入 `.workpanel/`；开发和测试不得把该目录、SQLite 文件或 CAS 工件提交到 Git。

## 依赖方向

```text
uiApi / CLI / DSH / Web projection
                 │
                 ▼
            Application Apps
  Orchestrator / Flywheel / EvalRunner
       Search / Discovery
                 │
        ┌────────┴────────┐
        ▼                 ▼
      Domain            Ports
        ▲                 ▲
 SQLite / CAS      domain-knowledge infrastructure
                    (LangGraph / checkpoints)
```

- `src/domain`：领域实体、状态和 Flywheel/EvalRunner/Association 纯领域服务；不能导入 Adapter、数据库或工作流 SDK。
- `src/application/apps`：Orchestrator、Flywheel、EvalRunner、KnowledgeSearch、KnowledgeDiscovery 五个用例入口。
- `src/application/services`：App 使用的用例协调服务；只能依赖 Domain 和 Port，不能直接依赖具体 SQLite、HTTP、模型或编译器。
- `src/infrastructure`：实现知识登记簿、内容寻址存储、智能体、外部适配和项目评测等技术边界。
- `src/infrastructure/workflow/langgraph`：相对独立的 LangGraph 图、运行时和固定 Agent 定义；不能拥有 KnowledgeVersion、评测或发布事务。
- `src/interfaces/ui-api`：UI/HTTP 的正式入站入口，只调用 Application App。
- `src/interfaces/runner`：组合根、CLI、兼容 HTTP Server 和 Console read model。
- `web`：浏览器界面；不能复制状态机或发布判断。

架构契约由自动化测试保护，详细语义见[架构说明](ARCHITECTURE.md)。

## 修改流程

### 修改产品行为

1. 在 [`../specs/`](../specs/README.md) 定位需求 ID 和用例。
2. 补充或调整可验收行为、异常路径与权限边界。
3. 更新追踪矩阵中的实现和测试映射。
4. 从 Domain/Application 边界实现，再接入 Adapter 和入口。
5. 增加最窄且足够的测试，最后同步上手或运维文档。

### 增加 HTTP 或 CLI 能力

- 优先调用现有 Application Service；入口层只做解析、鉴权和结果映射。
- 版本化 API 使用 `/api/v1`；`/health` 只用于进程探针。
- 写接口必须在未配置令牌时默认拒绝。项目根目录的 `.env.example` 是可提交样例；本地开发复制为 `.env.local` 后由 `npm run knowledge:serve` 自动读取。
- 不在 Console 中用一串原始 transition 请求模拟 Orchestrator。

### 增加 Agent 或 Evaluator

- 输入输出遵循 `specs/schemas/` JSON Schema；大对象通过 ArtifactRef 传递。
- Agent 输出必须先做 schema validation，再进入领域流程。
- 独立评测器不能复用被评代码的自报结果作为通过证据。
- 外部命令避免 shell，限制工具、环境、路径、超时和输出；这些限制仍不能替代 OS 沙箱。
- 固定图节点只允许通过 `promptAddon` 定制。职责、输入输出、拓扑和工具权限的变化属于契约变更，必须修改 Spec、Schema、实现和测试，不能由前台配置绕过。

### 修改前台

- 先对齐[前台产品设计](../specs/04-product/frontend-product-design.md)和[用户用例](../specs/05-workflows/user-use-cases.md)。
- Console read model 位于 `src/interfaces/runner/console-read-model.ts`，写操作必须经过共享应用服务。
- 未实现的自动化能力应呈现真实状态，不制作会绕过权限边界的假按钮。

### 大规模特性

任何跨层特性都要逐项检查 Console、GitHub Pages 静态网站、工程文档、Spec、追踪矩阵和验收证据。若某个界面不受影响，也要在 PR 说明原因；不能只更新代码，让对外说明与实现分叉。新增或重写文档时还要遵循[文档语言与 I18n 约定](DOCUMENTATION-I18N.md)。

## 配置与调试

常用环境变量：

| 变量 | 用途 |
| --- | --- |
| `WP_FLYWHEEL_HOME` | 覆盖 SQLite/CAS 运行目录 |
| `WP_KNOWLEDGE_HOST` | 覆盖 HTTP 监听地址 |
| `WP_KNOWLEDGE_PORT` | 覆盖 HTTP 端口 |
| `WP_KNOWLEDGE_WRITE_TOKEN` | 启用受保护写 API |

Redis Adapter 位于 `src/infrastructure/persistence/redis`，对应 `AgentContextStore` 和 `RunningStateStore`。Agent Context 只保存轮次、attempt、ArtifactRef 和路由等可重建状态，单条上限 64 KiB；运行租约使用 ownerId + leaseId 做 fencing。当前本地组合根仍使用 SQLite Checkpoint 和进程内运行表；在 Redis 的地址、认证、TTL、故障语义确定前，不要把它设为业务事实源或绕过 Registry。

为每个实验使用独立 `WP_FLYWHEEL_HOME`，可以避免开发数据互相污染。配置默认值见 [`../runner.config.json`](../runner.config.json)。需要启用本地写入时，从仓库根目录执行 `copy .env.example .env.local`，将 `WP_KNOWLEDGE_WRITE_TOKEN` 的占位值换成随机长令牌，再重启 `npm run knowledge:serve`。`.env.local` 已被 Git 忽略，不得提交。

## 完成定义

一次行为变更只有在以下内容一致时才完成：

- Spec 和追踪矩阵；
- Domain/Application/Adapter 实现；
- 正常、失败、重试或权限边界测试；
- 用户、开发或运维文档；
- 中文主文与关键 English summary 没有能力口径冲突；
- Console 与 GitHub Pages 的产品表达（适用时）；
- PR 中可复现的实际验证结果。

提交规则和评审标准见根目录[贡献指南](../CONTRIBUTING.md)。
