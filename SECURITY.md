# 安全策略

<details lang="en">
<summary>English summary</summary>

Do not disclose exploitable details, credentials or tokens in public issues or pull requests. The Console is read-only by default. `WP_KNOWLEDGE_WRITE_TOKEN` is a trusted-operator boundary, not full RBAC, and must not be exposed over plain public HTTP. The trusted evaluator limits commands and resources but is not an OS sandbox for hostile code.

</details>

## 支持范围

当前项目处于 P0-B 实现验证阶段，安全修复面向默认分支和维护者明确指定的活动开发分支。历史 `mvp-flywheel/` 不作为受支持的生产运行时；如问题只存在于历史实现，报告中请明确标注。

## 报告漏洞

请不要在公开 Issue、PR、讨论区或知识文档中提交未修复漏洞的完整复现、凭据、访问令牌或可直接利用的代码。

优先使用仓库 Security 页面提供的私密漏洞报告入口。若该入口尚未启用，请只创建一个不含漏洞细节的公开 Issue，请求维护者提供私密联系方式；在私密渠道建立前不要发送利用细节。

报告中建议包含：

- 受影响的 commit、命令、API 或组件；
- 最小复现条件和预期/实际行为；
- 数据、权限和可利用范围；
- 已知的临时缓解方式；
- 是否已经向第三方披露。

项目当前不承诺固定响应 SLA。维护者确认问题后，应先限制暴露面、保留证据并给出协调披露计划，再公开修复细节。

## 已知信任边界

- `WP_KNOWLEDGE_WRITE_TOKEN` 是受信操作员边界，不是完整的用户/资源/动作 RBAC。不要在公网明文 HTTP 上启用写 API。
- Web Console 默认只读。写入未配置 token 时 fail closed；浏览器中的治理 token 只应在受信会话使用。
- 固定项目验收会限制工具白名单、环境变量、路径、时间和输出，但子进程仍共享宿主机内核。它不能执行敌对或来源不明的代码。
- 通用 `evaluate` 接口摄取评测报告，不自行证明报告来自独立执行环境。操作员必须验证评测器和证据来源。
- `.workpanel/` 包含本地 Registry 和 CAS 运行数据。应限制文件权限、备份并避免提交到 Git。
- DSH Adapter 只能访问配置的 HTTP API，不应获得 shell 或直接发布权限。

更详细的数据、执行和发布边界见[数据边界 Spec](specs/09-security/data-boundaries.md)与[架构说明](docs/ARCHITECTURE.md#security-boundary)。
