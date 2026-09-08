<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明主目录清理与启动文档补充。
-->
# 主目录清理与启动文档补充

## 用户目标与结果

- 用户要求重新拉取远程 main、清理本地工作区并补充 README 与快速上手文档。
- 已执行 `git fetch origin main`，本地 main 快进至 `7f7c2b556ba6da9b28dbaea11b71fbded82f06d6`。文档修改放在基于该提交的 `docs/startup-main-access` 分支，本轮仅本地提交，未推送或合并远程。
- 更新 README.md、docs/GETTING_STARTED.md：主线获取、Node 版本选择、只读预览、初始化与空数据、SSH/平台端口转发、临时 HTTPS 隧道、停止与排错、Agent 启动交付要求；修正 PR #26 已合入状态和 workflow-run 必填 --scenario。

## 清理与恢复

- 原主目录分支 `codex/dev019-dsh-foundation` 基线 `9af91b4`，共 33 项未提交/未跟踪状态，包含旧 Pi→DSH WIP、草稿与历史交接记录。
- 清理前完整保存 tracked binary patch、untracked tar.gz、原分支/提交/状态和 worktree 清单至 `/root/workspace-backups/domain-knowledge-20260908T014953Z`。备份位于权限 0700 的目录内。
- Git stash 同时保留全部上述改动，另以 `refs/backups/before-main-cleanup-20260908T014953Z` 固定备份，防止 stash 顺序变化后难以定位。不要直接 apply 到新 main；需在旧基线的独立工作区核对恢复。
- 原未跟踪墓志铭保存在备份的 `untracked.tar.gz` 及上述 Git 引用中，没有改写历史内容。此前最新记录为 `2026-09-07-2247-session-end-dsh-next-task.md`，后续长任务讨论应结合该记录。
- 其他 worktree 保留，尤其 `/tmp/domain-knowledge-codeagent-runtime` 的 4 份 CLI WIP；未删除其他 worktree、分支、运行数据、凭据。主目录 `.workpanel/` 保留并继续用于只读预览。

## 验证与运行

- Node 24.13.0、npm 11.6.2；执行 npm ci，锁文件没有变化。
- `npm run typecheck`、`npm run validate:specs`、`npm test` 全部通过，174 项测试通过、0 失败、0 跳过；测试日志 `/tmp/domain-knowledge-startup-main-tests.log`。
- 文档本地链接与 `git diff --check` 通过。
- 实际运行 `npm run knowledge -- init`、`npm run knowledge -- status` 和 `npm run knowledge:serve`，不需要旧工作区临时使用的 `--experimental-transform-types`。
- 运行服务 PID 445852，工具 session 55860，绑定 127.0.0.1:4174；只读，知识/批次计数为 0。
- 原 Cloudflare 隧道 PID 297455 继续转发；临时地址 https://rapid-rank-chambers-belt.trycloudflare.com 。本地与公网的 `/`、`/health`、`/api/v1/system/status`、`/api/v1/system/capabilities` 均 HTTP 200，writeEnabled=false。
- 查看后停止可执行 `kill -TERM 297455 445852`，先核实 PID 仍为上述进程。进程结束或主机退出后临时预览失效；重建隧道会获得新地址。

## 边界与下次讨论

- 本轮验证是主线启动与自动化回归，没有重新执行真实模型七角色闭环。R3/R4 的验收边界仍以开发状态为准。
- 当前文档分支待后续远程交付；原 CLI 适配工作仍需真实 CLI 协议信息，不将这次清理视为完成 CLI 或 DSH 后续业务任务。
