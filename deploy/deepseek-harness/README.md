# DeepSeek Harness 部署

这个目录保存知识飞轮调用 DeepSeek Harness 时使用的无密钥配置。Harness 是 Agent 执行基础设施；知识版本、评测、Gate 和发布仍由 domain-knowledge 持有。

<details lang="en">
<summary>English summary</summary>

This deployment runs DeepSeek Harness through its official stdio JSON-RPC SDK. Credentials stay in environment variables, role-specific workspaces are mounted with Bubblewrap on Linux, and domain-knowledge remains authoritative for knowledge governance and publication.

</details>

## 本地准备

Harness 仍处于开发者预览阶段，所以仓库把 `@deepseek-ai/dsh` 和 `@deepseek-ai/dsh-sdk-client` 固定在 `0.1.2-alpha.4`。`opencode-go.cordis.yml` 使用 OpenCode Go 的 OpenAI 兼容端点和 DeepSeek V4 Flash；`provider.cordis.yml` 是备用的 Anthropic Messages 兼容配置。任何密钥都不得写入仓库。

```bash
npm install
bwrap --version
```

默认生产形态要求 Linux 与 Bubblewrap。缺少 `bwrap` 时，`deepseek-harness` Provider 会启动失败，不会悄悄退回无遮罩的宿主工作区。

## 接入知识飞轮

```bash
export WP_FLYWHEEL_AGENT_PROVIDER=deepseek-harness
export WP_DSH_PROVIDER=opencode-go
export WP_DSH_MODEL=deepseek-v4-flash
export WP_DSH_PROCESS_ISOLATION=bubblewrap
export WP_DSH_ALLOWED_ROOTS='/absolute/path/ohMyWorkPanel'
export WP_DSH_TIMEOUT_MS=600000
export WP_DSH_MAX_SCHEMA_ATTEMPTS=2
export WP_FLYWHEEL_HOME='/absolute/path/domain-knowledge/.workpanel/live-sdk'
export DSH_HOME="$WP_FLYWHEEL_HOME/dsh"
export DSH_PERMISSION_MODE=read-only
export DSH_TELEMETRY_DISABLED=1
export OPENCODE_GO_API_KEY='<runtime-secret>'

npm run knowledge -- workflow-run \
  --repository /absolute/path/ohMyWorkPanel \
  --workers 1 \
  --max-iterations 3
```

组合根为每个节点建立不可变角色工作区。DocWorker、DocGen、TestGen 可读场景声明的来源文件；代码生成、Check、Review 角色只挂载公开接口，候选知识、代码与评测证据通过 CAS 内容按角色白名单注入。`code` 的输出 Schema 把 `files[].path` 收紧到场景的 `allowedGeneratedPaths`，模型即使提出测试或配置文件也不能越过边界。这里的 `code` 是图节点角色，由 `DeepSeekHarnessSdkAgent` 执行，不是独立的 CodeAgent CLI。

Prompt 通过官方 SDK 的 stdin JSON-RPC 传输，不出现在进程 argv。Provider 对最终回答执行 JSON 解析与调用方 Schema 校验；审计只保存 Prompt/Schema 的 SHA-256、角色、Run/Node 关联、耗时、状态和错误分类，不保存 Prompt 正文或密钥，位置为 `$WP_FLYWHEEL_HOME/demo/agent-runs.jsonl`。Harness Session 位于按节点幂等键分开的 `DSH_HOME` 子目录。

JSON 无法解析或不符合 Schema 时，SDK Adapter 默认自动再试一次；每次尝试都使用新的 DSH session，并分别记录 `providerAttempt`。超时、取消、权限拒绝、路径拒绝和完整性错误不会借这个机制重试。可用 `WP_DSH_MAX_SCHEMA_ATTEMPTS=1..3` 调整上限，默认 `2`。

需要诊断旧版 Headless 行为时，可显式设置 `WP_FLYWHEEL_AGENT_PROVIDER=deepseek-harness-headless` 与 `WP_DSH_COMMAND`、`WP_DSH_ARGS_JSON`。这条兼容路径会把 Prompt 放进 argv，没有进程级源码隔离，只用于迁移和故障对照，不是推荐部署。

2026-09-02 的完整实跑记录保存在 [wpKnowledge](https://github.com/linlisWorkTeam/wpKnowledge/blob/main/knowledge/3.workpanel/%E8%AF%81%E6%8D%AE/2026-09-02-DeepSeek-Harness%E7%9C%9F%E5%AE%9EAgent%E6%B2%BB%E7%90%86%E6%BC%94%E7%A4%BA.md)。

## 公网演示界面

`web-public.cordis.yml` 把 WebServer 绑定到 `0.0.0.0`。Harness 会输出一次性认证 URL；首页用该 URL 换取签名 Cookie，普通未认证请求返回 401。启动时必须把公网 authority 加入 trusted host：

```bash
export WP_DSH_WEB_PORT=3080
npx --yes @deepseek-ai/dsh@0.1.2-alpha.4 web \
  --patch "$PWD/deploy/deepseek-harness/opencode-go.cordis.yml" \
  --patch "$PWD/deploy/deepseek-harness/web-public.cordis.yml" \
  --trusted-host '<公网 IP>:3080' \
  --no-open
```

认证 URL 等同管理员凭据，不得写入仓库、日志示例或截图。当前配置没有 TLS，只用于短期演示；长期部署必须在前面增加 HTTPS 反向代理和独立身份认证。

## 安全边界

- 自动治理使用 `read-only` Harness 权限；生成代码通过 JSON Artifact 返回，不允许 Agent 直接修改受治理仓库。
- `WP_DSH_ALLOWED_ROOTS` 是来源复制白名单。路径穿越和符号链接会被拒绝；Bubblewrap 只挂载该节点的角色工作区、运行依赖、独立 DSH_HOME 与可信 patch，不挂载参考仓库。
- Bubblewrap 保留模型 Provider 所需的网络，隐藏宿主项目树并遮蔽 PID 1 的环境读取；它解决的是 Agent 的源码可见性，不是生成代码执行安全。
- 当前 `TrustedProjectEvaluator` 只能运行受信项目命令。完成 hostile-code 沙箱、资源限额和网络策略前，不要向任意公网用户开放工作流启动权限。
- DeepSeek Harness Web 自身不提供可直接暴露公网的 TLS 或通用登录层；公网部署应放在带认证的反向代理之后。
