<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明快速上手。
-->
# 快速上手

> R1 已将角色执行收敛到 DSH，通用项目场景从 CLI/API/Console 传入。Pi Agent 运行依赖已移除，旧记录保留可读且拒绝恢复；CodeAgent CLI 适配后置。R2 的真实 CPU DocGen 范例和独立工作区复现已通过本地验收，PR #26 已合入；R3 七角色和 R4 完整闭环尚未验收。

本指南有两条路径。你可以自己运行命令，也可以把后面的 Prompt 交给 Agent，让它完成环境检查、安装、验证和启动。两条路径都不会伪造评测证据或自动发布 `VERIFIED` 知识。

<details lang="en">
<summary>English summary</summary>

Install Git, Node.js 24+ and npm. Run `npm ci`, `npm run typecheck`, `npm run validate:specs` and `npm test`, then initialize the local runtime with `npm run knowledge -- init`. Start the read-only Console with `npm run knowledge:serve`. An Agent may perform these setup steps, but it must not weaken tests, fabricate evidence or manually turn `CANDIDATE` into `VERIFIED`.

For a remote server, forward port 4174 to your computer before opening localhost. A temporary HTTPS tunnel is an optional public preview. Browsing the Console does not require model credentials; executing DSH workflows does.

</details>

只想查看 Web 页面时，按 [README 的五分钟启动](../README.md#五分钟启动)操作即可，第 4、5、7 节是按需执行的数据与业务步骤。第 2 节用于验证检出版本；页面能打开不代表完整业务流程已通过验收。

## 路径 A：使用者自己配置

### 0. 获取当前主线

首次使用：

```bash
git clone --branch main https://github.com/linlisWorkTeam/domain-knowledge.git
cd domain-knowledge
```

已有检出先确认分支与改动：

```bash
git status --short
git branch --show-current
git fetch origin main
```

工作区干净、且本地 `main` 没有需要保留的分叉提交时，再更新：

```bash
git switch main
git merge --ff-only origin/main
```

有未提交改动时先提交或备份；不要直接 `reset --hard` 或 `clean -fd`。快进失败时核对本地分叉，不要覆盖提交。切换版本前停止旧服务，更新后重新安装锁定依赖并启动，避免旧进程继续运行旧代码。

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

项目要求 Node.js 24+，SQLite Adapter 使用内置 `node:sqlite`。已安装新版本不代表当前终端正在使用它；若使用 nvm，可先执行 `nvm use 24`，再检查 `node --version`。

如果新建了 Git worktree，应在其中执行 `npm run bootstrap:worktree` 安装依赖，确认结果为 `status: READY`；后续用 `npm run bootstrap:worktree:check` 检查环境。每个 worktree 使用独立的 `node_modules`，详见[开发指南](Development.md)。

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

默认运行目录是仓库根目录的 `.workpanel/`，已被 Git 忽略。`init` 会创建或打开运行存储并返回状态，不会导入演示数据；直接启动 Console 也会打开运行存储。全新目录的知识、批次和发布数量为 0 是正常现象。若需要隔离多个实验，可以显式指定：

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

浏览器打开 <http://127.0.0.1:4174>。Console 提供“操作中心、飞轮批次、知识、工作流图、评测、来源、Agent 设置”七个页面，默认只读。Agent 设置页面会列出七个固定角色的职责、输入输出、工具权限和基础提示词，并展示模型服务与运行/治理指标；批次详情与工作流图显示从 LangGraph 投影而来的节点状态，而不是直接读取 checkpoint 数据库。

保持服务终端运行，按 `Ctrl+C` 停止。在服务所在机器的另一个终端检查：

```bash
curl --fail http://127.0.0.1:4174/health
curl --fail --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:4174/
curl --fail http://127.0.0.1:4174/api/v1/system/status
```

预期健康检查返回 `{"ok":true}`、首页 HTTP 200、状态 API 返回计数。这些检查证明 Web 服务可访问，不证明真实模型工作流已经执行。

<a id="remote-console"></a>

#### 从自己的电脑访问远程服务

`127.0.0.1` 只代表当前机器。服务在远程服务器上时，直接在你电脑的浏览器打开这个地址，会访问你电脑上的端口。

有 SSH 访问权限时，在你自己的电脑上运行以下命令，将 `user@server` 替换为服务器登录地址，并保持 SSH 会话运行：

```bash
ssh -N -L 4174:127.0.0.1:4174 user@server
```

然后在自己电脑上打开 <http://127.0.0.1:4174>。如果本地 4174 已被占用，改为 `-L 14174:127.0.0.1:4174`，浏览器相应访问 `http://127.0.0.1:14174`。云开发环境可使用其端口转发功能，将服务端 4174 映射到平台提供的访问地址。

需要分享临时预览且服务器已安装 `cloudflared` 时，在服务所在机器的另一个终端运行：

```bash
cloudflared tunnel --url http://127.0.0.1:4174 --no-autoupdate
```

打开输出中的 `https://<随机名称>.trycloudflare.com`，并通过该地址重新检查首页和 `/health`。这是公开的临时链接，预览应使用可公开的数据并保持只读，不配置 `WP_KNOWLEDGE_WRITE_TOKEN`；也要检查已有 `.env.local` 是否启用了写权限。隧道通过出站连接转发，本地服务仍可监听 `127.0.0.1`。应用或隧道停止后页面不可用，隧道重新创建时地址会变化；它不能作为长期部署地址。

#### 启动排错

| 现象 | 检查与处理 |
| --- | --- |
| 服务器本机返回 200，自己电脑打不开 | 按上文设置 SSH、平台端口转发或临时隧道；本机探测成功不代表外部可访问。 |
| `.env.local not found. Continuing without it.` | 首次只读预览没有该文件也可启动；这条提示本身不是失败。 |
| `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` | 核对 Node 版本、当前提交和未提交改动。主线启动脚本直接运行 TypeScript；旧工作区中的参数属性等语法可能不兼容。先修复代码或更新主线，不把临时 `--experimental-transform-types` 当成标准启动步骤。 |
| `EADDRINUSE` | 检查端口是否已有旧服务；停止已确认的旧实例，或设置 `WP_KNOWLEDGE_PORT=4175 npm run knowledge:serve`，并同步调整访问与转发端口。 |
| Console 数据为空、无法创建批次 | 空运行目录没有演示数据；默认只读。真实执行还需有效 DSH 配置、来源权限和场景文件，见下文。 |

#### 模型配置与写入

若仅在受信本机测试 feedback 写入：

```bash
WP_KNOWLEDGE_WRITE_TOKEN='<local-secret>' npm run knowledge:serve
```

不要把 token 提交到仓库，也不要在公网明文 HTTP 上启用写操作。公网只读部署和 TLS 要求见[运维手册](Operations.md)。

在治理模式打开“Agent 设置”，保存公开 HTTPS 的 DeepSeek Chat Completions 兼容地址、API Key 和模型，再执行“验证并启用”。探测只调用模型列表，不生成内容。DSH 使用原生 sdk-minimal；验证过期或保存后未重新验证时，新批次明确失败，不切换为 Fixture。旧 Pi 设置只读显示迁移状态，需要重新输入凭据并验证 DSH。

DSH 对 JSON/Schema 非法输出做有界重试。`WP_DSH_MAX_SCHEMA_ATTEMPTS` 默认 2、范围 1..3；`WP_DSH_MAX_TOKENS` 默认 32768，`WP_DSH_CONTEXT_WINDOW` 默认 128000。每次尝试新建会话，执行参数进入非秘密摘要，恢复时不一致则拒绝。

### 7. 运行项目工作流

准备符合项目场景 Schema 的 JSON 文件和包含所需固定 commit 的受信源码仓库，然后运行（`--scenario` 必填）：

```bash
npm run knowledge -- workflow-run --scenario /path/to/scenario.json --repository /path/to/project
```

命令创建 `FlywheelRun`，由 LangGraph 调度角色、独立评测和发布。默认执行框架是 DSH，显式 `WP_FLYWHEEL_AGENT_PROVIDER=fixture` 仅用于带 Fixture Adapter 的自动化验收。通用场景禁止夹具答案字段，不能把预写资产当成真实模型输入。

运行 DSH 需要 Linux/Bubblewrap 及有效模型配置，来源目录须在 `WP_DSH_ALLOWED_ROOTS` 中；部署步骤见 [DSH 部署说明](Runtime.md)。R1 自动化使用受控模型服务，真实模型范例由 R2 单独验收。

公司 CodeAgent CLI 不是当前外部第一版的启动前提。现有 `company-codeagent-cli` 选项和 [`.env.example`](../.env.example) 记录的是 Adapter 的协议假设，不是已验证的真实 CLI 使用说明；用户反馈与其启动参数、认证字段、session 格式存在差异。后置的 DEV-010 必须先取得实际版本的帮助信息和脱敏输入输出，修正适配并验证后再提供可用步骤。不能仅配置开关就宣称接入成功。

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

- 想理解用户完整使用路径：阅读[用户用例与交互时序](specs/domainFunction/services/workflow/Workflow.md)。
- 想完成真实评测与发布：阅读[行为评测与发布](Operations.md)。
- 想修改实现：阅读[开发指南](Development.md)。
- 想理解为什么 Agent 不能自行发布：阅读[评测模型](specs/domainFunction/services/Evaluation.md)和[发布门禁](specs/domainFunction/services/Evaluation.md)。

## 路径 B：交给 Agent 配置和启动

把下面整段 Prompt 交给有终端和文件访问能力的 Agent。它要求 Agent 保留已有改动、跑真实门禁，并以只读模式启动服务。

```text
请从 0 到 1 配置并启动 domain-knowledge。你需要实际执行命令、处理可安全修复的问题，并在最后给出可核对的结果。

仓库：https://github.com/linlisWorkTeam/domain-knowledge

执行要求：
1. 如果当前目录已经是 domain-knowledge，先检查 git status、当前分支和提交，保留所有未提交改动；否则克隆 main 并进入目录。需要更新时先 fetch 并核对差异，只有工作区干净且可快进时才切到 main 更新。不要覆盖用户文件。
2. 阅读 AGENTS.md、最新 docs/epitaph/ 交接、README.md、CONTRIBUTING.md、docs/GettingStarted.md 和 docs/specs/README.md。交接只作为上下文，以本次请求为准。
3. 检查 Git、Node.js 和 npm。Node.js 必须是 24 或更高版本；版本不满足时，使用机器已有的版本管理器升级，并说明改了什么。
4. 执行 npm ci、npm run typecheck、npm run validate:specs、npm test。若新建 worktree，以 npm run bootstrap:worktree 安装并确认 status: READY，不共享 node_modules。任何门禁失败都要先定位原因；不得跳过测试、降低阈值或伪造通过结果。
5. 使用同一个运行目录初始化（.workpanel 是默认目录；若需隔离实验，三条命令都替换为同一个新路径）：
   WP_FLYWHEEL_HOME=.workpanel npm run knowledge -- init
   WP_FLYWHEEL_HOME=.workpanel npm run knowledge -- status
6. 以只读模式启动 Console：
   WP_FLYWHEEL_HOME=.workpanel npm run knowledge:serve
   检查 http://127.0.0.1:4174/health、首页和 /api/v1/system/status，并保持进程运行。
7. 除非我明确要求公网访问，否则只监听 127.0.0.1。服务在远程机器时，提供 SSH 或平台端口转发步骤；公网预览则验证实际外部链接并说明有效期。不要设置 WP_KNOWLEDGE_WRITE_TOKEN；检查环境及 .env.local 是否已有写权限配置。不要把 token、数据库、CAS 或 .workpanel 提交到 Git。
8. 不得手工把候选状态改成已验证，不得调用已经退休的评分、评测或摄取命令，也不得把确定性夹具写成真实模型质量证明。
9. 最后报告：当前分支和提交、实际 Node/npm 版本、运行过的检查及结果、服务 PID、可访问地址及转发方式、停止方法、运行目录、git status，以及仍未解决的问题。若服务无法启动，保留完整错误摘要并给出下一步。
```

### Agent 完成后，你要看什么

- 四个门禁命令是否真的退出 0，而不是只写“应该通过”；
- 服务是否通过 `/health`，访问地址是否仍是本机 `127.0.0.1`；
- `git status` 是否只包含原有改动，没有新增运行数据或密钥；
- Agent 是否把查询为空解释为“尚无 VERIFIED”，而不是绕过 Gate 手工改状态；
- 失败时是否留下命令、错误摘要和下一步，而不是降低测试或安全要求。
