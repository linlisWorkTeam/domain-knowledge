<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明七角色代码开发指南待审查。
-->
# 七角色代码开发指南待审查

- 用户要求面向不同开发者的具体指南：目录树、类职责、每个 Agent 的文件/功能位置、开发步骤；写入 docs，单独提 PR，用户审查后合入。当前只授权本轮指南，未实施七角色业务开发。
- #26 已于 2026-09-07 合入，主线基线 `aff42aa`。本轮独立工作区 `/tmp/domain-knowledge-agent-guide`，分支 `codex/agent-code-development-guide`；bootstrap 已 READY，独立 node_modules。
- 扩充既有 `docs/guides/agent-customization.md`，不新增七份任务书。说明角色尚无独立七类文件，定位 agent-definitions.ts 与 ProjectWorkflowStages 中各分支；列出类、调用链、两层输出 Schema、逐角色开发点、测试、共享文件协作与排障。文档首页、教程和开发状态补导航及 #26 已合入状态。
- 明确当前能力缺口：Orchestrator plan 由固定代码生成；TestGen 候选命令未作为受信门禁消费；Check findings 转换仍简化；Review 未单独绑定 Check 明细，原始 Correction 仍为单项。这些是后续业务开发点，本轮不修改运行代码或放宽契约。
- 验证：对照实际源码核对目录与分支；16 个反引号内具体路径、24 个符号自动检查通过；Spec 通过；Markdown 链接和 git diff 检查通过。纯文档任务未重复调用模型，未将历史 174 项测试当作本轮重跑结果。
- R0/R1/R2 底座已验收合入；T200 的完整规范交付与 T210/T211/R4 验收不因指南落稿而自动勾选。下一步用户 review 本指南，再按指南分工和现有 Roadmap 开发。
- 原 `/root/projects/domain-knowledge` 的旧 WIP 和无关 DFX 草稿未动；密钥、原始模型材料和运行数据未纳入本次文档。
