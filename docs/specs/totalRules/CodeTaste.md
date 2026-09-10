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

Domain 中 `agents` 与 `services` 平级：`agents/<role>` 保存领域内部角色实现；`services/<feature>` 按 association、evaluation、knowledge、workflow、sourceScan、workspace、migration 组织领域对外服务及所属规则。`Domain.ts` 保留共享实体与不变量。领域服务封装业务能力，不复制 Agent 的生成步骤，也不承担 Application 的持久化事务。

统一异步入口不意味着输入输出类型相同。用显式注册和依赖注入复用，只有实际存在成组替换需求才引入工厂。业务步骤使用普通函数、条件和循环；不为一次调用添加基类。

## 开发过程中的 subagent 并行协作

主开发 Agent 可以调度 subagent 并行完成相互独立的代码、Spec、测试或审查任务。调度由开发宿主提供；开发任务不必先启动业务飞轮。每项委派必须给出目标、基线提交、可修改文件范围、依赖、验收命令与交付格式，主 Agent 负责最终集成和结论。

有写入的 subagent 使用独立 worktree，任务开始前阅读最新墓志铭并完成 bootstrap READY；依赖目录不得共享。只读审查可以共享只读代码。共享契约先由主 Agent 确定；同一目标文件存在冲突时先拆分责任或串行集成，不让多个 Agent 覆盖同一工作副本。上游未完成时，下游只做不依赖结果的工作。

并发数遵从宿主可用槽位及 CPU/内存预算；资源紧张时允许代码与文档分析并行，但安装、构建和重测试串行。取消主任务应停止相关 subagent；失败必须回报原始原因和未完成项。子任务交付基线、提交或 diff、实际验证结果及限制，主 Agent 检查冲突后集成，并在集成后的树上运行适当验证。跨会话交接保留墓志铭。

宿主没有 subagent 能力时按同样任务边界串行执行并说明原因。这里约束开发协作；产品的七角色由固定 Workflow / LangGraph 调度，DSH 会话内动态派生 subagent 不在本项交付范围。

## 注释和文件说明

可注释文件包含 copyright、MIT 标识和中文功能说明。公共接口、输入输出、失败语义和核心业务步骤使用中文注释，解释原因与约束，避免只重复符号名称。JSON、锁文件及图像等不能加注释的格式统一登记到 `docs/FileCatalog.json`。

## 设计与指南

`docs/specs/` 是设计唯一入口，按实际代码模块组织，一份设计覆盖一个可独立理解的职责。`docs/` 根部指南只写运行和修改方法；同一规则不在多个文件复制。`docs/diagrams/Views4Plus1.md` 集中保存 4+1 视图。设计正文中文优先，关键入口带 English summary，标识符和协议值保持原样。

新增设计先判断能否合入现有主题。需求与验收编号保持稳定，历史状态不可冒充当前实现。`docs/epitaph/` 只保留最近三次交接，其余先归纳到 `docs/HistoryEpitaph.md` 再移除；原记录可从 Git 历史审计。

## 验证

正常开发按 Development 中的检查清单验证；用户明确要求跳过测试时必须记录未执行项，不能把旧结果标为本轮通过。禁止删除失败断言来掩盖行为回归。


文档关系：[设计目录](../README.md)负责代码与设计定位；[开发指南](../../Development.md)说明修改和交付步骤。

<details lang="en">
<summary>English summary</summary>

Use lowerCamelCase directories and PascalCase filenames, explicit role registration, Chinese API comments and copyright headers. Keep one design per responsibility under docs/specs. Archive older handoffs after preserving the latest three.

</details>
