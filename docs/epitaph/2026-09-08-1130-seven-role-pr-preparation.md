<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明七角色重构 PR 交付准备。
-->
# 七角色重构 PR 交付准备

用户要求创建 PR 审查七角色 DDD 重构。GitHub API 已核验为 `skelitalynn`；目标仓库 `linlisWorkTeam/domain-knowledge`，base 为 `main`，head 为 `refactor/seven-role-domain-agents`，不自动合并。

原工作区 `/root/projects/domain-knowledge-wxc` 的内容保持原状。项目解耦和 OpenCode Go 已通过 #32 合入，因此从 `origin/main` 的 `32da1d8` 建立独立 worktree `/root/projects/domain-knowledge-agent-pr`，仅迁入七角色重构。保留 main 上最新文档和 OpenCode Go profile 修复，没有回退它们。

新 worktree 用 Node 24.13.0 执行 bootstrap，结果 `READY`，依赖目录独立。类型检查、规范校验、完整测试 **219/219**、Console **14/14** 均通过，完整测试包含架构和七角色回归。提交前 `git diff --cached --check` 通过。日志位于 `/tmp/ddd-refactor/pr-tests.log` 与 `/tmp/ddd-refactor/pr-console.log`。

角色开发与阅读入口见 `docs/guides/agent-customization.md`。重构范围、保留行为及真实模型未验收的边界见上一份交接。PR 正文按仓库模板准备于 `/tmp/ddd-refactor/pr-body.md`。后续以 PR 审查意见为准，不扩展为抽象工厂或新增角色能力。
