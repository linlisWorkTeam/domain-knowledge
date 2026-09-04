# DEV-010 公司 CLI 环境阻塞交接

## 目标

在公司已登录环境完成 CodeAgent CLI 最小协议探测、固定七角色真实闭环和效果基线，且不改变 Domain/Application、固定拓扑或现有 HTTP API。

## 已核验状态

- DEV-010 worktree 为 `/tmp/domain-knowledge-dev010`，分支 `codex/dev010-codeagent-live`，基线为 `origin/main` 的 `a6e56a6`。
- `command -v codeagent`、`codeagent --version` 与 `codeagent auth status --json` 均确认当前环境没有 `codeagent` 可执行文件。
- `WP_CODEAGENT_BIN` 与 `WP_FLYWHEEL_AGENT_PROVIDER` 未配置；在 `/opt`、`/usr/local/bin` 和 `/usr/bin` 的受限查找也没有发现同名二进制。
- 因认证预检尚不能启动，本轮没有生成 live Run、session、质量、延迟、吞吐或人工采纳率证据，也没有把协议夹具冒充 live 结果。

## 阻塞与约束

1. 需要提供已安装且已登录的公司 CodeAgent CLI 环境，或给出真实可执行文件绝对路径及必要的非秘密参数。
2. 获得环境后先运行 `codeagent auth status --json` 和不含业务数据的最小 stdin/JSONL 探测；实际协议不一致时只调整 Infrastructure Adapter 和部署配置。
3. live 验收仍须覆盖七角色闭环、认证续期、模型不可用、超时/取消、session 恢复、Schema 失败率、P50/P95、吞吐与人工采纳率。
4. `code` 角色的工具限制和固定 commit 公开接口视图必须实测；敌对代码执行安全与完整权限拒绝审计仍属于 DEV-012。

## 推荐下一步

- 在本 worktree 中设置 `WP_CODEAGENT_BIN`（若命令不是默认的 `codeagent`），确认部署账户登录后重新执行认证与最小协议探测。
- 只有协议、闭环和效果证据完整时才将 DEV-010 标为 Done；否则保留 Blocked 或 In Progress，并记录缺失证据。
