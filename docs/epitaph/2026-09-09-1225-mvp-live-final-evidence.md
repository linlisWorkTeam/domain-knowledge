<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接真实运行失败后的最终安装候选、验证证据和未解决界面问题。
-->
# 真实验收后的最终候选

接续 1219 记录。用户早已提供的 OpenCode Go 密钥已找回并验证，deepseek-v4-flash 真实验收启动 3/3 次，均无完整七角色门禁或 Markdown 发布。不要再要求用户重复密钥。第一次缺会话头；第二次候选预期和 H2 层级失败；第三次两条源码引用结束行少一行，事实校验失败后取消剩余调用。已验证安装 CLI 返回 ACCEPTANCE_LIMIT_REACHED 且账本摘要不变，没有发起第四次模型调用。后续真实验收需要新的用户预算授权，不删账本或改原失败输出。

最终包源提交 186702547abadddf18c2cbeda4af4b2ad859f493，SHA-256 2ce0e4eb4b3c0b5d21f0ce9c5e1d1084a29f7d1c01a0b8747ed095d579cf41ce。281 项回归、类型/规范、CI 34310536570 的 281 项测试和 19 项 Console 检查通过。最终包断网安装、140/140 参考、5/5 受控飞轮、1/1 原生隔离、重启/模拟升级/卸载数据保留通过。当前提交只补最终状态文档，不改变受测应用。

实际安装浏览器确认已验证的原模型配置、空密钥输入框、目录选择、Git 默认关闭及桌面/640px 布局正常，无 API 写入；视觉审阅发现前两次可恢复失败在批次列表仍显示业务 GENERATING，尚未合并执行失败状态。该项未解决，必须如实列为未通过验收；不能以 19 项受控浏览器测试替代真实状态表达的验收。前一版本取消留下的一条陈旧 RUNNING 节点及虚高累计 token 审计保持历史原样，进程已确认退出；代码已修复新调用的累计快照统计和取消清理等待。

详见 docs/Status.md 及 /root/projects/domain-knowledge-releases/v0.2.0-candidate/evidence/Acceptance.json、real/ 和 browser/configured/。候选不是已验收 MVP；PR #38 保持草稿，未打标签、未创建正式 Release。/root/.local/share/domain-knowledge-mvp 已更新最终安装包并停止，data 中凭据、账本、运行记录保留。原 ohMyWorkPanel 只读且干净。主工作树 /tmp/domain-knowledge-mvp；原 domain-knowledge-wxc 只追加本记录，其他在途变更不动。ECS 重任务串行、Node 24、小堆和 Go 单线程约束继续有效。
