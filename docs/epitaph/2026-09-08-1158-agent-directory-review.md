<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：记录七角色 PR 的命名、注释和目录审查修改，交代验证范围。
-->
# 七角色目录审查交接

当前工作位于独立 worktree `/root/projects/domain-knowledge-agent-pr`，分支 `refactor/seven-role-domain-agents`，更新 PR #36；原工作区不动，不合并 PR。

七角色文件统一为 PascalCase 和 `XxxAgent` 角色目录。全仓库 TypeScript 文件同步改名；按用户特别要求，旧导入文件为 `src/domain/migration/legacyOkf.ts`。源码和可注释文本新增 copyright、MIT 标识与中文文件说明，公开契约及核心步骤新增中文注释。JSON、锁文件与二进制资源的说明集中在 `docs/reference/FileCatalog.json`。

业务流程规则和角色节点映射位于 `src/domain/services/workflow/`；LangGraph 执行适配器位于 `src/infrastructure/langgraph/`；基础设施说明位于 `src/infrastructure/README.md`。模型适配器目录为 `agentAdapters/`；取消 `persistence/`，SQLite 与 Redis 直接挂在 Infrastructure 下。来源扫描、旧 OKF 迁移和固定 Git 提交的角色工作空间归入 Domain，并移除其 Application 依赖。

用户提出删除 `security/`，检查发现其凭据加密与 HTTPS 校验仍在使用。已删除该目录，将功能分别移到 `agentAdapters/provider/ProviderSettings.ts` 与 `http/PublicHttps.ts`，保留原调用行为。工作空间用于按角色文件白名单提供固定提交源码，保留原有文件系统和 Git 行为。资源模块的现有 Node 与 YAML 依赖在架构契约中逐文件列明；角色代码仍不依赖这些资源实现。

用户明确要求快速重构且不再运行测试。本轮只执行类型检查、导入和文档路径检查及 diff 检查；没有重新运行单测、集成、Console 或规范测试。此前 219/219 与 Console 14/14 属于旧提交，不能作为当前改动后的验收结论。真实模型效果尚未验证。后续由用户审查目录和代码，再决定回归测试时机。
