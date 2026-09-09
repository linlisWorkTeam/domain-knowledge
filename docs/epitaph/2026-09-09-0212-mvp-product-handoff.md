<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接七角色 MVP 产品边界与尚待主 Agent 集成的验收事项。
-->
# MVP 产品组交接

在独立 worktree `/tmp/domain-knowledge-mvp-product` 实现本地发布、手动 Git、Console 与离线安装脚本。开始前读取最新领域目录调整交接并验证 bootstrap READY；未安装依赖，检查单进程顺序运行，未启动 DSH、浏览器或打包。

已实现 `PublicationOperations` / `LocalPublicationPort` / `LocalMarkdownPublisher`：持久化 SQLite v1 outbox、fsync 原子版本目录、原始证据和摘要绑定、重试幂等、目录授权与来源目录交叠限制、已发布 Markdown 阅读、默认关闭的 Git 手动同步、冲突不强推。HTTP `/api/v1/publications`、`/server-directories` 和 `/runs/markdown-lite` 仅可认证调用；远程其他 API 也校验访问令牌。Console 移除场景 JSON，保留既有进度、取消和差异阅读，新增目录及发布配置。

主 Agent 尚需在 Composition 创建 `PublicationOperations(new LocalMarkdownPublisher({runtimeDir, defaultDirectory?, directoryRoots, excludedRoots}))`，注册 `apps.publicationOperations` 并关闭底层端口；在确定性门禁和领域 publish 完成后传入 publicationKey、gateDecisionId、运行/版本/模块、title/body、sourceCommit/sourceDigest、evidenceRefs。`apps.markdownLite.start(repositoryRoot)` 的工厂接线由主 Agent 实现。Server 已按这些应用接口消费。

验证：Publication 集成 5/5、HTTP 1/1、架构 7/7、TypeScript、Spec 校验、JS/shell 语法和 diff 检查通过。尚无浏览器视觉证据、实际安装包、干净安装验收或真实模型结果，不能据此发布已验收 MVP。

打包脚本 `scripts/release/BuildLinuxBundle.mjs` 要求干净提交和 Node 24，不联网下载；携带 node_modules、Node/Git/Bubblewrap/Bash/prlimit 及匹配系统动态库，分离应用版本与数据，默认卸载保留数据。启动通过 PATH、GIT_EXEC_PATH、LD_LIBRARY_PATH 与 WP_DSH_BWRAP_BIN 定位随包工具。构建/安装必须在主 Agent 协调的单独资源窗口执行，核对同提交与摘要；默认仅支持 OpenCloudOS 9.4 x86_64。下次讨论重点是工作流发布失败恢复接线、允许目录列表、低资源安装验收与真实飞轮门禁证据。
