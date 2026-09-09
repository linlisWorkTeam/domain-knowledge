<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接已找回凭据、三次真实验收失败及后续预算边界。
-->
# 七角色真实验收额度已用完

用户指出此前已发送 OpenCode Go 配置，复查本机用户消息后确实找到 9 月 8 日授权的地址、deepseek-v4-flash 和密钥。此前“缺少凭据”是漏查历史消息。已通过生产 ProviderOperations 加密保存并验证，凭据可用；不要再次要求用户提供或打印密钥。配置保存在 /root/.local/share/domain-knowledge-mvp/data/secrets，服务默认停止，运行记录和配置保留。

同一 data/MvpAcceptanceLedger.json 已使用 3/3 次启动额度：1) 139790ab-3d41-4ca0-9908-c8183854a4a9 缺 x-opencode-session；2) 95a61b77-f821-4292-821b-bd438cd5e1e8 候选测试错误预期及 DocGen H1 层级失败；3) 8d3237f4-de25-423d-8ef4-b0c5228af2d9 两条源码引用标注 11–19 行但多带下一行闭括号，来源校验失败后主动取消仍在生成测试的任务以节约资源。第三次报告为 CANCELLED，确定性失败另有诊断。三次均无完整七角色通过、无 Markdown 发布；不发布已验收 MVP Release，不删账本、不恢复旧 Run 规避上限。继续真实验收必须取得新的用户授权预算。

本轮修复了原生 DSH 会话标识转发及 User-Agent，补充静态推导、精确 H2 提示，修复 SSE 累计用量重复累加，并等待完整节点清理与审计写入后才结束取消。最终本地类型/规范及 281/281 回归通过；受控取消测试明确验证清理未完成时 cancel 不返回。真实调用没有再执行。旧数据库的虚高 token 数及第三次陈旧 RUNNING 节点投影保留，不能作为实际费用或活跃进程证据；检查确认真实 DSH 子进程已退出。

主工作树 /tmp/domain-knowledge-mvp，分支 feat/seven-role-mvp，草稿 PR https://github.com/linlisWorkTeam/domain-knowledge/pull/38。详细失败见 docs/Status.md 和 /root/projects/domain-knowledge-releases/v0.2.0-candidate/evidence/real；AttemptSources.json 绑定三次安装提交及摘要。交付目录的 Manifest、Acceptance.json、安装与浏览器证据记录最终候选的实际提交和受测 SHA-256，后续应读取并核对，不能混用先前 026326a、7287c7f、901ab18、3efa1c0 的产物。

保留 /root/projects/domain-knowledge-wxc 的在途修改；该工作树只追加本交接。Node 24.13.0，bootstrap READY，原 ohMyWorkPanel 固定提交 1bf4c5894b3f196d2e2aba1d8db3aac77aef7095 只读且干净。ECS 约 3.6 GiB 无 swap，所有重任务串行，Node 堆 384 MiB、Go 单线程。后续优先讨论有预算的阶段语义反馈，而非改写原失败输出或放宽门禁。
