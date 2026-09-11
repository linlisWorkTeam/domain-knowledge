<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：开发与交付指南。
-->
# 开发与交付指南

## 从代码定位设计

先读 [开发任务与进度](Status.md) 确认阶段、任务和依赖，再读 [规范目录](specs/README.md)，选择与改动代码相同的模块。Status 统一记录任务步骤、状态和证据索引；模块设计写输入输出、业务步骤、不变量、失败与验证；本文件写实际开发操作。不要为每个任务创建六份 proposal/plan/tasks/evidence 模板文档，普通任务在所属设计和 PR 中完成说明。

| 改动 | 设计 | 实现 |
| --- | --- | --- |
| 角色内部步骤 | domainFunction/agents/xxxAgent/XxxAgent.md（[索引](specs/domainFunction/agents/Agents.md)） | src/domain/agents/xxxAgent |
| 跨角色流程 | domainFunction/workflow | src/domain/workflow |
| 生命周期与业务流转 | domainFunction/workflow | src/domain/workflow、Domain.ts |
| 评测判定 | domainFunction/evaluation | src/domain/evaluation |
| 事实关联与正文差异 | domainFunction/association、knowledge | src/domain/association、knowledge |
| 用例、材料加载和事务协调 | application | src/application/apps、services、ports |
| SDK、图、存储、评测接入 | infrastructure 的同名模块 | src/infrastructure 的同名目录 |
| HTTP / Console | interfaces、totalRules/UiuxDesign | src/interfaces、web |

## 本地准备

使用 package.json 指定的 Node 24 或更新版本，在独立工作树运行 `npm run bootstrap:worktree`，必须得到 READY；可用 `npm run bootstrap:worktree:check` 核对。node_modules 不跨工作树共享或软链接，依赖通过锁文件安装。

开始任务前按 AGENTS.md 阅读最新交接、核对 Git 状态并保留已有工作。角色修改示例和独立命令见 [AgentDevelopment](AgentDevelopment.md)，模型配置见 [Runtime](Runtime.md)。

## 实施步骤

1. 明确触发场景、期望结果和失败行为，在现有模块设计中更新对应段落。
2. 修改所属代码；增加共享能力才修改 Port、显式注册和 Composition。
3. 行为或协议变化同步 Schema、消费者和验收追踪；纯目录调整只改变路径，不改变 Schema 字节或测试判定。
4. 更新相应操作指南和有变化的 4+1 视图，避免复制设计全文。
5. 完成适当检查，在 Status 更新对应任务/子步骤、代码版本、实际执行结果、证据位置和未验证项，再提交 PR 供审查；必需检查通过前不标记已验收。

新增 HTTP 能力先在 Application App 确认用例和端口，随后接 Server 路由和 Console；不要让接口绕过 App 调用数据库。新增角色必须显式更新 AgentContracts、AgentRegistry、Domain Workflow、可信输入加载和版本化契约。

## 修改代码后同步现有文档

以本次 PR 的实际 base 到 HEAD 差异定位受影响模块；未提交修改也纳入核对。先对照模块 Spec 更新行为、输入输出、不变量、失败与恢复，再同步跨模块 Workflow、4+1 视图、使用指南及 Status/验收追踪。删除的是已经失效的当前状态描述；尚未实现的目标、用户延期事项和历史证据保留并明确标记，不能按代码现状缩减目标。

在 PR 里写明更新了哪些对应文档；无需更新的部分说明理由。`validate:specs` 校验 Schema、链接和追踪关系，不能证明描述与实现语义一致，需按实际代码和验收证据 review。当前没有保存代码后自动回写 Spec 的命令，也没有按代码差异强制匹配文档的 CI 门禁；PR 模板的同步项仍依赖开发者落实。

本仓库工程 Spec 的同步与 DocGen 生成业务知识是两项工作。业务源码更新后，先提交需要分析的源码，更新场景 expectedCommit（如已固定）、路径和构建配置，再用 `workflow-run` 发起新 Run；新源码身份产生新测试集合，未变的选定模块仍复用原集合。新知识必须重新评测并经 Gate PASS 后发布。`workflow-resume` 恢复旧快照，不会切换源码或覆盖本仓库的设计文档；入口与配置见 [Runtime](Runtime.md)。

## 验证清单

GitHub CI 自动检查代码、配置、Schema 及混合改动的 PR。仅修改仓库根目录 Markdown 或 `docs/` 下 Markdown 的 PR 不自动触发 CI；本地仍按改动范围执行文档检查。需要时可在 Actions 中手动运行 CI，手动运行不受文档路径过滤影响。网站部署使用独立工作流，不随本规则变更。

```bash
npm run typecheck
npm run validate:specs
npm test
npm run test:ui
```

类型检查覆盖生产、脚本和测试源码；规范校验覆盖 JSON Schema 正反例、需求 ID、验收引用和追踪路径。单元测试验证领域规则与角色输入输出；集成验证 CAS、Provider、取消、恢复；acceptance 验证两轮真实源码与双场景图；Console 测试验证实际交互和视图。

只改低影响文案或目录时按范围选择静态检查。用户明确要求不跑测试时遵从并记录，不补写通过结论。受控 Provider 测试证明机制，真实模型冒烟单独记录模型、配置摘要、Run 和工件证据。不要删除或放松现有断言来获得通过。

## Git 与交接

PR 围绕最终行为写动机、实现和验证，不自动合并。已存在 PR 的创建作者不可修改，重写 commit 需使用带预期远程值的 force-with-lease。

交接新增时间戳文件；`docs/epitaph/` 保留最近三次，较早记录先总结到 [historyEpitaph](HistoryEpitaph.md)，包含改动、当时验证边界与原记录的 Git 链接，再移除旧文件。当前状态只在 Status 维护，不把旧报告当作新任务授权。

<details lang="en">
<summary>English summary</summary>

Locate the module design under docs/specs before editing code. Keep contracts, implementation and verification aligned. Use an independently bootstrapped worktree, document skipped checks, and distinguish controlled providers from live model evidence. Keep the latest three handoffs and summarize older records in HistoryEpitaph.md.

CI skips PRs changing only root Markdown or Markdown under docs/. Code, configuration, schemas and mixed changes still trigger CI; manual CI remains available.

</details>
