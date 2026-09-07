# Knowledge Flywheel 运维手册

> 中文是本文默认语言。命令、环境变量、API 路径和状态值保留英文。

> R1 已将角色执行收敛到 DSH，通用项目场景从 CLI/API/Console 传入。Pi Agent 运行依赖已移除，旧记录保留可读且拒绝恢复；CodeAgent CLI 适配后置。R2 的真实 CPU DocGen 范例及后续完整闭环仍待验收。

<details lang="en">
<summary>English summary</summary>

Initialize the local SQLite/CAS runtime with `knowledge init`, ingest candidates, attach independently produced evaluation evidence, and publish only with a persisted `PASS` decision. The Console is read-only by default. HTTP mutations require `WP_KNOWLEDGE_WRITE_TOKEN`; do not expose them over plain public HTTP.

</details>

## 本地初始化

```powershell
npm install
npm run knowledge -- init
npm run knowledge -- migrate-legacy --root knowledge
npm run knowledge -- scan
npm run knowledge -- list --status CANDIDATE
```

设置 `WP_FLYWHEEL_HOME` 可以把 SQLite/CAS 放到默认 `.workpanel/` 以外的目录。

## 添加候选知识

```powershell
npm run knowledge -- ingest `
  --module example-module `
  --file knowledge/inbox/example.md `
  --source knowledge/inbox/example.md `
  --source-commit <commit> `
  --pinned `
  --title "示例知识" `
  --description "说明这条知识为什么可以复用"
```

命令返回质量报告和 `KnowledgeVersion`，此时状态仍是 `CANDIDATE`。

<a id="behavioral-evaluation-and-publication"></a>

## 行为评测与发布

通用 `evaluate` 命令是受信报告摄取 Adapter：它记录外部提交的证据，但不启动进程。操作员只能提交由独立受控评测器产生的结果。

```powershell
npm run knowledge -- create-run --module example-module --policy local-v1
npm run knowledge -- transition --run <run-id> --state PLANNED
npm run knowledge -- transition --run <run-id> --state GENERATING
npm run knowledge -- transition --run <run-id> --state EVALUATING

npm run knowledge -- evaluate `
  --run <run-id> `
  --version <version-id> `
  --toolchain "cpp-plugin@1;compiler=<exact-version>" `
  --tests-passed 12 `
  --tests-total 12 `
  --critical-failures 0 `
  --stability 1 `
  --evidence-file <test-report.json>

npm run knowledge -- publish `
  --run <run-id> `
  --version <version-id> `
  --decision <pass-decision-id>
```

记录评测时，系统会在同一事务保存报告和 GateDecision，并把 Run 从 `EVALUATING` 推进到 `REVIEWING`。CLI 和 HTTP 遵循同一规则。完全相同的重试返回原报告与决定，不新增 Event；输入不同的重试会因 replay collision 而 fail closed。

出现以下任一情况，CLI 都会拒绝发布：GateDecision 不是 `PASS`、证据属于其他 Run 或版本、缺少 provenance，或者正文 Artifact 完整性校验失败。

## 固定 commit 的真实源码验收

项目验收命令会对固定的 ohMyWorkPanel commit 运行完整两轮流程。它验证 reference gate、首轮故意失败、结构化 Correction、知识增量修订、fresh 代码生成、独立进程评测、确定性 `PASS` 和幂等发布。

```powershell
npm run acceptance:ohmyworkpanel -- `
  --repository D:\AI\LinlisWorkPanel `
  --runtime D:\temp\wp-ohmy-acceptance `
  --output summary
```

源码仓库必须包含 `acceptance/ohmyworkpanel/scenario.json` 固定的 commit；对象缺失或不一致时会 fail closed。当前分支可以继续前进：报告会区分 checkout HEAD 和归档验收 commit，整个过程不会 checkout 或修改源码仓库。

评测器使用 `git archive`，生成文件只写临时目录；可执行工具限于 `node`、`pnpm` 和 `cargo`。它不经过 shell，会净化继承环境、限制命令时间与输出，并把工具版本、脱敏 argv、退出状态和脱敏输出保存到 CAS。

默认 Agent Provider 为 DSH。Console 的模型配置走原生 sdk-minimal，进程由 Bubblewrap 隔离；来源从固定 Git commit 物化为逐角色白名单，DocWorker 只读分配分块。Fixture 是显式测试设施，不是无凭据时的回退。ProjectEvaluator 仍只运行受信源码；DSH 文件隔离不等于敌对生成代码沙箱。

## 内嵌 LangGraph 工作流

面向生产形态的入口使用同一个固定 ohMyWorkPanel 场景，但通过内嵌 `domain-knowledge` LangGraph 基础设施运行：

```bash
npm run knowledge -- workflow-run --scenario /path/to/scenario.json --repository /path/to/project
npm run knowledge -- workflow-status --run <run-id>
npm run knowledge -- workflow-resume --run <run-id>
npm run knowledge -- workflow-cancel --run <run-id>
npm run knowledge -- workflow-report --run <run-id> --output /tmp/run-demo.json
```

Agent 输出或进程出现可恢复错误时，`workflow-resume` 会从最近带 task error 的 LangGraph checkpoint 分支继续。已提交的 Artifact、Oracle 和 publication 仍由业务 GenerationKey 去重。候选知识未通过 Quality Gate 时不需要人工执行 resume：图会自动跳过本轮 CodeAgent，把质量 weak points 交给下一轮 DocGen。

LangGraph 把执行 checkpoint 写到 `$WP_FLYWHEEL_HOME/workflow/checkpoints.sqlite`。不要把它当作业务 Registry，也不要暴露给浏览器。domain-knowledge 的 Knowledge Registry 持有 `FlywheelRun`、Run 配置快照、Agent prompt revision、节点投影、知识版本、评测报告、Event 和发布回执。每个 Run 的有效提示词保存在 CAS，快照只记录 revision、摘要和 ArtifactRef；恢复不会读取后来修改的提示词。两层用 `runId` 关联。

升级兼容边界：旧版本创建且没有 `RunConfigurationSnapshot` 的在途 Run 无法恢复，必须使用当前版本重新创建 Run。已有快照的 Run 只有在 Provider、模型、非敏感执行参数、基础 Prompt、工具权限及完整 Agent Schema 依赖摘要均与启动时一致时才允许恢复；不一致会 fail closed，不会静默改用新配置。此限制不改变任何现有 HTTP API。

`workflow-report` 用于留存可复验 Demo。它导出 Registry 中的 Run、KnowledgeVersion、评测、Gate、节点尝试、业务 Checkpoint、Event 和 publication receipt，并逐一调用 CAS 完整性校验；若启用了真实 Provider，还会加入只含摘要的 Agent 调用记录。输出文件默认拒绝覆盖已有文件。报告不会读取 Prompt 正文、模型正文、Harness Session 日志或凭据。

图角色的职责、输入输出契约、拓扑和工具固定。操作员可用 `npm run knowledge -- agents` 查看全部角色，只能通过 `set-agent-prompt` 修改追加提示词。对应 HTTP 接口是 `PUT /api/v1/agents/:agentId/prompt`，需要正常 Bearer token，body 必须严格为 `{ "promptAddon": "..." }`；额外字段会 fail closed。

## 旧 Runner 兼容

已有自动化可以继续调用 `node fw.mjs`。受支持的命令会直接委派给新 CLI，并共享 `WP_FLYWHEEL_HOME`。`--root` 会被拒绝，防止调用方误选另一套存储。已删除的 score/eval/harvest 语义会明确失败。命令映射见[组件首页](../README.md)。

<a id="dashboard-and-api"></a>

## Dashboard 与 API

```powershell
$env:WP_KNOWLEDGE_WRITE_TOKEN = '<local-secret>'
npm run knowledge:serve
```

打开 <http://127.0.0.1:4174>。只读接口不要求凭据；写接口要求 `Authorization: Bearer <local-secret>`。未配置 token 时，写请求返回 `503 WRITE_API_DISABLED`。

如需明确部署为公网只读服务，可覆盖监听地址，但不要设置写 token：

```bash
WP_KNOWLEDGE_HOST=0.0.0.0 WP_KNOWLEDGE_PORT=80 npm run knowledge:serve
```

随后打开 `http://<server-public-ip>/`。云安全组需要放行所选端口的 TCP 入站流量，建议把来源 CIDR 限制到操作员 IP。不要在明文 HTTP 上暴露写接口；任何非本地监听在启用 `WP_KNOWLEDGE_WRITE_TOKEN` 前都应先配置 TLS 反向代理。

Console 提供“操作中心、飞轮批次、知识、工作流图、评测、来源、Agent 设置”七个页面。批次观察使用以下接口：

- `GET /api/v1/runs`
- `GET /api/v1/runs/:runId`
- `GET /api/v1/runs/:runId/workflow-nodes`
- `GET /api/v1/runs/:runId/events?after=<event-seq>`

Agent 元数据来自 `GET /api/v1/agents`。浏览器默认只读，操作员 token 仅保存在当前页面内存。持有 token 后，前台可以通过项目场景 JSON 启动通用工作流和编辑 `promptAddon`；它不会通过串接原始状态迁移来模拟编排，也不能修改图契约。

### 模型服务与 DSH

配置入口现在使用 DSH；旧 Pi Run 保留读取，恢复会返回 RUN_CONFIGURATION_INCOMPATIBLE。

在治理模式打开“Agent 设置”，依次保存 API 地址、API Key 和模型，再执行“验证并启用”。对应接口为：

- `GET /api/v1/agents/providers/status` 与 `GET /api/v1/provider-settings`：只读脱敏状态；
- `PUT /api/v1/provider-settings`：要求 Bearer token、`Idempotency-Key` 和 `expectedRevision`；
- `POST /api/v1/provider-settings/verify`：重新校验地址并调用无生成副作用的模型列表接口；
- `GET /api/v1/metrics/runs` 与 `GET /api/v1/metrics/governance`：读取带样本量和口径的运营指标。

模型地址只允许公开 HTTPS，拒绝本机、私网、混合 DNS、URL 凭据、查询、fragment 和重定向。新设置以 AES-256-GCM 保存到 `$WP_FLYWHEEL_HOME/secrets/dsh-provider-settings.enc`，密钥为同目录 `dsh-provider-settings.key`，文件权限 0600。旧 `provider-settings.enc/key` 不被改写或自动复制秘密。验证有效期 24 小时，新保存使验证失效；未重新验证的新批次失败关闭。运行中批次使用进程内冻结的配置，修改设置影响新批次；恢复时比较当前参数摘要，拒绝切换后端或模型。

`WP_DSH_MAX_SCHEMA_ATTEMPTS` 默认 2、范围 1..3，只重试 JSON/Schema 输出错误；每次新 session/home。`WP_DSH_MAX_TOKENS` 默认 32768，`WP_DSH_CONTEXT_WINDOW` 默认 128000。地址、协议、模型、输出/上下文上限、尝试次数、隔离参数及工具策略都进入摘要，凭据不进入快照。模型请求通过固定 DNS 的受信转发，禁止重定向，DSH 子进程只持有本次转发令牌；Token 用量来自上游 usage，无可信价格时成本为空。设置文件与 SQLite 回执的跨文件崩溃原子性仍由 DEV-012 收口。

### 公司 CodeAgent CLI

本节仅说明现有 Adapter 的设计，不能作为真实 CLI 的已验收操作指南。代码当前假定 `auth status --json`、`run --non-interactive` 和自定义 session 参数；用户提供的版本反馈不同，DEV-010 需重新核对实际协议。`WP_FLYWHEEL_AGENT_PROVIDER=company-codeagent-cli` 只选择适配器，不证明认证或调用成功。

Adapter 以非 shell 子进程传递 stdin，按角色构造工具参数，并校验 JSON/JSONL 输出。参数声明和不同工作目录不能证明真实 CLI 已执行文件隔离；工具权限、认证、会话、取消和结果结构均须以实际版本单独验证。

session ID 按幂等键保存到 `$WP_FLYWHEEL_HOME/codeagent/sessions/`，目录权限 `0700`、文件权限 `0600`。CLI 路径、基础参数、模型、时限、输出上限和允许根进入 Run 非秘密摘要；恢复时任一项变化都会失败关闭。超时或取消会终止整个进程组。审计只保存 Prompt/Schema 摘要、耗时、状态、错误码、run/session/idempotency 关联 ID，不保存 Prompt、凭据或任意请求 metadata。当前自动化只证明 Adapter 协议，生产登录、模型质量、容量和长期稳定性由 DEV-010 验收。

来源注册的 `FILE` locator 只能位于配置的 acquisition roots；远程 `HTTPS` host 必须列入 `WP_SOURCE_ALLOWED_HOSTS`，凭据仅可使用 `secret://env/<变量名>` 引用。刷新发现内容变更时保留固定 revision 并标记漂移，不会自动把新内容发布为知识。

稳定的本地 API 前缀是 `/api/v1`，进程探针 `/health` 不加版本。

## DSH

DSH 有两个方向：作为角色运行框架时，LangGraph 调用其 SDK，当前配置见[DSH 部署说明](../deploy/deepseek-harness/README.md)；下面的 Cordis 插件则让外部 DSH 调用知识库 HTTP API，不承担七角色调度。新底座优先复用前者，不另建 Agent 运行框架。

把 `src/interfaces/dsh/index.ts` 作为普通 Cordis plugin 挂载，并配置：

```text
WP_KNOWLEDGE_URL=http://127.0.0.1:4174
WP_KNOWLEDGE_WRITE_TOKEN=<local-secret>
```

Adapter 注册 `wp_knowledge_query`、`wp_knowledge_status`、`wp_knowledge_scan`、`wp_knowledge_ingest_candidate` 和 `wp_knowledge_feedback`。它不依赖 shell，也不能发布知识。scan root 固定在 `runner.config.json`，调用方不能指定任意文件系统路径。

## GitHub Pages 项目网站

项目网站是单独的静态页面，只介绍产品并链接文档，不连接本地 Registry 或写 API。

```bash
npm run site:check
npm run site:serve
```

打开 <http://127.0.0.1:4175>。公开站点的唯一源码在 `site/`。根目录 `index.html` 只是分支/Jekyll 模式的兼容入口；Pages Source 为 GitHub Actions 时，工作流直接发布 `site/`。预期公网地址是 <https://linlisworkteam.github.io/domain-knowledge/>。
