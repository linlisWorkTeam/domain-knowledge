# 追踪矩阵

实现状态按当前代码和可执行测试记录。`Implemented` 表示已有对应代码与自动化验证，`Partial` 表示只实现安全子集，`Planned` 表示规范仍保留但不得宣称为当前能力。实现和测试路径均相对 domain-knowledge 根目录；人工审计证据另存于 wpKnowledge。

| 需求 ID | 验收 | 状态 | 实现 | 测试 |
|---|---|---|---|---|
| KF-SYS-001 | AC-FLOW-001 | Partial | `src/application/services/index.ts` | `tests/acceptance/publication-flow.test.ts` |
| KF-SYS-002 | AC-AGENT-001 | Planned | — | — |
| KF-SYS-003 | AC-SEC-001 | Partial | `src/infrastructure/agents/workspace` + `src/infrastructure/agents/deepseek-harness/isolation-launcher.mjs` | `tests/security/agent-workspace.test.ts` + `tests/integration/deepseek-harness-agent.test.ts` |
| KF-SYS-004 | AC-EVAL-001 | Planned | — | — |
| KF-SYS-005 | AC-EVAL-002 | Implemented | `src/infrastructure/evaluation/project` + `src/domain/index.ts` | `tests/acceptance/real-source-flow.test.ts` |
| KF-SYS-006 | AC-OBS-001 | Implemented | `src/infrastructure/persistence/sqlite-cas/index.ts` | `tests/integration/sqlite-cas.test.ts` |
| KF-SYS-007 | AC-FLOW-002 | Implemented | `src/application/services/project-flow.ts` | `tests/acceptance/real-source-flow.test.ts` |
| KF-SYS-008 | AC-FLOW-003 | Partial | `src/domain/index.ts` | `tests/unit/domain.test.ts` |
| KF-SYS-009 | AC-PUB-001 | Implemented | `src/application/services/index.ts` + `src/infrastructure/persistence/sqlite-cas/index.ts` | `tests/acceptance/publication-flow.test.ts` |
| KF-SYS-010 | AC-REC-001 | Partial | `src/application/services/index.ts` + `src/infrastructure/persistence/sqlite-cas/index.ts` | `tests/integration/sqlite-cas.test.ts` |
| KF-SYS-011 | AC-SCHEMA-001 | Implemented | `specs/schemas` + `src/application/ports` + `src/infrastructure/agents/contracts` + `src/application/services/automated-project-workflow.ts` | `specs/13-verification/validate-specs.ts` + `tests/integration/agent-contracts.test.ts` + `tests/acceptance/automated-langgraph-flow.test.ts` |
| KF-SYS-012 | AC-LANG-001 | Implemented | `src/application/ports/index.ts` | `tests/contract/architecture.test.ts` |
| KF-SYS-013 | AC-SEC-002 | Partial | `src/interfaces/runner/server.ts` | `tests/integration/server.test.ts` |
| KF-SYS-014 | AC-LANG-002 | Planned | — | — |
| KF-SYS-015 | AC-AGENT-002 | Partial | `src/domain/index.ts` | `tests/unit/domain.test.ts` |
| KF-SYS-016 | AC-COMPAT-001 | Implemented | `src/interfaces/runner/cli.ts` + `src/infrastructure/migration/legacy-okf` | `tests/integration/legacy-runner-compat.test.ts` |
| KF-SYS-017 | AC-E2E-001 | Implemented | `src/application/services/project-flow.ts` + `src/infrastructure/evaluation/project` | `tests/acceptance/real-source-flow.test.ts` |
| KF-SYS-018 | AC-DOC-001 | Implemented | `src/application/services/knowledge-writing-guide.ts` + `src/application/services/quality-policy.ts` + `src/application/services/project-flow.ts` | `tests/unit/quality-policy.test.ts` + `tests/acceptance/real-source-flow.test.ts` |
| KF-SYS-019 | AC-ARCH-002 | Implemented | `src/infrastructure/workflow/langgraph` + `src/interfaces/runner/composition.ts` | `tests/contract/architecture.test.ts` + `tests/integration/langgraph-infrastructure.test.ts` |
| KF-SYS-020 | AC-OBS-002 | Implemented | `src/application/services/workflow-control.ts` + `src/interfaces/runner/console-read-model.ts` | `tests/integration/langgraph-infrastructure.test.ts` + `tests/acceptance/automated-langgraph-flow.test.ts` |
| KF-SYS-021 | AC-AGENT-003 | Implemented | `src/infrastructure/workflow/langgraph/agent-definitions.ts` + `src/application/services/workflow-control.ts` + `web/app.js` | `tests/integration/server.test.ts` + `tests/contract/site.test.ts` |
| KF-SYS-022 | AC-E2E-002 | Implemented | `src/application/services/automated-project-workflow.ts` + `src/infrastructure/workflow/langgraph/graph.ts` | `tests/acceptance/automated-langgraph-flow.test.ts` |
| KF-SYS-023 | AC-DOC-002 | Implemented | `web` + `site` + `docs` + `specs` | `tests/contract/site.test.ts` + `tests/contract/component-layout.test.ts` |
| KF-SYS-024 | AC-DOC-003 | Implemented | `docs/DOCUMENTATION-I18N.md` + `README.md` + `CONTRIBUTING.md` | `tests/contract/component-layout.test.ts` + `tests/contract/site.test.ts` |
| KF-SYS-025 | AC-E2E-003 | Implemented | `src/infrastructure/agents/deepseek-harness` + `src/application/services/automated-project-workflow.ts` + `deploy/deepseek-harness` | `tests/integration/deepseek-harness-agent.test.ts` |
| KF-SYS-026 | AC-FLOW-005 | Implemented | `src/application/services/automated-project-workflow.ts` + `src/infrastructure/workflow/langgraph/graph.ts` | `tests/integration/langgraph-infrastructure.test.ts` |
| KF-SYS-027 | AC-OBS-003 | Implemented | `src/interfaces/runner/demo-report.ts` + `src/interfaces/runner/cli.ts` | `tests/integration/demo-report.test.ts` |
| KF-SYS-028 | AC-DOC-004 | Implemented | `site/index.html` + `site/app.js` + `web/index.html` + `web/app.js` | `tests/contract/site.test.ts` |
| KF-SYS-029 | AC-SEC-004 | Implemented | `.env.example` + `package.json` + `web/app.js` | `tests/contract/site.test.ts` + `tests/integration/server.test.ts` |
| KF-SYS-030 | AC-ARCH-003 | Implemented | `docs/REPOSITORY-MIGRATION.md` + `specs/adr/ADR-009-repository-split.md` | `tests/contract/component-layout.test.ts` |
| KF-SYS-031 | AC-ARCH-004 | Implemented | `src/domain/services` + `src/application/apps` + `src/interfaces/ui-api` + `src/infrastructure/persistence/redis` | `tests/contract/architecture.test.ts` + `tests/unit/ddd-domain-services.test.ts` + `tests/integration/redis-runtime-state.test.ts` |
| KF-SYS-032 | AC-API-001 | Planned | — | — |
| KF-SYS-033 | AC-API-002 | Planned | — | — |
| KF-SYS-034 | AC-API-003 | Planned | — | — |
| KF-SYS-035 | AC-API-004 | Planned | — | — |
| KF-SYS-036 | AC-API-005 | Planned | — | — |
| KF-SYS-037 | AC-API-006 | Planned | — | — |
| KF-SYS-038 | AC-API-007 | Planned | — | — |
| KF-SYS-039 | AC-API-008 | Partial | `src/application/services/workflow-control.ts` + `src/interfaces/runner/console-read-model.ts` + `web/app.js` | `tests/integration/server.test.ts` + `tests/acceptance/automated-langgraph-flow.test.ts` |
| KF-SYS-040 | AC-API-009 | Planned | — | — |
| KF-UI-001 | AC-UI-001 | Implemented | `web/app.js` + `src/interfaces/runner/server.ts` | `tests/contract/site.test.ts` + `tests/integration/server.test.ts` |
| KF-UI-002 | AC-UI-002 | Implemented | `web/app.js` + `src/interfaces/runner/console-read-model.ts` | `tests/contract/site.test.ts` + `tests/integration/server.test.ts` |
| KF-UI-003 | AC-UI-003 | Implemented | `src/application/services/automated-project-workflow.ts` + `web/app.js` | `tests/acceptance/automated-langgraph-flow.test.ts` + `tests/contract/site.test.ts` |
| KF-UI-004 | AC-UI-004 | Implemented | `web/app.js` | `tests/contract/site.test.ts` |
| KF-UI-005 | AC-UI-005 | Partial | `web/app.js` + `src/interfaces/runner/console-read-model.ts` | `tests/contract/site.test.ts` + `tests/integration/server.test.ts` |
| KF-UI-006 | AC-UI-006 | Partial | `web/app.js` | `tests/contract/site.test.ts` |
| KF-UI-007 | AC-UI-007 | Implemented | `web/app.js` + `src/interfaces/runner/server.ts` | `tests/contract/site.test.ts` + `tests/integration/server.test.ts` |
| KF-UI-008 | AC-UI-008 | Partial | `web/app.js` + `src/interfaces/runner/server.ts` | `tests/contract/site.test.ts` + `tests/integration/server.test.ts` |
| KF-UI-009 | AC-UI-009 | Planned | — | — |
| KF-UI-010 | AC-UI-010 | Partial | `web/app.js` + `src/interfaces/runner/server.ts` | `tests/contract/site.test.ts` + `tests/integration/server.test.ts` |
| KF-UI-011 | AC-UI-011 | Implemented | `web/app.js` + `src/application/apps/knowledge-search-app.ts` | `tests/contract/site.test.ts` + `tests/integration/server.test.ts` |
| KF-UI-012 | AC-UI-012 | Implemented | `web/index.html` + `web/styles.css` + `web/app.js` | `tests/contract/site.test.ts` + `tests/e2e/console.spec.ts` |
| KF-UI-013 | AC-UI-013 | Implemented | `web/app.js` + `web/styles.css` + `site/app.js` | `tests/contract/site.test.ts` |
| KF-UI-014 | AC-UI-014 | Implemented | `web/app.js` + `src/infrastructure/workflow/langgraph/agent-definitions.ts` | `tests/contract/site.test.ts` + `tests/integration/server.test.ts` |
| KF-UI-015 | AC-UI-015 | Implemented | `web/app.js` + `src/interfaces/runner/server.ts` | `tests/contract/site.test.ts` + `tests/integration/server.test.ts` |
| KF-UI-016 | AC-UI-016 | Implemented | `web/app.js` + `src/interfaces/runner/console-read-model.ts` | `tests/contract/site.test.ts` + `tests/acceptance/automated-langgraph-flow.test.ts` |
| KF-UI-017 | AC-UI-017 | Implemented | `web/index.html` + `web/app.js` + `site/index.html` + `site/app.js` | `tests/contract/site.test.ts` |
| KF-UI-018 | AC-UI-018 | Implemented | `.env.example` + `web/app.js` | `tests/contract/site.test.ts` + `tests/integration/server.test.ts` |
| KF-UI-019 | AC-UI-019 | Implemented | `web/index.html` + `web/styles.css` + `web/app.js` | `tests/contract/site.test.ts` + `tests/e2e/console.spec.ts` |
| NFR-001 | AC-SEC-002 | Partial | `src/interfaces/runner/server.ts` | `tests/integration/server.test.ts` |
| NFR-002 | AC-REC-001 | Partial | `src/application/services/index.ts` + `src/infrastructure/persistence/sqlite-cas/index.ts` | `tests/integration/sqlite-cas.test.ts` |
| NFR-003 | AC-REC-002 | Implemented | `src/application/services/index.ts` + `src/infrastructure/persistence/sqlite-cas/index.ts` | `tests/integration/sqlite-cas.test.ts` + `tests/acceptance/publication-flow.test.ts` |
| NFR-004 | AC-OBS-001 | Partial | `src/infrastructure/persistence/sqlite-cas/index.ts` | `tests/acceptance/publication-flow.test.ts` |
| NFR-005 | AC-ARCH-001 | Implemented | `src/domain` + `src/application/ports` | `tests/contract/architecture.test.ts` |
| NFR-006 | AC-SCHEMA-001 | Partial | `specs/schemas` + `src/infrastructure/agents/contracts` + `src/infrastructure/persistence/sqlite-cas/index.ts` | `specs/13-verification/validate-specs.ts` + `tests/contract/spec-validator.test.ts` + `tests/integration/agent-contracts.test.ts` |
| NFR-007 | AC-LANG-002 | Planned | — | — |
| NFR-008 | AC-EVAL-003 | Implemented | `src/domain/index.ts` + `src/infrastructure/evaluation/project/index.ts` | `tests/acceptance/real-source-flow.test.ts` |
| NFR-009 | AC-SEC-003 | Partial | `src/infrastructure/agents/deepseek-harness` + `src/interfaces/runner/demo-report.ts` | `tests/integration/deepseek-harness-agent.test.ts` + `tests/integration/demo-report.test.ts` |
| NFR-010 | AC-FLOW-004 | Planned | — | — |
| NFR-011 | AC-E2E-001 | Implemented | `src/application/services/project-flow.ts` + `src/infrastructure/persistence/sqlite-cas/index.ts` | `tests/acceptance/real-source-flow.test.ts` |
| NFR-012 | AC-UI-012 | Implemented | `web/index.html` + `web/styles.css` + `web/app.js` | `tests/contract/site.test.ts` + `tests/e2e/console.spec.ts` |

`SPK-001` 的官方 SDK 接缝、stdin JSON-RPC、超时关闭和 Bubblewrap 角色工作区已有自动化验证；端到端 SDK Run `5503b6bc-0350-4b53-98cc-6fbf3a13aaa9` 已归档，`KF-SYS-025` 的接线验收完成。`SPK-002` 的 LangGraph 选型结果已由 ADR-006 和自动化测试固化；失败 task checkpoint 恢复已有自动化用例，四个崩溃注入点仍是恢复加固项。单次 live Run 不能替代稳定性试验，Agent 源码隔离也不能证明敌对代码执行安全。
