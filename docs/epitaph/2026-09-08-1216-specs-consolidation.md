<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接按代码重写的规范结构、历史归档和项目身份规则。
-->
# 规范重写与项目身份交接

用户要求删除独立 security 规范，把设计移入 docs 并按当前代码职责重写，减少重复文档。当前工作仍在 `/root/projects/domain-knowledge-agent-pr`，更新 PR #36，不触碰原工作树业务改动，不自动合并。

设计统一到 `docs/specs/totalRules`、`domainFunction`、`application`、`infrastructure`、`interfaces`；Domain 和 Infrastructure 按代码模块对应。23 篇总体与模块设计说明当前行为、输入输出、失败和保留限制；LanguagePlugin、SearchAgent、C++ 插件等未实现能力明确标注。17 个机器 Schema 只迁路径，加载入口和验证脚本同步，编号与验收追踪保留。

根部指南聚合成 GettingStarted、Development、AgentDevelopment、Runtime、Operations、Status。docs/diagrams 仅保留 Views4Plus1.md；旧 ADR、阶段任务模板和报告汇总为 HistoryEpitaph.md，旧交接保留固定提交证据链接，epitaph 目录含本篇只留最近三次。

用户追加要求本项目 commit author、committer 和新建 PR 全使用 icedblkamericano，并改写本 PR 已提交记录。仓库级身份已配置；原两条提交 20e28e9 / 7cda52b 改为 7888848 / def8dcc，main 不变。现有 PR 创建者是 GitHub 不可编辑字段；后续 API 操作使用已授权 icedblkamericano 凭据，更新分支使用预期远端 tip 的 force-with-lease。

本轮延续用户不跑测试的要求，仅做类型和静态路径、Schema 字节、需求追踪、diff 检查，不运行测试或真实模型。历史 219/219、Console 14/14 不能作为当前提交通过结论。后续依据 PR 审查决定是否开展回归。

用户最后澄清：文件夹小驼峰、文件大驼峰。已修正七角色目录、deepSeekHarness/companyCodeAgent/uiApi、源码与设计的 LegacyOkf、HistoryEpitaph、Schema 和自有脚本/资源文件。工具固定名称和带时间戳交接保留，动态角色样例路径、截图基线引用及静态资源引用同步。机器 Schema 改名但字节与 $id 不变。
