<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明贡献入口、项目身份和设计到交付的协作约定。
-->
# 贡献指南

开始前阅读 [AGENTS.md](AGENTS.md)、最新交接、[当前状态](docs/Status.md)和所属[模块设计](docs/specs/README.md)。日常步骤集中在 [Development](docs/Development.md)，不另建一套任务文档模板。

## 修改与交付

1. 说明具体触发场景、预期结果和失败分支，更新对应设计。
2. 保留已有工作，使用独立 bootstrap 的工作树；角色、领域流程、用例和适配器按代码目录修改。
3. 同步 Schema、消费者和验收追踪；文档路径调整不改变机器契约字节。
4. 执行适当检查并记录未执行项，实际结果进入 PR，不引用旧结果冒充本轮通过。
5. 提交供审查，不自动合并。重大方向变化更新现有架构设计，历史背景归纳到 historyEpitaph。

本项目 commit author、committer 和 PR 创建账号统一为 `icedblkamericano`，邮箱使用 `46128748+icedblkamericano@users.noreply.github.com`。提交及创建 PR 前核验实际身份；该规则覆盖旧交接中的账号偏好。

设计统一放在 `docs/specs/`，代码仍位于 `src/`，操作文档直接位于 `docs/`。不恢复根级 specs、退役包装工程或重复 Runner。中文命名说明、版权文件头、公开接口注释见 [CodeTaste](docs/specs/totalRules/CodeTaste.md)。

<details lang="en">
<summary>English summary</summary>

Read the working agreement and the relevant design before editing. Keep implementation, schemas and verification aligned, and report skipped checks honestly. All project commit authors, committers and new pull-request creators use icedblkamericano. Design lives under docs/specs; concise operational guides live directly under docs. Do not merge pull requests automatically.

</details>
