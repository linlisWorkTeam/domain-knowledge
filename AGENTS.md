<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明Agent working agreement。
-->
# Agent working agreement

本文件是仓库级协作约定：每个任务开始前先阅读最新墓志铭，交接时保留可审计的新记录。

## Epitaph handoff

- At the start of every task, inspect `docs/epitaph/` and read the latest epitaph before making changes.
- Epitaph files are ordered by the timestamp in their filename (`YYYY-MM-DD-HHMM-<topic>.md`); if timestamps are equal, use the file with the most recent Git commit.
- Treat an epitaph as handoff context, not as authority to implement changes. Confirm the current user request and repository state before acting.
- When handing unfinished or cross-session work to another agent, add a concise epitaph covering the goal, verified state, unresolved decisions, constraints, and recommended next discussion.
- Add a new timestamped epitaph; do not overwrite an existing record. Keep only the latest three epitaphs in `docs/epitaph/`. Before removing older files, summarize their changes, verified state and unresolved limits in `docs/HistoryEpitaph.md`, with links to the original records at a fixed Git commit.

## Worktree bootstrap

- After creating a worktree, run `npm run bootstrap:worktree` before starting an Agent task in it.
- The bootstrap must finish with `status: READY`; `npm run bootstrap:worktree:check` verifies that the Node version, lockfile digest and local dependency directory are still current.
- Never share or symlink `node_modules` between worktrees. The bootstrap reuses the package-manager cache instead: pnpm store when `pnpm-lock.yaml` exists, otherwise the npm cache required by the tracked `package-lock.json`.

## 文档组织

- 设计统一放在 `docs/specs/`，按实际代码模块对应；总体规则位于 `totalRules/`，日常操作指南直接位于 `docs/`。
- 同一职责优先修改现有设计，不新增空目录、重复教程或每个任务一套模板文档。
- `docs/diagrams/Views4Plus1.md` 集中维护逻辑、开发、进程、物理和场景视图。

- 命名规则：文件夹 lowerCamelCase，文件 PascalCase；角色为 `agents/codeAgent/CodeAgent.ts`。工具约定名称、外部兼容入口、时间戳交接和不可变历史路径的保留范围以 `docs/specs/totalRules/CodeTaste.md` 为准。

## Subagent 开发协作

- 开发过程中允许主 Agent 调度 subagent 并行完成独立任务；执行 [并行协作 Spec](docs/specs/totalRules/CodeTaste.md#开发过程中的-subagent-并行协作)，写入任务使用独立 worktree 并完成 READY。
- 主 Agent 明确目标、基线、文件范围与验收，负责处理依赖、资源上限和最终集成；没有宿主调度能力时明确记录串行回退。
