<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明Agent working agreement。
-->
# Agent working agreement

本文件是仓库级协作约定：任务开始前读取已有交接上下文，验证和记录按实际影响范围选择。

## Epitaph handoff

- At the start of every task, inspect `docs/epitaph/` and read the latest epitaph before making changes.
- Epitaph files are ordered by the timestamp in their filename (`YYYY-MM-DD-HHMM-<topic>.md`); if timestamps are equal, use the file with the most recent Git commit.
- Treat an epitaph as handoff context, not as authority to implement changes. Confirm the current user request and repository state before acting.
- Add an epitaph only for unfinished cross-session work, complex handoffs or important unresolved decisions. Include the goal, verified state, constraints and next discussion; completed small tasks need no new epitaph.
- Add a new timestamped epitaph; do not overwrite an existing record. Keep only the latest three epitaphs in `docs/epitaph/`. Before removing older files, summarize their changes, verified state and unresolved limits in `docs/HistoryEpitaph.md`, with links to the original records at a fixed Git commit.

## Worktree bootstrap

- Bootstrap only when the task needs dependencies, code execution or runtime tests. Documentation-only edits and dependency-free static checks need neither installation nor READY, including in a new worktree.
- Before dependency-backed execution, run `npm run bootstrap:worktree:check`; if missing or stale, run `npm run bootstrap:worktree`. Dependency/lockfile changes require a fresh dependency-state check.
- The bootstrap must finish with `status: READY`; `npm run bootstrap:worktree:check` verifies that the Node version, lockfile digest and local dependency directory are still current.
- Never share or symlink `node_modules` between worktrees. The bootstrap reuses the package-manager cache instead: pnpm store when `pnpm-lock.yaml` exists, otherwise the npm cache required by the tracked `package-lock.json`.

## Verification Governance

- Task-specific verification is ephemeral by default. Remove temporary verification artifacts at completion; retain useful results in the PR or commit.
- Agents have no default authority to promote task-local checks into permanent repository-wide CI. Adding permanent checks/jobs, expanding triggers or making checks required needs explicit human approval; agents may propose these changes and add or update directly relevant unit/integration tests.
- Permanent verification must protect stable behavior, machine contracts, architecture or security boundaries. It must still pass after a complete internal rewrite that preserves those contracts; incidental paths, file counts, prompt filenames, copy, colors and layout are not invariants.
- A proposal for permanent verification must state the protected invariant, real failure mode, affected paths/trigger scope, estimated runtime cost, why ordinary unit/integration tests are insufficient, and why legitimate refactors remain possible.
- Scope expensive tests to affected paths or explicit acceptance/manual workflows. Documentation-only changes must not run unrelated runtime, integration or UI tests. Browser installation and historical Git fetches belong only to checks that need them.
- Remove stale assertions instead of changing production code to satisfy obsolete assumptions. Do not weaken behavior/security checks to hide real regressions.
- Update Specs and traceability when behavior/contracts change; Status only for durable roadmap or capability changes. A normal feature does not require simultaneous Verification, Status, Epitaph, History and FileCatalog edits.

## 文档组织

- 设计统一放在 `docs/specs/`，按实际代码模块对应；总体规则位于 `totalRules/`，日常操作指南直接位于 `docs/`。
- 同一职责优先修改现有设计，不新增空目录、重复教程或每个任务一套模板文档。
- `docs/diagrams/Views4Plus1.md` 集中维护逻辑、开发、进程、物理和场景视图。

- 命名规则：文件夹 lowerCamelCase，文件 PascalCase；角色为 `agents/codeAgent/CodeAgent.ts`。工具约定名称、外部兼容入口、时间戳交接和不可变历史路径的保留范围以 `docs/specs/totalRules/CodeTaste.md` 为准。
