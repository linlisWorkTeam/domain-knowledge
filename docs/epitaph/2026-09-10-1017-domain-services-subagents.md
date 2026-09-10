<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接开发 subagent 规范与 Domain 服务目录重构的实现和验证。
-->
# 开发并行规范与领域服务重构

用户要求在新 worktree 解决两项：Spec 明确支持开发过程中调度 subagent 并行工作；厘清 agents 与 association/evaluation 等服务的职责。新树 `/root/projects/domain-knowledge-services-subagents`，分支 `refactor/domain-services-subagents`，基于干净的 `feat/seven-role-mvp` 提交 `51c2972e914c81bbeaf3577aa79b27e563f18ca0`。原 `/root/projects/domain-knowledge-wxc` 在途修改和已有 MVP 工作树未动。Node 24.13.0 独立安装依赖，bootstrap 与 check 均 READY。

已实现：Domain 的 agents/services 平级，association、evaluation、knowledge、workflow、sourceScan、workspace、migration 移至 services；对应 Spec 同步归入 domainFunction/services。新增 AgentExecutionService 封装内部角色选择，Application RoleExecutionService 继续持有材料加载、阶段日志和 CAS 提交。DSH 通过领域服务目录读取公开角色定义，不直接读取内部注册表。EvaluationAgent 接口改名 EvaluationService，既有 evaluation-agent 能力标识保留。源码资源访问例外保持原范围；模型契约、门禁、执行版本和 Schema 不变。

职责结论：Association 服务校验外部事实与目标关联，DocWorker 从固定源码提取有来源的事实，两者目前没有调用关系；确定性 Evaluation 服务计算 Gate，TestGen/Check/Review 提供候选与意见。没有复制生成步骤或增加第八个生成角色。架构测试约束外层不得直接导入注册表或角色执行入口。

CodeTaste、Requirements、Verification、Development 和 AGENTS 明确开发 subagent 分工、独立 worktree、READY、依赖、资源上限、失败/取消、交付和集成验证。NFR-013 / AC-DEV-001 标记 Partial：本轮交付协作规范，没有调度双 subagent 验收，也不声称产品 DSH 已能动态派生 subagent。

验证：typecheck、validate:specs、架构与目录契约 13/13、bootstrap check 和 diff check 通过。完整 npm test 共 325 项：324 通过，唯一失败是官网迁移 Spec 链接后 Release.json 的资产摘要未同步；重新计算 contentDigest 后 Site.test.ts 12/12 复测通过。全量其余测试覆盖七角色独立运行、原生 DSH 受控协议、闭环发布、取消恢复、阶段日志、扫描、工作区和迁移；修复摘要后未重复跑全量。日志 `/tmp/domain-services-tests.log`、`/tmp/domain-services-site.log`、`/tmp/domain-services-contract.log`、`/tmp/domain-services-typecheck.log`、`/tmp/domain-services-spec.log`。没有运行浏览器验收或外网模型；历史模型预算、演示证据、安装产物和 Release 状态不由本次回归更新。

交付本地分支供审查，未推送或合并。后续如验收宿主 subagent 协作，按 AC-DEV-001 实际执行独立双任务并留下集成证据；真实 MVP 验收继续遵循前次墓志铭的预算要求。旧 1640 探针交接已先汇总到 HistoryEpitaph 并链接固定提交，再按仓库规则归档，目录保留最近三份。
