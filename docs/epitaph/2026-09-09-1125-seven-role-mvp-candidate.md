<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接七角色 MVP 已实现候选、验收证据及真实模型凭据阻塞。
-->
# 七角色 MVP 安装候选交接

用户要求按七角色 MVP 计划实施并注意 ECS 约 3.6 GiB 内存、无 swap 的限制。主实现位于 `/tmp/domain-knowledge-mvp`，分支 `feat/seven-role-mvp`，草稿 PR https://github.com/linlisWorkTeam/domain-knowledge/pull/38。原 `/root/projects/domain-knowledge-wxc` 的在途源码修改保留；这里只增加新的交接记录，不应重置或覆盖其工作树。

已实现七角色材料与阶段约束、概要/正文和 H2 修订、参考晋升与固定门禁、独立模块重建评测、3 轮/30 分钟持久预算、取消、可恢复本地 Markdown 发布、默认关闭的手动 Git、浏览器操作和离线 Linux 安装包。详见 docs/Status.md 和 docs/LinuxInstall.md；Issue #20/#33/#34/#35 的通用搜索、全仓库调度及复杂回退仍延期，不要关闭这些 Issue。

验证：本地 280/280、Console 19/19、类型和规范通过；CI 34306722454 全部通过。CI 安装 bwrap 和 Noto CJK，并只为临时 CI 的 bwrap 授予 userns；没有改变 ECS 的内核策略，没有放宽截图阈值。原生 DSH 使用真实 Bubblewrap，内部探针确认授权材料可见而同级参考文件不可见。安装 CLI 修复 current 符号链接入口，预检必须实际执行并返回明确错误。

交付目录 `/root/projects/domain-knowledge-releases/v0.2.0-candidate` 保存约 170 MiB 的 .run、SHA-256、依赖及许可证清单和 evidence。安装候选提交 `026326aa56ddc0bf8abe8a49988d6c93dd554c9b`，安装包 SHA-256 `39b633171bc90fd4f4a4f6508e9bbedbfa83d0c34bfcce67beb292ba93922e82`；之后只有 CI 与交付文档修改。该产物在断网、无开发工具的 OpenCloudOS 最小目录中通过参考 140/140、完整飞轮 5/5、DSH 1/1、HTTP、重启、升级和卸载保留数据。此环境共用宿主内核；升级是模拟旧版本目录，不能声称另一台新 VM 或真实历史版本升级。实际安装浏览器桌面/640px 截图已审阅。

真实模型仍为 0/3 次：旧 DSH 配置中找到 https://opencode.ai/zen/go/v1、deepseek-v4-flash 和 apiKeyEnv=OPENCODE_GO_API_KEY，但环境及已知任务配置未找到可用凭据。已向用户询问本机凭据文件路径或环境变量名，尚未收到答复。不要搜索其他应用的凭据或要求发送密钥正文。安装版预检为 ACCEPTANCE_PROVIDER_REQUIRED，没有 MvpAcceptanceLedger.json，不消耗次数。未合并 PR、未打标签、未发布正式 Release，不能宣称已验收 MVP。

预览已安装在 `/root/.local/share/domain-knowledge-mvp`，服务和浏览器已停止释放内存；使用 `knowledge start` 后通过 SSH 端口转发访问 4310，认证文件在 data/Configuration.env，切勿打印或分享其中令牌。取得用户凭据后，在同一数据目录验证模型配置，再按 LinuxInstall 的 RunMvpAcceptance 入口运行。最多 3 次完整真实飞轮，每次最多 3 轮/30 分钟；失败、中断保留次数，不换目录或删账本重置。至少一次七角色完成、固定门禁通过且可追踪 Markdown 本地发布成功后，才可发布已验收 Release。

后续先核对 PR 和最新工作树状态、Node 24.13.0 的 bootstrap READY。ECS 上重任务严格串行，Node 堆 384 MiB、GOMAXPROCS=1；不与打包/浏览器同时跑模型。ohMyWorkPanel 原仓库仍干净，固定来源提交 1bf4c5894b3f196d2e2aba1d8db3aac77aef7095。正式发布前从最终受测提交重建，核对 v0.2.0 标签仍可用并核对产物摘要。
