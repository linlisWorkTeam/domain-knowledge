<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：知识组角色实施与集成约束交接。
-->
# MVP 知识角色交接

目标：实现 Orchestrator 模型计划、DocWorker 可定位证据、DocGen 两阶段生成及 H2 定点修订。代码位于各自角色目录；Domain 不读文件、不调用持久化。主 Agent 负责 Application 材料加载、Fixture 接线、完整验收与发布。

已实现：Orchestrator 的六项 tasks 校验角色完整性、固定依赖、轮次和源码权限；DocWorker 的 facts 逐行匹配 sourceRefs 加载的 `{path,content,commit?,sha256?}` 或 files 数组，并把缺证据风险保留在 JSON chunk；DocGen 使用 outline/body 或 revision 阶段，概要和正文分别作为待保存工件，Correction 只允许指定精确 H2，其他区域逐字不变。

已验证：Node 24.13.0、独立 node_modules、bootstrap:check READY。知识角色 27 项定向测试全部通过（2.47 秒）；新增缩进 H2 防越界用例后修订模块 4 项测试通过（0.16 秒）。`npm run typecheck` 通过，使用 512 MB Node heap 和 GOMAXPROCS=1；未运行完整回归、DSH、浏览器或真实模型，以避免 ECS 资源争用。后续完整回归需覆盖已适配的 DocGenExample 两阶段受控 SSE 用例。

集成约束：共享阶段、执行版本与预算变更由主 Agent 的 e1c4c79 提供，本工作树已 cherry-pick。主 Agent 接线 sourceRefs 的真实源码原文；摘要 manifest 单独无法证明引用。首次 DocGen Fixture 要提供 modelStages.outline；初始输出 H2 须与概要一致。已有正文必须同时提供包含 evidenceRefs 的 corrections，knowledgePath 为 `knowledge/<moduleId>.md#<精确 H2>`；quality-only 重生成不传 baseKnowledgeRef。旧输出契约不跨执行版本恢复。

剩余限制：当前明确支持 H2 粒度，显式 range 字段拒绝，细粒度行范围仍待实现；引用原文匹配只证明来源，语义正确性由独立测试和门禁判定。尚不能宣称整个 MVP 验收通过。下一步主 Agent 合并代码、更新其他 Fixture、执行集成和反作弊验证，再评估真实模型与发行门槛。
