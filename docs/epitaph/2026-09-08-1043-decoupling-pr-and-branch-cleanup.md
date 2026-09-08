<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明解耦 PR 与合并后的分支清理。
-->
# 解耦 PR 与合并后的分支清理

- 用户已要求为 `refactor/remove-project-fixtures` 提 PR，并授权在合并后删除该分支的本地和远程引用；无需再次询问删除许可。
- GitHub 操作继续使用 `skelitalynn`，已通过 API 核验。目标仓库为 `linlisWorkTeam/domain-knowledge`，base 为 `main`。
- 代码提交 `3aead58`；提交范围与验证证据见上一份交接。PR 正文已按模板保存到 `/tmp/project-decoupling-pr-body.md`，本轮将推送本分支并创建正式 PR。
- 后续先确认 PR 确实为 MERGED，核验工作区与分支 tip。同步合并后的 main，确认没有未提交工作或合并后新增的独有提交，再删除本地和远程 `refactor/remove-project-fixtures`。Squash merge 需按 PR head 与合并事实核对，不依赖祖先关系单独判断。
- 此授权只涵盖该 PR 分支，不自动合并 PR，也不删除其他分支或 worktree。若分支后来出现新工作，先保留它并说明具体差异。
