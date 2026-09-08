<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明七角色 Domain 重构交接。
-->
# 七角色 Domain 重构交接

## 目标与完成状态

按用户提供的计划完成七角色目录迁移；本轮保留现有行为，不增加 SearchAgent、业务修订循环或真实公司 CLI 协议。工作在原工作区完成，未新建 worktree，未提交或推送。

- `src/domain/agents/<role>/` 拥有执行入口、专属输入输出、Schema、Prompt、工具声明、单测与样例。角色 ID、命令/结果类型已移到 Domain，Application 保留兼容导出。
- `ProjectWorkflowStages` 加载可信材料与历史工件；`RoleExecutionService` 共用生产与独立开发的 CAS、结果绑定和事务提交。Fixture 使用模型注入，不再继承覆盖角色执行。
- 模型 Port 经 `model-execution.ts` 映射到现有 Provider/DSH 工作区和授权工具；重试、超时、取消及审计仍归 Adapter。Orchestrator 只返回业务计划，节点名和图连接归 LangGraph 接线。
- `npm run agent:run -- --role <role> --input <sample.json> --output <directory>` 支持七个显式样例。默认样例使用 fixture；`--provider dsh` 使用已配置真实后端。输出保存到独立目录；不运行图、评测或发布。DocGen 原接口共用角色与提交服务，已移除单节点图。
- 配置快照新增 `roleExecutionVersion=domain-agents-v1`，旧执行版本拒绝恢复，历史记录可读，同版本恢复保留。不迁移 checkpoint。

## 已验证证据

- 初始工作区 40 个变更路径见下方清单，项目解耦和 OpenCode Go 修改均保留。
- 初始 Node 22.22.0 基线：类型和规范通过，完整测试 176 项中 167 通过、7 失败、2 取消；包含 Node 版本不满足要求和 SQLite 原生 ABI 不匹配。原始日志 `/tmp/ddd-baseline-tests.log`。
- 后续统一使用 `/root/.nvm/versions/node/v24.13.0/bin` 优先的 PATH。
- 类型检查、规范校验、导入关系架构检查通过；完整测试 **218/218**，日志 `/tmp/ddd-refactor/final-tests.log`。涵盖七角色 32 项单测、七个独立样例、两轮源码与双场景图、质量拒绝、评测/幂等发布、取消、同版本恢复、旧版本拒绝与历史读取、受控原生 DSH 和公司 CLI 契约。
- 最后的独立开发 Prompt 冻结调整另跑相关集成、架构和文档契约 **20/20**，日志 `/tmp/ddd-refactor/final-focused.log`；类型和规范再次通过。
- Console **14/14**，日志 `/tmp/ddd-refactor/console-tests.log`；框架评估 `frameworkMechanics=VERIFIED`，日志 `/tmp/ddd-refactor/framework.log`。`git diff --check` 通过。
- 实际 CLI Code 样例 Run：`5cdde6c2-a882-4a52-9efa-ca415657d5eb`，输出 `/tmp/ddd-refactor/final-cli/code-xe8WlU`，`NOT_EVALUATED`。

## 保留边界与后续讨论

当前没有 `DEEPSEEK_API_KEY`，也没有 `.env.local`；没有执行真实模型冒烟。受控原生 SDK 链路通过不代表七角色真实业务效果通过。Orchestrator 固定计划、TestGen 候选命令未进入门禁、Check 字符串 findings、Review 单条 correction 且未单独绑定 Check 明细均按原行为保留。

后续开发先阅读 `docs/guides/agent-customization.md`。只改角色内部步骤时修改该角色目录；新增公共能力、对外契约或跨角色流程才修改共享注册、输入加载及图连接。若继续真实模型验收，应另行记录模型、输入、工件与业务核验结果。

## 初始工作区变更清单

以下是修改前 `git status --short` 的 40 个路径，不能作为本次重构的提交范围：

```text
 M .env.example
 M CONTRIBUTING.md
 M README.md
D  acceptance/ohmyworkpanel/correction.json
D  acceptance/ohmyworkpanel/knowledge-v1.md
D  acceptance/ohmyworkpanel/knowledge-v2.md
D  acceptance/ohmyworkpanel/mentions-v1.ts
D  acceptance/ohmyworkpanel/mentions-v2.ts
D  acceptance/ohmyworkpanel/scenario.json
D  deploy/deepseek-harness/opencode-go.cordis.yml
D  deploy/deepseek-harness/provider.cordis.yml
D  deploy/deepseek-harness/web-public.cordis.yml
 M docs/ARCHITECTURE.md
 M docs/DEVELOPMENT-STATUS.md
 M docs/GETTING_STARTED.md
 M docs/OPERATIONS.md
 M docs/README.md
RM deploy/deepseek-harness/README.md -> docs/guides/dsh-runtime.md
 M docs/guides/testing.md
 M docs/reference/repository-layout.md
 M docs/tutorials/add-agent-capability.md
 M package.json
 M specs/04-product/frontend-product-design.md
 M specs/05-workflows/real-source-acceptance.md
 M specs/05-workflows/user-use-cases.md
 M specs/13-verification/acceptance-plan.md
 M specs/13-verification/traceability-matrix.md
 M specs/adr/ADR-006-embedded-domain-knowledge-infrastructure.md
 M specs/changes/active/DEV-019-dsh-agent-foundation/acceptance.md
 M specs/changes/active/DEV-019-dsh-agent-foundation/plan.md
 M src/application/services/automated-project-workflow.ts
 M src/application/services/project-flow.ts
 M src/interfaces/runner/composition.ts
D  src/interfaces/runner/project-acceptance.ts
 M tests/acceptance/automated-langgraph-flow.test.ts
 M tests/acceptance/real-source-flow.test.ts
 M tests/contract/architecture.test.ts
 M tests/contract/component-layout.test.ts
?? src/infrastructure/agents/deepseek-harness/opencode-go.ts
?? tests/integration/opencode-go-config.test.ts
```
