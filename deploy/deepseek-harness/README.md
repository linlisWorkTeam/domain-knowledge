# DeepSeek Harness 部署

LangGraph 编排七角色，DSH 负责模型、会话和工具执行。知识、工件、独立评测与发布仍归 domain-knowledge。R1 验证原生 DSH 与受控模型服务；真实 CPU 范例及模型质量由 R2 验收。

<details lang="en">
<summary>English summary</summary>

The default role framework is DSH, using its native sdk-minimal profile. Configure and verify the model in the Console. Linux deployments require Bubblewrap. Business contracts, evaluation and publication remain owned by domain-knowledge; live model quality is evaluated separately.

</details>

## 本地准备

使用 Node 24，执行 `npm ci`；新 worktree 执行 `npm run bootstrap:worktree` 至 READY。锁定 DSH 与 SDK 版本均为 `0.1.2-alpha.4`。Linux 需安装 Bubblewrap，并用 `bwrap --version` 检查；缺少隔离工具时任务失败，不回退宿主目录或 Fixture。

```bash
export WP_DSH_ALLOWED_ROOTS='/absolute/path/to/project'
export WP_FLYWHEEL_HOME='/absolute/path/to/runtime'
export WP_DSH_PROCESS_ISOLATION=bubblewrap
npm run knowledge:serve
```

默认 Provider 为 `deepseek-harness`。治理模式下打开“Agent 设置”，保存公开 HTTPS 的 DeepSeek Chat Completions 兼容 API 地址、API Key 与模型，再“验证并启用”。验证只访问模型列表，不生成内容。旧 Pi 配置不会自动迁移凭据，旧 Pi Run 只读且拒绝恢复。

```bash
npm run knowledge -- workflow-run \
  --scenario /absolute/path/to/scenario.json \
  --repository /absolute/path/to/project \
  --workers 1 --max-iterations 3
```

场景字段见[API 说明](../../specs/10-interfaces/http-api.md)。通用入口不要求 ohMyWorkPanel 布局或预写资产；历史样例仍在 `acceptance/ohmyworkpanel/`。公司 CodeAgent CLI 不作为启动前置，其真实协议适配由 DEV-010 后置处理。

## 原生运行与配置

Console 配置使用原生 `sdk-minimal`，项目最后一层工具策略关闭命令行/编辑工具，在 DSH 注册只读 `read_material`。编排角色无工具，其余角色只读物化授权材料。DocWorker 只读分配的源码分块，Code 不读取参考实现；模型返回文件内容，应用校验后写入 CAS/评测工作区。

`WP_DSH_MAX_TOKENS=32768`、`WP_DSH_CONTEXT_WINDOW=128000`、`WP_DSH_MAX_SCHEMA_ATTEMPTS=2` 是默认值，尝试上限范围 1..3。JSON/Schema 失败才重试；每次独立 session/home。`WP_DSH_TIMEOUT_MS` 默认 600000，`WP_DSH_MAX_OUTPUT_BYTES` 默认 2097152。配置、隔离参数、工具策略摘要冻结到 Run；正在运行的批次保留配置，恢复则检查当前摘要是否兼容。

模型生成流量通过父进程内的受信 HTTP 转发固定已批准 DNS，拒绝重定向；实际上游密钥不传给 DSH，DSH 只得到本次转发令牌。新秘密位于运行目录 `secrets/dsh-provider-settings.enc` 与 `dsh-provider-settings.key`，AES-256-GCM、权限 0600。旧文件不改写。认证、Prompt 和模型原始内容不进入公开审计；Token 使用上游 usage，无可靠价格时成本为空。

运行审计为 `$WP_FLYWHEEL_HOME/demo/agent-runs.jsonl`，关联 Run/角色/session、Schema/Prompt 摘要、时长与状态。原始会话为运行数据，应按秘密管理，不提交仓库。

## 显式环境与诊断路径

已有环境部署仍可显式配置 `WP_DSH_PROVIDER`、`WP_DSH_MODEL`、`WP_DSH_PROFILE`、`WP_DSH_PATCHES_JSON` 与模型环境变量；没有 Console 设置时使用这些部署参数，状态明确为未验证。默认 profile 是原生 `sdk-minimal`；其他 profile/patch 属于管理员可信部署配置，其内容摘要也进入快照。

目录中的 `opencode-go.cordis.yml`、`provider.cordis.yml` 和 `web-public.cordis.yml` 保留用于 DSH 自身的历史调试，不是 Console 原生配置所需文件。它们可能使用上游 pi-ai 模型适配器；项目已移除直接 Pi coding-agent 框架依赖，DSH minimal 不加载 pi-ai。

`deepseek-harness-headless` 仅是显式诊断入口，Prompt 经 stdin 输入，没有等价的生产源码隔离，不是 SDK 失败时的回退。DSH Web 和知识飞轮 Console 是不同入口，后者由 `knowledge:serve` 提供。

## 边界

角色白名单与 Bubblewrap 控制 Agent 材料可见性。`TrustedProjectEvaluator` 仍只适用于受信项目，不能据此声称已具备敌对生成代码沙箱、公司 CLI live 兼容或生产容量。
