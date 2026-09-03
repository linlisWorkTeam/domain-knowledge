# 快速上手

本指南有两条路径。你可以自己运行命令，也可以把后面的 Prompt 交给 Agent，让它完成环境检查、安装、验证和启动。两条路径都不会伪造评测证据或自动发布 `VERIFIED` 知识。

<details lang="en">
<summary>English summary</summary>

Install Git, Node.js 24+ and npm. Run `npm ci`, `npm run typecheck`, `npm run validate:specs` and `npm test`, then initialize the local runtime with `npm run knowledge -- init`. Start the read-only Console with `npm run knowledge:serve`. An Agent may perform these setup steps, but it must not weaken tests, fabricate evidence or manually turn `CANDIDATE` into `VERIFIED`.

</details>

## 路径 A：使用者自己配置

### 1. 准备环境

需要：

- Git；
- Node.js 24 或更高版本；
- npm。

确认版本并安装锁定依赖：

```bash
node --version
npm --version
npm ci
```

Node.js 24 是硬性要求，因为 SQLite Adapter 使用内置 `node:sqlite`。

如果要导入或扫描长期知识库，请把 [`wpKnowledge`](https://github.com/linlisWorkTeam/wpKnowledge) 检出到本仓库旁边，并设置允许根目录：

```bash
git clone https://github.com/linlisWorkTeam/wpKnowledge.git ../wpKnowledge
export WP_KNOWLEDGE_REPOSITORY="$(cd ../wpKnowledge && pwd)"
```

不设置该变量时，CLI 只允许读取 domain-knowledge 自己的目录；编排、测试和 Console 仍可正常使用。

### 2. 验证检出内容

```bash
npm run typecheck
npm run validate:specs
npm test
```

三个命令都应退出 0。Node 可能打印 `node:sqlite` 的 ExperimentalWarning；警告本身不代表测试失败。

### 3. 初始化本地 Registry 和 CAS

```bash
npm run knowledge -- init
npm run knowledge -- status
```

默认运行目录是仓库根目录的 `.workpanel/`，已被 Git 忽略。若需要隔离多个实验，可以显式指定：

```bash
WP_FLYWHEEL_HOME=/tmp/wpknowledge-demo npm run knowledge -- init
```

同一次实验的后续命令必须使用相同的 `WP_FLYWHEEL_HOME`。

### 4. 导入或添加候选知识

导入仓库中的旧 OKF 卡片：

```bash
npm run knowledge -- migrate-legacy --root knowledge
npm run knowledge -- list --status CANDIDATE
```

导入只创建 `CANDIDATE`。旧卡片即使标记为 `verified`，也必须重新经过行为评测和 Publication Gate。

摄取单个 Markdown 文件时使用：

```bash
npm run knowledge -- ingest \
  --module example-module \
  --file path/to/example.md \
  --source path/to/example.md \
  --source-commit <commit> \
  --pinned \
  --title "Example knowledge" \
  --description "Why this knowledge is reusable"
```

### 5. 查询知识

```bash
npm run knowledge -- query --q "workpanel"
```

默认查询只返回已通过行为门禁并发布的 `VERIFIED` 版本。全新运行目录没有结果是预期行为，不应通过降低 Gate 或手工改库来“修复”。候选检查可以使用 `list --status CANDIDATE`。

### 6. 打开 Console

```bash
npm run knowledge:serve
```

浏览器打开 <http://127.0.0.1:4174>。Console 提供 Overview、Runs、Knowledge、Governance、Evidence、Agents 和 Settings 视图，默认只读。Agents 页面会列出七个固定角色的职责、输入输出、工具权限和基础提示词；Run 详情会显示从 LangGraph 投影而来的节点状态，而不是直接读取 checkpoint 数据库。

若仅在受信本机测试 feedback 写入：

```bash
WP_KNOWLEDGE_WRITE_TOKEN='<local-secret>' npm run knowledge:serve
```

不要把 token 提交到仓库，也不要在公网明文 HTTP 上启用写操作。公网只读部署和 TLS 要求见[运维手册](OPERATIONS.md#dashboard-and-api)。

### 7. 运行固定 ohMyWorkPanel 自动流程

准备一个包含验收场景固定 commit 的 ohMyWorkPanel 本地仓库，然后运行：

```bash
npm run knowledge -- workflow-run --repository /path/to/ohMyWorkPanel
```

命令会创建 `FlywheelRun`，以内嵌 LangGraph 执行全部 Agent 节点，并等待失败迭代、独立评测和发布结束。另一个终端打开 Console，就能按同一 `runId` 查看节点状态。默认 Agent Provider 是可重复的 fixture，适合先确认环境与治理链路。

需要接入真实 DeepSeek Harness 时，按 [`deploy/deepseek-harness/README.md`](../deploy/deepseek-harness/README.md) 安装 Bubblewrap，配置 `OPENCODE_GO_API_KEY`、Provider 和来源 allowlist，再设置 `WP_FLYWHEEL_AGENT_PROVIDER=deepseek-harness`。Prompt 通过官方 SDK 的 stdin JSON-RPC 发送；每个 Agent 只得到角色允许的工作区。密钥只放进运行时环境，不写配置文件。公开 Web 只是 DSH 自身的临时调试面，知识飞轮 Console 仍由 `knowledge:serve` 提供。

Run 结束后，可以把完整步骤导成一个脱敏 Demo 报告：

```bash
npm run knowledge -- workflow-report --run <run-id> --output /tmp/wpknowledge-run.json
```

报告包含业务状态、节点尝试、知识版本、评测、Gate、发布回执、Checkpoint、Event、Agent 调用摘要和 CAS 完整性结果，不包含 Prompt、模型正文、Harness Session 或凭据。

查看 Agent 或为 DocGen 追加一段受信提示词：

```bash
npm run knowledge -- agents
npm run knowledge -- set-agent-prompt --agent doc-gen --prompt "优先写清适用条件和失败边界"
```

提示词配置需要与写 API 相同的受信操作边界。它只能维护 `promptAddon`，不能替换基础提示词、节点职责、Schema、拓扑或工具权限。

### 8. 下一步

- 想理解用户完整使用路径：阅读[用户用例与交互时序](../specs/05-workflows/user-use-cases.md)。
- 想完成真实评测与发布：阅读[行为评测与发布](OPERATIONS.md#behavioral-evaluation-and-publication)。
- 想修改实现：阅读[开发指南](DEVELOPMENT.md)。
- 想理解为什么 Agent 不能自行发布：阅读[评测模型](../specs/08-evaluation/evaluation-model.md)和[发布门禁](../specs/08-evaluation/knowledge-publication-gate.md)。

## 路径 B：交给 Agent 配置和启动

把下面整段 Prompt 交给有终端和文件访问能力的 Agent。它要求 Agent 保留已有改动、跑真实门禁，并以只读模式启动服务。

```text
请从 0 到 1 配置并启动 domain-knowledge。你需要实际执行命令、处理可安全修复的问题，并在最后给出可核对的结果。

仓库：https://github.com/linlisWorkTeam/domain-knowledge

执行要求：
1. 如果当前目录已经是 domain-knowledge，先检查 git status，保留所有未提交改动；否则克隆仓库并进入目录。不要覆盖用户文件。
2. 阅读 README.md、CONTRIBUTING.md、docs/GETTING_STARTED.md 和 specs/README.md。
3. 检查 Git、Node.js 和 npm。Node.js 必须是 24 或更高版本；版本不满足时，使用机器已有的版本管理器升级，并说明改了什么。
4. 执行 npm ci、npm run typecheck、npm run validate:specs、npm test。任何门禁失败都要先定位原因；不得跳过测试、降低阈值或伪造通过结果。
5. 使用独立运行目录初始化：
   WP_FLYWHEEL_HOME=.workpanel npm run knowledge -- init
   WP_FLYWHEEL_HOME=.workpanel npm run knowledge -- status
6. 以只读模式启动 Console：
   WP_FLYWHEEL_HOME=.workpanel npm run knowledge:serve
   检查 http://127.0.0.1:4174/health，并确认首页可访问。
7. 除非我明确要求公网访问，否则只监听 127.0.0.1。不要设置 WP_KNOWLEDGE_WRITE_TOKEN，不要把 token、数据库、CAS 或 .workpanel 提交到 Git。
8. 不得手工把候选状态改成已验证，不得调用已经退休的评分、评测或摄取命令，也不得把确定性夹具写成真实模型质量证明。
9. 最后报告：实际 Node/npm 版本、运行过的检查及结果、服务 PID、访问地址、运行目录、git status，以及仍未解决的问题。若服务无法启动，保留完整错误摘要并给出下一步。
```

### Agent 完成后，你要看什么

- 四个门禁命令是否真的退出 0，而不是只写“应该通过”；
- 服务是否通过 `/health`，访问地址是否仍是本机 `127.0.0.1`；
- `git status` 是否只包含原有改动，没有新增运行数据或密钥；
- Agent 是否把查询为空解释为“尚无 VERIFIED”，而不是绕过 Gate 手工改状态；
- 失败时是否留下命令、错误摘要和下一步，而不是降低测试或安全要求。
