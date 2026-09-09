<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接模型连接生成验证修复及受控证据。
-->
# 模型连接生成验证修复交接

目标：修复仅 GET models 就 VERIFIED 的误判。范围是显式用户验证；不调用外网模型、不读取实际密钥、不重新执行已耗尽预算的真实飞轮。

实现从 cff8fc1 开始，独立 worktree /tmp/domain-knowledge-mvp-validation，bootstrap READY；提交 7c2beab 为共享阶段证据 Port，552ca1a 为 App 启用门禁及旧记录降级，20f81e6 为实际生产 DSH 探针和规范。随后合入主 Agent 的 f159b89（本树 d98ba3a）补按调用 token 上限。

探针依次检查列表和生产 ConfiguredDshProvider.run：原生 session / 产品 UA / streaming、Bubblewrap、临时空目录、无授权工具、64 token、最多一次上游请求、一次 Schema 尝试、64 KiB 响应/输出、30 秒总期限含 ECS 串行队列。失败、超时、取消返回固定分阶段码，等待子进程退出后清理。旧 READY 设置保持可读，但不作为新 Run 已验证配置，也不自动产生费用。

实际受控证据：

- ProviderOperations + ProviderSettings 安全测试 7/7，约 1 秒；包括旧记录、保存不生成、已取消不调用、密文及固定 DNS。
- ProviderGenerationProbe 15/15，6.2 秒；日志 /tmp/mvp-provider-probe-tests.log。真实本地 DSH/Bubblewrap，实际 HTTP 为 64 token；模型列表成功后的生成拒绝、无效 JSON、重定向、工具往返、输出限制均不能启用且只有一次生成请求；取消清理、排队超时、列表失败/超时通过。
- 新增生成挂起期间总超时单项 1/1，2.6 秒；不重试，目录清理。
- 合入 token 上限后，DshConfiguredProvider 定向 2/2，2.55 秒；日志 /tmp/mvp-provider-token-ceiling.log。request64/config256 实际 HTTP64，request512/config128 两次 Schema 会话均 HTTP128。
- 单次 typecheck 通过，日志 /tmp/mvp-provider-probe-typecheck.log；git diff --check 通过。测试 Node24、小堆192MB、GOMAXPROCS1，全部与主 Agent 串行运行。

剩余集成：产品 Agent 负责连接费用文案、checks 展示、Console fixture、Server response 断开取消及受控 HTTP 回归；主 Agent 统一升级其余 providerProbe fixture 的 READY 至 GENERATION_READY + 双 PASSED，并跑最终回归。新增接口可选字段使历史记录可读，但旧成功 fixture 不能再伪装为实际生成验证。全部证据均是受控协议回归，不证明真实提供方连接成功或完整 MVP 门禁通过；未创建 Release。
