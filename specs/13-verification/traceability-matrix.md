<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明追踪矩阵。
-->
# 追踪矩阵

> [DEV-019](../changes/active/DEV-019-dsh-agent-foundation/spec-delta.md) 的 R1 已实现 DSH 配置、依赖迁出和通用启动；本表同步当前实现路径。受控模型测试证明执行机制；R2 live CPU 范例已通过本地验收，R3/R4 完整闭环尚未验收。

实现状态按当前代码和可执行测试记录。`Implemented` 表示已有对应代码与自动化验证，`Partial` 表示只实现安全子集，`Planned` 表示规范仍保留但不得宣称为当前能力。实现和测试路径均相对 domain-knowledge 根目录；人工审计证据另存于 wpKnowledge。

| 需求 ID | 验收 | 状态 | 实现 | 测试 |
|---|---|---|---|---|
| KF-SYS-001 | AC-FLOW-001 | Partial | `src/application/services/ApplicationServices.ts` | `tests/acceptance/PublicationFlow.test.ts` |
| KF-SYS-002 | AC-AGENT-001 | Planned | — | — |
| KF-SYS-003 | AC-SEC-001 | Partial | `src/infrastructure/agentAdapters/workspace` + `src/infrastructure/agentAdapters/deepseek-harness/isolation-launcher.mjs` | `tests/security/AgentWorkspace.test.ts` + `tests/integration/DeepseekHarnessAgent.test.ts` |
| KF-SYS-004 | AC-EVAL-001 | Planned | — | — |
| KF-SYS-005 | AC-EVAL-002 | Implemented | `src/infrastructure/evaluation/project` + `src/domain/Domain.ts` | `tests/acceptance/RealSourceFlow.test.ts` |
| KF-SYS-006 | AC-OBS-001 | Implemented | `src/infrastructure/sqlite/SqliteCas.ts` | `tests/integration/SqliteCas.test.ts` |
| KF-SYS-007 | AC-FLOW-002 | Implemented | `src/application/services/ProjectFlow.ts` | `tests/acceptance/RealSourceFlow.test.ts` |
| KF-SYS-008 | AC-FLOW-003 | Partial | `src/domain/Domain.ts` | `tests/unit/Domain.test.ts` |
| KF-SYS-009 | AC-PUB-001 | Implemented | `src/application/services/ApplicationServices.ts` + `src/infrastructure/sqlite/SqliteCas.ts` | `tests/acceptance/PublicationFlow.test.ts` |
| KF-SYS-010 | AC-REC-001 | Partial | `src/application/services/ApplicationServices.ts` + `src/infrastructure/sqlite/SqliteCas.ts` | `tests/integration/SqliteCas.test.ts` |
| KF-SYS-011 | AC-SCHEMA-001 | Implemented | `specs/schemas` + `src/application/ports` + `src/infrastructure/agentAdapters/contracts` + `src/application/services/AutomatedProjectWorkflow.ts` | `specs/13-verification/ValidateSpecs.ts` + `tests/integration/AgentContracts.test.ts` + `tests/acceptance/AutomatedLanggraphFlow.test.ts` |
| KF-SYS-012 | AC-LANG-001 | Implemented | `src/application/ports/ApplicationPorts.ts` | `tests/contract/Architecture.test.ts` |
| KF-SYS-013 | AC-SEC-002 | Partial | `src/interfaces/runner/Server.ts` | `tests/integration/Server.test.ts` |
| KF-SYS-014 | AC-LANG-002 | Planned | — | — |
| KF-SYS-015 | AC-AGENT-002 | Partial | `src/domain/Domain.ts` | `tests/unit/Domain.test.ts` |
| KF-SYS-016 | AC-COMPAT-001 | Implemented | `src/interfaces/runner/Cli.ts` + `src/domain/migration` | `tests/integration/LegacyRunnerCompat.test.ts` |
| KF-SYS-017 | AC-E2E-001 | Implemented | `src/application/services/ProjectFlow.ts` + `src/infrastructure/evaluation/project` | `tests/acceptance/RealSourceFlow.test.ts` |
| KF-SYS-018 | AC-DOC-001 | Implemented | `src/application/services/KnowledgeWritingGuide.ts` + `src/application/services/QualityPolicy.ts` + `src/application/services/ProjectFlow.ts` | `tests/unit/QualityPolicy.test.ts` + `tests/acceptance/RealSourceFlow.test.ts` |
| KF-SYS-019 | AC-ARCH-002 | Implemented | `src/infrastructure/langgraph` + `src/interfaces/runner/Composition.ts` | `tests/contract/Architecture.test.ts` + `tests/integration/LanggraphInfrastructure.test.ts` |
| KF-SYS-020 | AC-OBS-002 | Implemented | `src/application/services/WorkflowControl.ts` + `src/interfaces/runner/ConsoleReadModel.ts` | `tests/integration/LanggraphInfrastructure.test.ts` + `tests/acceptance/AutomatedLanggraphFlow.test.ts` |
| KF-SYS-021 | AC-AGENT-003 | Implemented | `src/domain/services/workflow/AgentDefinitions.ts` + `src/application/services/WorkflowControl.ts` + `web/app.js` | `tests/integration/Server.test.ts` + `tests/contract/Site.test.ts` |
| KF-SYS-022 | AC-E2E-002 | Implemented | `src/application/services/AutomatedProjectWorkflow.ts` + `src/infrastructure/langgraph/Graph.ts` | `tests/acceptance/AutomatedLanggraphFlow.test.ts` |
| KF-SYS-023 | AC-DOC-002 | Implemented | `web` + `site` + `docs` + `specs` | `tests/contract/Site.test.ts` + `tests/contract/ComponentLayout.test.ts` |
| KF-SYS-024 | AC-DOC-003 | Implemented | `docs/guides/documentation-i18n.md` + `README.md` + `CONTRIBUTING.md` | `tests/contract/ComponentLayout.test.ts` + `tests/contract/Site.test.ts` |
| KF-SYS-025 | AC-E2E-003 | Implemented | `src/infrastructure/agentAdapters/deepseek-harness` + `src/application/services/AutomatedProjectWorkflow.ts` | `tests/integration/DeepseekHarnessAgent.test.ts` + `tests/integration/OpencodeGoConfig.test.ts` |
| KF-SYS-026 | AC-FLOW-005 | Implemented | `src/application/services/AutomatedProjectWorkflow.ts` + `src/infrastructure/langgraph/Graph.ts` | `tests/integration/LanggraphInfrastructure.test.ts` |
| KF-SYS-027 | AC-OBS-003 | Implemented | `src/interfaces/runner/DemoReport.ts` + `src/interfaces/runner/Cli.ts` | `tests/integration/DemoReport.test.ts` |
| KF-SYS-028 | AC-DOC-004 | Implemented | `site/index.html` + `site/app.js` + `web/index.html` + `web/app.js` | `tests/contract/Site.test.ts` |
| KF-SYS-029 | AC-SEC-004 | Implemented | `.env.example` + `package.json` + `web/app.js` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-SYS-030 | AC-ARCH-003 | Implemented | `docs/migration/repository-split.md` + `specs/adr/ADR-009-repository-split.md` | `tests/contract/ComponentLayout.test.ts` |
| KF-SYS-031 | AC-ARCH-004 | Implemented | `src/domain/services` + `src/application/apps` + `src/interfaces/ui-api` + `src/infrastructure/redis` | `tests/contract/Architecture.test.ts` + `tests/unit/DddDomainServices.test.ts` + `tests/integration/RedisRuntimeState.test.ts` |
| KF-SYS-032 | AC-API-001 | Implemented | `src/interfaces/runner/Server.ts` + `src/interfaces/dsh/Dsh.ts` + `web/app.js` | `tests/integration/Server.test.ts` + `tests/integration/DshAdapter.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-033 | AC-API-002 | Partial | `src/application/services/ApplicationServices.ts` + `src/infrastructure/sqlite/SqliteActionItems.ts` + `src/infrastructure/sqlite/SqliteCas.ts` + `src/infrastructure/sqlite/SqliteContentGovernance.ts` + `src/interfaces/runner/Server.ts` + `web/app.js` | `tests/integration/Server.test.ts` + `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-034 | AC-API-003 | Implemented | `src/interfaces/runner/ConsoleReadModel.ts` + `src/interfaces/runner/Server.ts` + `web/app.js` | `tests/integration/Server.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-035 | AC-API-004 | Implemented | `src/interfaces/runner/ConsoleReadModel.ts` + `src/infrastructure/sqlite/SqliteContentGovernance.ts` + `src/interfaces/runner/Server.ts` + `web/app.js` | `tests/integration/Server.test.ts` + `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-036 | AC-API-005 | Implemented | `src/domain/services/MarkdownDiff.ts` + `src/infrastructure/sqlite/SqliteContentGovernance.ts` + `src/interfaces/runner/Server.ts` + `web/app.js` | `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-037 | AC-API-006 | Implemented | `src/application/apps/ContentGovernanceApp.ts` + `src/infrastructure/sqlite/SqliteContentGovernance.ts` + `src/interfaces/runner/Server.ts` + `web/app.js` | `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-038 | AC-API-007 | Implemented | `src/infrastructure/sqlite/SqliteContentGovernance.ts` + `src/interfaces/runner/Server.ts` + `web/app.js` | `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-039 | AC-API-008 | Implemented | `src/application/services/WorkflowControl.ts` + `src/interfaces/runner/ConsoleReadModel.ts` + `web/app.js` | `tests/integration/Server.test.ts` + `tests/acceptance/AutomatedLanggraphFlow.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-040 | AC-API-009 | Implemented | `src/application/apps/ProviderOperationsApp.ts` + `src/interfaces/runner/Server.ts` + `web/app.js` | `tests/integration/ProviderObservability.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-041 | AC-API-010 | Implemented | `src/application/apps/ProviderOperationsApp.ts` + `src/infrastructure/agentAdapters/deepseek-harness` + `src/interfaces/runner/Composition.ts` + `web/app.js` | `tests/security/ProviderSettings.test.ts` + `tests/integration/DshConfiguredProvider.test.ts` + `tests/acceptance/DshConfiguredFlow.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-042 | AC-OBS-004 | Implemented | `src/application/apps/OperationalMetricsApp.ts` + `src/infrastructure/observability/SqliteOperationalMetrics.ts` + `web/app.js` | `tests/integration/OperationalMetrics.test.ts` + `tests/integration/ProviderObservability.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-SYS-043 | AC-SEARCH-001 | Planned | — | — |
| KF-UI-001 | AC-UI-001 | Implemented | `web/app.js` + `src/interfaces/runner/Server.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-002 | AC-UI-002 | Implemented | `web/app.js` + `src/interfaces/runner/ConsoleReadModel.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-003 | AC-UI-003 | Implemented | `src/application/services/AutomatedProjectWorkflow.ts` + `web/app.js` | `tests/acceptance/AutomatedLanggraphFlow.test.ts` + `tests/contract/Site.test.ts` |
| KF-UI-004 | AC-UI-004 | Implemented | `web/app.js` | `tests/contract/Site.test.ts` |
| KF-UI-005 | AC-UI-005 | Implemented | `web/app.js` + `src/infrastructure/sqlite/SqliteContentGovernance.ts` | `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-UI-006 | AC-UI-006 | Implemented | `web/app.js` + `src/infrastructure/sqlite/SqliteCas.ts` | `tests/integration/Server.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-UI-007 | AC-UI-007 | Implemented | `web/app.js` + `src/interfaces/runner/Server.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-008 | AC-UI-008 | Partial | `web/app.js` + `src/interfaces/runner/Server.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-009 | AC-UI-009 | Implemented | `src/domain/services/MarkdownDiff.ts` + `web/app.js` | `tests/integration/ContentGovernance.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-UI-010 | AC-UI-010 | Implemented | `web/app.js` + `src/interfaces/runner/Server.ts` | `tests/integration/Server.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-UI-011 | AC-UI-011 | Implemented | `web/app.js` + `src/application/apps/KnowledgeSearchApp.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-012 | AC-UI-012 | Implemented | `web/index.html` + `web/styles.css` + `web/app.js` | `tests/contract/Site.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-UI-013 | AC-UI-013 | Implemented | `web/app.js` + `web/styles.css` + `site/app.js` | `tests/contract/Site.test.ts` |
| KF-UI-014 | AC-UI-014 | Implemented | `web/app.js` + `src/domain/services/workflow/AgentDefinitions.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-015 | AC-UI-015 | Implemented | `web/app.js` + `src/interfaces/runner/Server.ts` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-016 | AC-UI-016 | Implemented | `web/app.js` + `src/interfaces/runner/ConsoleReadModel.ts` | `tests/contract/Site.test.ts` + `tests/acceptance/AutomatedLanggraphFlow.test.ts` |
| KF-UI-017 | AC-UI-017 | Implemented | `web/index.html` + `web/app.js` + `site/index.html` + `site/app.js` | `tests/contract/Site.test.ts` |
| KF-UI-018 | AC-UI-018 | Implemented | `.env.example` + `web/app.js` | `tests/contract/Site.test.ts` + `tests/integration/Server.test.ts` |
| KF-UI-019 | AC-UI-019 | Implemented | `web/index.html` + `web/styles.css` + `web/app.js` | `tests/contract/Site.test.ts` + `tests/e2e/Console.spec.ts` |
| KF-UI-021 | AC-UI-024 | Implemented | `src/application/apps/ProviderOperationsApp.ts` + `src/infrastructure/agentAdapters/deepseek-harness` + `web/app.js` | `tests/security/ProviderSettings.test.ts` + `tests/integration/ProviderObservability.test.ts` + `tests/acceptance/DshConfiguredFlow.test.ts` + `tests/e2e/Console.spec.ts` |
| NFR-001 | AC-SEC-002 | Partial | `src/interfaces/runner/Server.ts` | `tests/integration/Server.test.ts` |
| NFR-002 | AC-REC-001 | Partial | `src/application/services/ApplicationServices.ts` + `src/infrastructure/sqlite/SqliteCas.ts` | `tests/integration/SqliteCas.test.ts` |
| NFR-003 | AC-REC-002 | Implemented | `src/application/services/ApplicationServices.ts` + `src/infrastructure/sqlite/SqliteCas.ts` | `tests/integration/SqliteCas.test.ts` + `tests/acceptance/PublicationFlow.test.ts` |
| NFR-004 | AC-OBS-001 | Partial | `src/infrastructure/sqlite/SqliteCas.ts` | `tests/acceptance/PublicationFlow.test.ts` |
| NFR-005 | AC-ARCH-001 | Implemented | `src/domain` + `src/application/ports` | `tests/contract/Architecture.test.ts` |
| NFR-006 | AC-SCHEMA-001 | Partial | `specs/schemas` + `src/infrastructure/agentAdapters/contracts` + `src/infrastructure/sqlite/SqliteCas.ts` | `specs/13-verification/ValidateSpecs.ts` + `tests/contract/SpecValidator.test.ts` + `tests/integration/AgentContracts.test.ts` |
| NFR-007 | AC-LANG-002 | Planned | — | — |
| NFR-008 | AC-EVAL-003 | Implemented | `src/domain/Domain.ts` + `src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts` | `tests/acceptance/RealSourceFlow.test.ts` |
| NFR-009 | AC-SEC-003 | Partial | `src/infrastructure/agentAdapters/deepseek-harness` + `src/infrastructure/agentAdapters/company-codeagent` + `src/interfaces/runner/DemoReport.ts` | `tests/integration/DeepseekHarnessAgent.test.ts` + `tests/integration/CompanyCodeagentCli.test.ts` + `tests/integration/DemoReport.test.ts` |
| NFR-010 | AC-FLOW-004 | Planned | — | — |
| NFR-011 | AC-E2E-001 | Implemented | `src/application/services/ProjectFlow.ts` + `src/infrastructure/sqlite/SqliteCas.ts` | `tests/acceptance/RealSourceFlow.test.ts` |
| NFR-012 | AC-UI-012 | Implemented | `web/index.html` + `web/styles.css` + `web/app.js` | `tests/contract/Site.test.ts` + `tests/e2e/Console.spec.ts` |

`SPK-001` 的官方 SDK 接缝、stdin JSON-RPC、超时关闭和 Bubblewrap 角色工作区已有自动化验证；端到端 SDK Run `5503b6bc-0350-4b53-98cc-6fbf3a13aaa9` 已归档，`KF-SYS-025` 的接线验收完成。公司 CodeAgent CLI Adapter 的认证预检、stdin、JSON/JSONL、角色工具、可恢复 session、进程组终止、错误分类和脱敏审计已由协议夹具验证；公司环境 live Run 留在 DEV-010，不以夹具冒充。`SPK-002` 的 LangGraph 选型结果已由 ADR-006 和自动化测试固化；失败 task checkpoint 恢复已有自动化用例，四个崩溃注入点仍是恢复加固项。单次 live Run 不能替代稳定性试验，Agent 源码隔离也不能证明敌对代码执行安全。

## DEV-019 R1 验收增量

| 验收项 | 本地状态 | 实现与行为证据 |
| --- | --- | --- |
| AC-DSHF-006 | PASS | 直接 Pi coding-agent 依赖与固定项目公共执行器已移除；`tests/acceptance/AutomatedLanggraphFlow.test.ts` 验证不同模块、目录和命令经同一接线执行；原生 DSH 路径由 `tests/acceptance/DshConfiguredFlow.test.ts` 验证 |
| AC-DSHF-007 | PASS | `tests/integration/DshConfigurationMigration.test.ts` 验证默认 DSH、运行冻结、新 Run 配置、旧 Pi 读取/拒绝恢复及秘密不迁移；`provider-observability.test.ts`、`tests/e2e/Console.spec.ts` 验证 HTTP/Console |

AC-DSHF-002/003 的 R1 自动化部分见 T102 证据；001/004 的后续 live 结果见下节。005 完整闭环及 008 逐角色交付未计为通过。完整命令和结果在 DEV-019 `evidence.md` 追加。

## DEV-019 R2 范例进度

`src/interfaces/runner/DocgenExample.ts` 提供 prepare/run/check；`tests/integration/DocgenExample.test.ts` 覆盖固定参考、受控 DSH 接线、独立例子检查、快照与取消。原七角色图继续使用相同业务阶段。AC-DSHF-001/004 已通过真实 DeepSeek 模型与独立 worktree 修改复现验收；002/003 沿用 R1 的权限和失败矩阵，并补充本轮非法输出、独立检查拒绝与取消回归。T103/T104 本地验收 PASS，PR #26 待审查；005/008 仍为 NOT_RUN，未提高七角色或完整业务闭环状态。执行方法见 [角色教程](../../docs/tutorials/add-agent-capability.md)，结果见 DEV-019 evidence.md。
