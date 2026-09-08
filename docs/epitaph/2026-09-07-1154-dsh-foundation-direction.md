<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明DSH 底座方向与开发指导交接。
-->
# DSH 底座方向与开发指导交接

## 当前用户确认

用户经过 grill-me 讨论确认：LangGraph 编排七角色，DSH 直接承担 Agent 运行，不再自建公共角色运行框架；业务输入输出、校验、工件、评测和确定性发布仍由本项目持有。外部先用 DSH 完成第一版，CodeAgent CLI 保留未来接入位置，不作为当前环境前置条件。Pi 退出目标底座，OhMyWorkPanelWorkflowExecutor 退出公共入口。

先交付底座和普通 CPU 小模块的真实角色范例，再分发七个角色的开发任务。一个真实角色样例不等于七角色完整闭环。具体模块、角色配置、文件拆分和 CLI 参数留到下一阶段讨论。本轮“开始更改”承接的是将这些已确认内容写入文档，未实施代码。

## 已完成与验证

当前目录基线为 `1e826bb`，分支 `docs/contributor-worktree-quickstart`。已更新 docs/ARCHITECTURE.md、docs/DEVELOPMENT-STATUS.md、docs/README.md、docs/guides/agent-customization.md、docs/tutorials/add-agent-capability.md 和 specs/README.md。

新增 `specs/changes/active/DEV-019-dsh-agent-foundation/` 六文件变更包。DEV-014 及草稿中引用的 DEV-015～018 已有占用上下文，因此使用 DEV-019。方向已确认；实施增量为 Draft，Accepted baseline 和追踪矩阵保持现状。DEV-019 是下一任务，DEV-010 后置。

Node 24.13.0 下 Spec 校验通过（17 schemas、7 commands、8 results、51 P0），site 契约测试文件通过，12 份目标文档的 86 个本地链接与锚点检查通过，git diff --check 通过。未运行真实模型、全量测试或新范例。未提交或推送。

## 历史上下文与约束

开始时的三份旧 DFX epitaph 和恢复的 DFX 报告保持原样；其他 worktree 未修改。`/tmp/domain-knowledge-dev014` 中的未提交 DFX 实现只能按当前目标逐项复核，不据旧交接记录自动继续全部旧规划。

用户提供了公司 CLI 的能力反馈，但仅供讨论：现有 Adapter 的启动参数、认证字段和 session 格式与反馈存在差异，自建夹具通过不代表真实兼容。后续需要实际版本的 help 和脱敏输入输出验证；不会在本轮按转述参数直接改适配器。

## 下一步

以 DEV-019 为入口讨论具体 CPU 样例、示范角色和 DSH 接线；确认旧 Pi 设置、旧 Run 与固定场景的处置后，再实施底座和可运行范例。保留 SDK/业务层边界、版本化 Schema、ArtifactRef、角色可见性、运行快照和唯一发布门禁。不需要重新询问已确认的整体架构和外部优先方向。
