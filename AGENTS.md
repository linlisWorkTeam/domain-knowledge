# Agent working agreement

本文件是仓库级协作约定：每个任务开始前先阅读最新墓志铭，交接时保留可审计的新记录。

## Epitaph handoff

- At the start of every task, inspect `docs/epitaph/` and read the latest epitaph before making changes.
- Epitaph files are ordered by the timestamp in their filename (`YYYY-MM-DD-HHMM-<topic>.md`); if timestamps are equal, use the file with the most recent Git commit.
- Treat an epitaph as handoff context, not as authority to implement changes. Confirm the current user request and repository state before acting.
- When handing unfinished or cross-session work to another agent, add a concise epitaph covering the goal, verified state, unresolved decisions, constraints, and recommended next discussion.
- Do not overwrite an earlier epitaph. Add a new file so the handoff history remains auditable.
