<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：代码风格与文档规则。
-->
# 代码风格与文档规则

代码位置：[src/domain/agents/codeAgent](../../../src/domain/agents/codeAgent)、[AGENTS.md](../../../AGENTS.md)、[scripts/BootstrapWorktree.ts](../../../scripts/BootstrapWorktree.ts)。


## 命名与组织

目录使用 lowerCamelCase，文件使用 PascalCase。角色示例是 `src/domain/agents/codeAgent/CodeAgent.ts`；契约和提示词分别是 `CodeAgentContract.ts`、`CodeAgentPrompt.ts`。模型适配器目录使用 `agentAdapters/deepSeekHarness` 和 `companyCodeAgent`，HTTP 入口目录使用 `uiApi`。测试、声明、Schema 和配置保留 `.test.ts`、`.spec.ts`、`.d.ts`、`.schema.json`、`.config.ts` 等后缀。

工具约定名称保留：`AGENTS.md`、`README.md`、`CONTRIBUTING.md`、`SECURITY.md`、`LICENSE`、`package.json`、`package-lock.json`、`tsconfig.json`、`index.html`、GitHub PR 模板和隐藏配置；`fw.mjs` 为既有外部兼容入口。交接文件按项目规则保留时间戳命名。运行时生成文件与固定历史提交中的路径不改写。其他自有源码、脚本、文档、Schema 和静态资源使用大驼峰文件名，不再把角色目录写成 XxxAgent。

Domain 按领域功能组织：agents、workflow、evaluation、association、knowledge、sourceScan、workspace、migration 是同层级目录，不设置 services 分组或总导出文件。领域服务类放在所属功能目录；Domain.ts 保留共享实体与不变量。

统一异步入口不意味着输入输出类型相同。用显式注册和依赖注入复用，只有实际存在成组替换需求才引入工厂。业务步骤使用普通函数、条件和循环；不为一次调用添加基类。

## 注释和文件说明

可注释文件包含 copyright、MIT 标识和中文功能说明。公共接口、输入输出、失败语义和核心业务步骤使用中文注释，解释原因与约束，避免只重复符号名称。`docs/FileCatalog.json` 只补充不能在文件内携带说明的 JSON 和二进制资源，不是全仓库文件镜像；Markdown、TS、可注释配置、SVG 和时间戳交接不重复登记。清单顶层元数据适用于未单独描述的此类文件；仅需要额外用途或来源说明时维护条目，不要求逐文件覆盖或为普通文档任务同步清单。

## 设计与指南

`docs/specs/` 是设计唯一入口，按实际代码模块组织，一份设计覆盖一个可独立理解的职责。`docs/` 根部指南只写运行和修改方法；同一规则不在多个文件复制。`docs/diagrams/Views4Plus1.md` 集中保存 4+1 视图。设计正文中文优先，关键入口带 English summary，标识符和协议值保持原样。

新增设计先判断能否合入现有主题。需求与验收编号保持稳定，历史状态不可冒充当前实现。`docs/epitaph/` 只保留最近三次交接，其余先归纳到 `docs/HistoryEpitaph.md` 再移除；原记录可从 Git 历史审计。

## 验证

按 [AGENTS.md](../../../AGENTS.md) 的 Verification Governance 和 Development 的影响范围选择验证；命名和文案约定通过 review 落实，不自动成为永久测试。用户明确要求跳过测试时记录未执行项，不能把旧结果标为本轮通过。失效断言应删除，但禁止借清理掩盖行为回归。


文档关系：[设计目录](../README.md)负责代码与设计定位；[开发指南](../../Development.md)说明修改和交付步骤。

<details lang="en">
<summary>English summary</summary>

Use lowerCamelCase directories and PascalCase filenames, explicit role registration, Chinese API comments and copyright headers. Keep one design per responsibility under docs/specs. Archive older handoffs after preserving the latest three.

</details>
