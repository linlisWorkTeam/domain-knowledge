<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明SearchAgent 文档设计交接。
-->
# SearchAgent 文档设计交接

## 用户目标与本轮结果

- 用户要求新增 SearchAgent，检索飞轮治理后输出的合格知识文档，由用户侧 Application 直接调度，不经过 OrchestratorAgent；本轮先修改文档和 Mermaid 图。
- 已新增 `specs/06-agents/search-agent.md`，同步角色目录、Orchestrator 非职责、架构、系统总览、生命周期、七角色治理与独立检索图、查询时序、权限和 HTTP 查询边界。
- 新增需求 KF-SYS-043、验收 AC-SEARCH-001，追踪矩阵标为 Planned；README、Spec 和文档入口及开发状态已关联新设计。

## 已核实状态与约束

- 工作区开始时干净，当前分支为 `docs/startup-main-access`；本轮仅修改 Markdown，未提交或推送，未修改运行代码、Schema、接口或 Console。
- 当前 `KnowledgeSearchApp` 继承 `KnowledgeQueryService`，提供普通查询，尚未执行 SearchAgent。治理 HTTP 目录允许多状态，详情可读任意登记版本，不能直接视为 SearchAgent 的安全工具。
- 目标链路为用户 → Application / KnowledgeSearchApp → SearchAgent → 受控知识读取 Port。七个飞轮角色仍由 LangGraph 编排；SearchAgent 不创建 FlywheelRun、不进入七角色枚举、Run 配置快照或节点投影。
- 合格范围为当前 VERIFIED、具有成功发布回执且正文 Artifact 完整性有效的文档。候选 Quality ACCEPTED 不等于发布；候选、低置信与已替代版本不能进入 Agent 上下文或结果。空结果不触发治理，反馈走独立应用用例。

## 验证

- `npm run validate:specs` 通过：SPEC_VALIDATION_OK，现有 17 个 Schema、7 个命令 fixture、8 个结果 fixture 保持有效。
- `node --test tests/contract/component-layout.test.ts` 的 5 项文档/布局/本地链接契约通过。首次沙箱运行因测试内部 spawnSync git 被 EPERM 拒绝，经授权在沙箱外重跑通过。
- `git diff --check` 通过。Mermaid 调用边与角色范围已人工核对；未进行浏览器渲染验收。

## 后续实现讨论

- 本轮文档任务已完成；后续代码实现需另起任务，不据此接管 DEV-019 或其他 worktree。
- 从独立检索请求/结果 Schema、Application 接线、受控只读工具和 AC-SEARCH-001 开始；不要为复用飞轮信封伪造 runId。
- 检索运行后端和公开入口接线细节在实施时确定；本轮不新增专属 HTTP 路由，不把现有普通查询能力标为 SearchAgent 已实现。
