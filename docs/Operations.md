<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明Knowledge Flywheel 运维手册。
-->
# Knowledge Flywheel 运维手册

> 中文是本文默认语言。命令、环境变量、API 路径和状态值保留英文。

> R1 已将角色执行收敛到 DSH，通用项目场景从 CLI/API/Console 传入。Pi Agent 运行依赖已移除，旧记录保留可读且拒绝恢复；CodeAgent CLI 适配后置。R2 的真实 CPU DocGen 范例和独立工作区复现已通过本地验收，PR #26 待审查；R3 七角色和 R4 完整闭环尚未验收。

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

V1 的验收项目由场景文件指定，不绑定某个外部仓库。公共入口使用 `workflow-run --scenario <file>`，要求受信源码、固定 commit、允许生成路径及测试命令。旧项目专属验收命令和预写资产已移除。

自动回归通过 `tests/acceptance/RealSourceFlow.test.ts` 和 `automated-langgraph-flow.test.ts` 在临时 Git 仓库验证首轮失败、Correction、fresh 再生成、独立执行和幂等发布；这些夹具验证机制，不证明真实模型质量。外部真实闭环仍按 DEV-019 的 R3/R4 单独验收。

评测器使用 `git archive`，生成文件只写临时目录；可执行工具限于 `node`、`pnpm` 和 `cargo`。它不经过 shell，会净化继承环境、限制命令时间与输出，并把工具版本、脱敏 argv、退出状态和脱敏输出保存到 CAS。

默认 Agent Provider 为 DSH。Console 的模型配置走原生 sdk-minimal，进程由 Bubblewrap 隔离；来源从固定 Git commit 物化为逐角色白名单，DocWorker 只读分配分块。Fixture 是显式测试设施，不是无凭据时的回退。ProjectEvaluator 仍只运行受信源码；DSH 文件隔离不等于敌对生成代码沙箱。

## 内嵌 LangGraph 工作流

公共入口使用显式项目场景，通过内嵌 `domain-knowledge` LangGraph 基础设施运行：

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

<a id="codeagent-cli"></a>

### 公司 CodeAgent CLI

**接入位置已预留，真实 CLI 尚未接通验收。** 按[架构方案](specs/totalRules/Architecture.md)替换 `AgentProvider` 实现；DEV-010 在外部 DSH 第一版之后推进。以下区分当前代码与后续步骤，不是已验证的公司 CLI 命令手册。2026-09-07 核对主线 `f2724e2` 和本地环境：PATH 中没有 `codeagent`，没有可核验的实际版本帮助或协议样本；历史转述不能替代版本证据。

#### 现有实现与待补差异

源码见 [Adapter](../src/infrastructure/agentAdapters/companyCodeAgent/CompanyCodeAgentCliAdapter.ts)、[工作区](../src/domain/workspace/LocalAgentWorkspace.ts)和[组合根](../src/interfaces/runner/Composition.ts)。

| 环节 | 当前代码事实 | 真实接入要补什么 |
| --- | --- | --- |
| 认证与启动 | 固定执行 `auth status --json`；基础参数后追加 `--non-interactive --output jsonl --role ... --session ... --model ... --tools ...`，Prompt 与 Schema 经 stdin；`shell: false` | 从实际版本 help 核对命令、认证字段、非交互模式与 stdin；`WP_CODEAGENT_RUN_ARGS_JSON` 仅替换基础参数，不能消除固定追加参数或更改认证命令 |
| 结果 | 解析 JSON/JSONL，识别 `final/result/completed/assistant.final` 等事件与 `result/output/data` 对象，再校验角色（若返回）和输出 Schema | 使用真实最终事件及错误样本收敛解析；进度、工具事件和进程退出 0 均不代表业务成功；缺失或歧义结果须失败 |
| 工具与文件 | 按旧角色白名单传参；`code` 还允许 edit/shell。`realpath` 只检查工作目录属于允许根，未为 CLI 启动文件沙箱 | 对齐现有最小权限：Orchestrator 无材料工具，其余只读授权材料，Code 用 JSON 返回文件。验证 CLI 能力或部署隔离，不能沿用宽工具名单便宣称等价 |
| 环境与凭据 | 子进程继承 `process.env`，再叠加 Adapter 的 env；没有环境白名单 | 按实际认证机制构造最小环境；区分受信启动器与模型工具可读范围，避免读到 CLI 登录文件、其他 Provider 密钥或宿主 HOME |
| session | 按幂等键生成/读取 `wp-...` ID，输出校验成功后才保存返回 ID；不是实时持久化 session 创建事件 | 核对服务端分配还是客户端指定、新建与恢复命令、失败中断后的 ID；不能把成功后存 ID 表述为已支持中途恢复 |
| 取消与审计 | 有超时、总输出字节上限、AbortSignal；POSIX 发送进程组 TERM/KILL，Windows 仅终止直接子进程；审计保存摘要和关联 ID | 实测 CLI 及工具后代退出、迟到结果不落业务状态；认证续期、模型不可用、权限拒绝和限流等真实错误映射；Windows 如需支持须单独验收 |
| Run 配置 | 摘要覆盖 CLI 路径、基础参数、模型、时限、输出上限和允许根 | 补实际 CLI 版本/制品标识、协议映射与工具/隔离策略摘要；同路径二进制升级也应检测到恢复不兼容 |

现有 [CLI 集成测试](../tests/integration/CompanyCodeagentCli.test.ts)用 fake spawn 和通用 `answer` Schema 验证协议机制，没有启动公司 CLI，也未验证七角色真实业务输出。与 [Run 配置测试](../tests/integration/RunConfiguration.test.ts)一起保留为回归入口，新增真实样本后再补行为覆盖。

#### 实施顺序与退出条件

1. **核实版本与最小协议。** 在公司已安装、已登录的部署账户下，先取得可执行文件路径、版本、顶层及相关子命令 help、认证状态和脱敏输入输出。按 help 确认的调用方式，在空临时目录用无业务数据的请求返回一个固定 JSON，记录 stdin、退出码、最终事件、session 与工具配置。不能先假定当前 `auth status --json` 有效。产出“实际能力 → Adapter 差异”记录；缺失环境时记 `BLOCKED`，不进入真实闭环。
2. **修正 Adapter 并回归协议。** 在 Infrastructure 内对齐认证、参数、输出、工具及生命周期，保持 `AgentProvider` 和两层业务契约。用脱敏真实事件建立回归夹具，覆盖非法 JSON/Schema、角色错配、未登录/过期、模型不可用、session 失效、权限拒绝、超时/取消和输出超限。Prompt 不进入 argv，CLI 登录态不进入 Git、Prompt 或审计。
3. **证明材料与会话隔离。** 复用固定 commit 的 `LocalAgentWorkspace` 及已校验工件，禁止将整个仓库作为角色材料。实测绝对路径、`..`、符号链接、shell/额外工具、相邻角色目录、参考源码/门禁答案、旧实现和凭据访问；Code 只读知识与公开接口，TestGen 不读候选知识与生成实现。无法证明边界时，先补 CLI 原生限制或部署沙箱并重测。不同目录、文件只读位、工具参数或模型自述都不是进程隔离证据。
4. **接线并冻结真实后端。** 在专属 runtime 中验证实际 Run 的 `provider.kind` 和审计 Provider 均为 `company-codeagent-cli`，参数摘要对应本次 CLI 配置。先经生产 `ProjectWorkflowStages` 验证一个 DocGen 任务及业务 `AgentResult`/CAS，再沿同一七角色图联调。可以复用 `docGenAgent/examples/` 的固定源码材料和检查器；统一 `agent:run` 当前只支持 fixture / dsh，不能直接用作公司 CLI 冒烟，接入真实协议时再补相应装配。
5. **公司真实闭环与效果基线。** 七角色全部使用真实 CLI，覆盖候选不合格后的修订、fresh Code 再生成、独立评测、确定性 Gate、取消及 checkpoint 恢复；业务证据不足不得发布。记录版本/源码与配置摘要、Run/session/工件关联、业务检查、失败原因、样本量、Schema 失败率、P50/P95、吞吐及人工采纳率。无可信用量或成本数据时保留 null；按既有验收要求逐项给出 `PASS / FAIL / BLOCKED / NOT_RUN`，只有协议、权限、闭环与所需基线完整才关闭 DEV-010。

会话恢复应以业务 checkpoint 和 GenerationKey 为准，不能把 CLI 对话记录当第二套状态源。接入建议默认每次执行尝试新建 CLI 会话；如确需恢复，先证明只恢复同一 Run、节点、轮次、worker、配置与材料范围的会话，避免重复工具副作用。新轮次尤其是 Code 重生成必须 fresh，不得继续参考源码角色或上一轮实现的上下文。会话重试与业务幂等去重分别验收，失效 session 不能静默换上下文并冒充恢复成功。

#### 配置与排障入口

以下名称均已存在于 [`.env.example`](../.env.example)，默认值只是本项目 Adapter 假设；应在协议核验后用实际值配置。

| 配置 | 当前用途 / 默认值 |
| --- | --- |
| `WP_FLYWHEEL_AGENT_PROVIDER` | 选择环境后端 `company-codeagent-cli` |
| `WP_FLYWHEEL_HOME` | 专属运行目录，避免与已有 DSH 配置及 Run 混用 |
| `WP_CODEAGENT_BIN` / `WP_CODEAGENT_RUN_ARGS_JSON` | 可执行文件 / 基础参数；默认 `codeagent` / `["run"]` |
| `WP_CODEAGENT_MODEL` | 默认 `company-default`，需替换为实际可用模型 |
| `WP_CODEAGENT_TIMEOUT_MS` / `WP_CODEAGENT_AUTH_TIMEOUT_MS` | 执行 / 认证超时，默认 600000 / 15000 毫秒 |
| `WP_CODEAGENT_MAX_OUTPUT_BYTES` | stdout + stderr 合计上限，默认 2097152 字节 |
| `WP_CODEAGENT_ALLOWED_ROOTS` | CLI 工作目录允许根；多个路径使用系统路径分隔符（Linux 为 `:`）；组合根还加入角色工作区根 |
| `WP_DSH_ALLOWED_ROOTS` | 当前 `LocalAgentWorkspace.allowedSourceRoots` 仍读取此配置，与 CLI 工作目录允许根不同；公司接入也须核对源码根是否可物化 |

**配置优先级需显式验收。** 当前 [ProviderOperationsApp.runConfigurationProvider()](../src/application/apps/ProviderOperationsApp.ts) 在存在已验证 DSH 设置时返回 DSH 快照，优先于环境 fallback；未验证设置会使新 Run 失败。因此设置 CLI 开关不能证明实际调用 CLI。首轮使用没有 DSH 设置的专属 runtime，不删除已有设置；后续如调整优先级，须同步配置规范与回归测试。Console 的 API 地址/Key 验证入口目前只支持 DSH，不负责公司 CLI 登录；恢复已有 DSH Run 时不能切换后端。

session ID 文件位于 `$WP_FLYWHEEL_HOME/codeagent/sessions/`，新建目录权限 `0700`、文件权限 `0600`；当前仅在成功后保存。组合根审计位于 `$WP_FLYWHEEL_HOME/demo/agent-runs.jsonl`，保存 Prompt/Schema 摘要、耗时、状态、错误码和 run/session/idempotency 关联，不保存 Prompt 正文或任意 metadata；这是应用审计范围，CLI 自己的历史/日志仍须单独核查。排障先区分 `CODEAGENT_CLI_UNAVAILABLE`、认证错误、`CODEAGENT_TIMEOUT`、`AGENT_CANCELLED`、`AGENT_OUTPUT_INVALID` 与业务 Gate 不通过，不能靠降低 Schema 或跳过评测修复运行失败。

### 来源注册与 API

来源注册的 `FILE` locator 只能位于配置的 acquisition roots；远程 `HTTPS` host 必须列入 `WP_SOURCE_ALLOWED_HOSTS`，凭据仅可使用 `secret://env/<变量名>` 引用。刷新发现内容变更时保留固定 revision 并标记漂移，不会自动把新内容发布为知识。

稳定的本地 API 前缀是 `/api/v1`，进程探针 `/health` 不加版本。

## DSH

DSH 有两个方向：作为角色运行框架时，LangGraph 调用其 SDK，当前配置见[DSH 部署说明](Runtime.md)；下面的 Cordis 插件则让外部 DSH 调用知识库 HTTP API，不承担七角色调度。新底座优先复用前者，不另建 Agent 运行框架。

把 `src/interfaces/dsh/Dsh.ts` 作为普通 Cordis plugin 挂载，并配置：

```text
WP_KNOWLEDGE_URL=http://127.0.0.1:4174
WP_KNOWLEDGE_WRITE_TOKEN=<local-secret>
```

Adapter 注册 `wp_knowledge_query`、`wp_knowledge_status`、`wp_knowledge_scan`、`wp_knowledge_ingest_candidate` 和 `wp_knowledge_feedback`。它不依赖 shell，也不能发布知识。scan root 固定在 `Runner.config.json`，调用方不能指定任意文件系统路径。

## GitHub Pages 项目网站

项目网站是单独的静态页面，只介绍产品并链接文档，不连接本地 Registry 或写 API。

```bash
npm run site:check
npm run site:serve
```

打开 <http://127.0.0.1:4175>。公开站点的唯一源码在 `site/`。根目录 `index.html` 只是分支/Jekyll 模式的兼容入口；Pages Source 为 GitHub Actions 时，工作流直接发布 `site/`。预期公网地址是 <https://linlisworkteam.github.io/domain-knowledge/>。


## 知识索引与阶段任务

在知识页展开“知识索引与试检索”，点击“更新索引”。页面展示输入版本数量和新增、更新、复用、失败统计；无需填写 JSON。输入问题并点“检索索引”查看匹配字段和词，打开命中后加载正文；“预览 YAML”查看索引头。待更新数量大于零时重新更新索引。

运行中可取消；失败或进程中断后可恢复同一任务，已完成卡片和累计用量保留。卡片发生变化时应重新点击更新索引创建新输入任务。索引失败不会删除知识卡片。runtime/card-index 文件可从既有 CAS 恢复；运行中不要删除 runtime/workbench.sqlite 或 CAS。生成、原生重建、可信评测和关联已接通；索引本身不证明知识通过评测。


## 固定代码仓分析

在操作中心填入允许目录内的 Git 仓库根目录，以及分支、标签或提交（默认 HEAD），点击“分析仓库”。返回的完整提交号和源码清单已固定；脏工作区内容不会并入。工具版本检查不是编译或模型验收。模块为文件名分组候选，后续仍需公开接口和构建验证；分析成功后保存项目输入，再启动生成或一键流程。

分析后可勾选支持的模块，调整C/C++编译器与标准，填写相对包含目录和预处理定义，再点击“保存项目输入”。保存使用分析结果的完整提交，不重新跟随分支；页面显示不可变输入版本。修改选项后须重新保存，旧输入仍保留。每个文件最多1MiB，总源码输入8MiB；缩小模块范围可降低用量。该输入供公开接口提取、生成和参考评测使用。

C/C++验收输入固定在 `tests/fixtures/nativeTargets/Targets.json`：包含jsmn与TinyXML2提交、头文件/实现/上游测试SHA-256和限定符号范围。固定声明式案例已在对应参考提交通过（jsmn 11、XMLUtil 40），fixedSuite 记录报告摘要与工具链摘要；模型候选测试的可信晋升独立处理，不能据此改变旧 trustedSuiteStatus 或发布知识。jsmn上游Makefile包含默认、STRICT、PARENT_LINKS及两者组合四种配置；TinyXML2只重建XMLUtil类型转换，不重建整个XML库。上游测试文件摘要不等同于已完成限定模块的可信测试提取或真实运行。

### 整卡来源复核与来源修订

在操作中心完成原生评测后，点击「复核全部卡片来源」。即使可信用例全部通过，也应检查全部冻结卡片的来源结论。矛盾和未知风险分别显示；展开「最近处理卡片的固定输入」可下载正文、源码、参考观察和复核准则，超时后用「恢复来源复核」继续，已完成卡片复用。

有明确矛盾时可「按来源意见修订」，随后查看前后正文和增量索引结果，再「重建修订版本」、执行评测和整卡复核。来源修订不伪造行为失败、不修改可信预期。索引失败后恢复原任务，不重复生成已接受正文。这些操作既可独立执行，也由一键v17流程调用。来源复核逐章保存进度，恢复不会重跑同版本已完成章节；旧契约只读。固定测试与工作台发布事务已接通，但只有发布提交成功后才标记已验证，来源匹配本身不等于已发布。

真实验收脚本 `scripts/release/RunNativeWorkbench.ts` 的 steps 模式在行为通过后执行同一个来源复核入口，明确矛盾或未知风险返回失败并保留任务编号；处理后再继续。pipeline 模式使用当前v17自动修订与补证流程，旧契约不得恢复。两种模式都要求固定与可信行为门禁、完整来源复核以及发布事务提交成功，并验证发布文件可用，才记录 `VERIFIED_PUBLISHED`；中途失败保留真实任务编号，不标记发布。

固定参考验收可运行 `node scripts/release/RunNativeFixedCases.ts --target jsmn --repository /path/to/jsmn --report /path/to/report.json`；TinyXML2 将 target 改为 tinyxml2 并使用对应仓库。需 Node24、现有原生工具链及隔离环境。与模型/构建任务串行运行，保留报告；报告通过仍不能发布知识。

评测已生成的固定版本时，给固定验收命令加 `--runtime /path/to/runtime --reconstruction-task stage-...`。脚本先验证参考实现，再从该任务的CAS读取生成代码，以相同固定用例独立执行，报告包含输入版本、正文与Code摘要。该命令不调用模型，失败不会修改代码或预期；`FIXED_GENERATED_VALIDATED` 仍不表示知识来源复核或发布完成。

也可在重建后的评测面板展开“固定用例评测”，为每个模块选择已导出的native-cases-v1用例文件并启动。页面分别展示参考/生成实际值、预期与诊断；阶段失败可恢复同输入。单个文件最多256KiB，服务端仍校验调用和观察范围。

仓库分析会读取固定提交中的 `compile_commands.json`，在“编译数据库候选”展开来源、编译参数和未支持项。无问题的候选可“应用到构建参数”，再调整并保存项目输入；“参数范围”可以选择项目默认或单个模块，模块配置首次编辑时复制默认值；也可恢复继承。独立标准、目录和宏会随源码快照冻结，并贯穿生成、重建、评测与发布。系统不会执行数据库中的命令。

一键流程可在“固定用例”中为全部所选模块分别上传用例文件；启动时冻结，之后每轮修订重建均复用同组测试。固定评测失败时停止该轮并保存原预期，修改文件需启动新流程。迭代记录可以查看和下载固定报告。未选择固定用例的流程仍可生成和关联，但不授予最终验证发布资格。

新来源复核默认单次上限600秒，用于持续输出但尚未完成的复杂源码核验；旧任务仍保持其180秒上限。若需要采用新策略，使用“复核全部卡片来源”启动新输入任务；“恢复来源复核”保留旧策略及累计消耗。


## 五阶段工作台操作与验收边界

本次新增完整闭环目标是 C、C++；TypeScript 保留既有 markdownLite 模块回归和共享案例执行边界，未承诺任意 TypeScript 仓库的多卡片生成。其余语言明确显示不支持。环境复用本机 gcc/g++/Clang/Make，不安装语言工具链或账户系统。

1. 点击左上角“项目”，选择已保存输入，或浏览代码目录并指定源码版本后分析。可按文件夹定义模块及名称，确认构建参数后保存冻结快照。当前要求 Git 仓库，自定义目录模块支持 C/C++，未支持任意非 Git 目录。切换快照会读取对应任务历史，后台原任务保留。
2. 在项目任务面板点击“生成知识库”查看可立即阅读的卡片，再到知识页更新索引、预览 YAML 并试检索。生成完成不表示已验证。接口编译失败时查看具体缺项和下载诊断；修正参数后保存新的输入。
3. 执行代码重建，查看公开接口、规范化差异与生成代码；执行可信评测，查看失败输入、预期和实际。候选测试必须先通过参考实现；失败候选不能成为可信门禁。
4. 为各模块选择固定用例，并复核卡片来源。有明确矛盾时修订，再刷新索引、重建和复测；未知风险保留为未解决项。不得修改旧可信预期来制造通过。
5. 关联页使用库内卡片及用户已捕获的本地文档/指定链接。没有外部材料时只做库内关联，不执行主动联网搜索。
6. 独立发布选择本轮可信、固定和来源任务，点击“验证并发布知识”；一键v17流程在关联完成后自动调用同一发布事务。只有提交成功才显示“已验证并发布”，卡片、清单和证据可下载。导出失败保留前序产物和待恢复记录；恢复不会重跑成功模型任务。没有固定用例的流程不具备最终发布资格。

在“飞轮批次”点击新建批次，只选择当前项目中的模块。自动运行选“否”时仅创建记录，点击“新增轮次”启动；选“是”时填写分钟频率。相同模块串行，不同模块可同时排队推进，实际模型与构建仍受全局资源限制。编号为模块-日期-序号。选择模块与批次后切换轮次，展开节点图或右侧日志查看时间、事件和证据；失败时恢复本轮保留原用量。定时批次遇到质量暂停不会自动绕过。新批次子页可展开固定测试、接口范围和外部材料，上传固定用例文件并选择已捕获材料。创建后输入不可修改，各轮复用相同版本；详情可查看冻结范围并下载固定测试。切换模块会清除尚未提交的测试及范围。未上传固定测试的批次不能最终验证发布。

当前代码与受控测试覆盖这些入口；实际部署、真实任务与未完成验收以[验收报告](reports/WorkbenchAcceptance.md)最新状态为准。现场验收分别记录运行编号、最终版本、固定与可信用例、来源意见、发布ID和文件校验，不能用阶段成功替代最终结果。保留旧v0.2.0发布。

Console 只读取其 `WP_FLYWHEEL_HOME` 配置对应的运行数据。另一个目录中的 CLI 验收任务不会自动出现在网站；直接执行阶段也不会自动生成模块批次。排查缺失记录时先核对服务版本、运行目录与项目/模块/批次归属，不用临时验收数据库覆盖生产库。迁移前须备份并校验身份映射和共享引用。

### 补充验证与任务恢复

整卡来源复核保留未知段落时，可点击“补充验证用例”。新任务冻结这些段落，先保留并验证原可信测试，再提出新候选。候选没有引用任何指定段落时，不执行候选测试；页面列出未命中段落。引用命中只用于定位，不能代表该段落已通过语义验证。

模型生成的候选被拒绝后，使用“重新生成候选测试”恢复原任务。显式提供的候选恢复时保持冻结内容，更换候选必须形成新输入。已拒绝的输入、参考观察或目标缺口会交给TestGen，累计用量继续计入。旧可信输入与预期不修改；补证通过后仍须重新复核来源。对已存在的旧策略补证任务，点击启动或恢复保留原身份与策略，不会创建同输入新任务来重置预算。

一键流程优先处理明确来源矛盾，只有未知证据缺口时进入补证；未知段落集合连续不缩小会暂停并说明原因。没有外部材料时，只建立库内关联；最终来源、固定、可信门禁未通过时，不显示已验证发布。

补证候选超出可信套件64条容量时，新执行器将其作为候选拒绝保存，恢复会把容量和保留用例数交给TestGen重新提案；不删除原可信用例，也不增加上限。此前以NATIVE_TRUSTED_GATE_LIMIT暂停的旧执行器任务保留原证据，不能跨工具链指纹恢复。

在左上角打开「项目设置」，选择服务器本地代码目录并点击「读取目录」，无需初始化Git或填写HEAD。读取后配置文件夹模块并保存，飞轮批次使用保存的目录快照。目录中文档和二进制同样计入快照；.git元数据不纳入，符号链接只保存目标文本。超过单文件8MiB、总计64MiB或20000目录项时需缩小项目目录范围。旧Git项目仍可从已保存项目中选择。
