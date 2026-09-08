<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明DEV-019 R1 配置迁移待审查。
-->
# DEV-019 R1 配置迁移待审查

- 目标与授权：用户要求在已合入 PR 后继续下一功能；按既定 SOP 每个功能 commit/push、向 main 提 PR，用户 review/合并后再推进。
- 已验证：T105 剩余 Pi 迁出与 T106 默认 DSH 配置已完成；168/168 测试、UI 14/14、框架 7/7、站点 12/12、typecheck/Spec 通过。详细范围和本地日志见 DEV-019 evidence.md；受控上游不算 live 模型。
- 分支：`codex/dev019-dsh-configuration`，独立工作区 `/tmp/domain-knowledge-pr23-ci`。之前 #22/#23 合入了功能分支，已创建 #24 汇总到 main，CI 通过；当前功能也以 main 为目标。交接时先检查这两个 PR 的实际合并与 CI 状态，不自动合并。
- 原工作区 `/root/projects/domain-knowledge` 仍有早前未提交的配置迁移 WIP 和无关 DFX 草稿；不要再次应用、提交或删除。当前独立分支包含经验证的最终实现，依赖已独立 bootstrap 至 READY。
- 架构边界：LangGraph 编排 → 原生 DSH；业务信封/CAS/独立评测/Gate 保留。直接 Pi Agent SDK 和固定项目公共执行器退出；旧 Pi Run 只读、拒绝恢复，秘密不自动迁移。DSH 上游间接 pi-ai 模型适配包不是项目 Pi Agent 执行依赖。
- 下一步：本功能合并后执行 R2 T103/T104，固定 structuredMarkdownDiff CPU 样例、真实 DocGen 调用、独立检查和工作区复现，更新既有教程/证据。无凭据时不能标 live PASS；公司 CLI 后置，R2～R4 尚未执行。
