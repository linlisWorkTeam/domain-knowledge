<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：澄清账号选择只属于当前会话，不作为项目协作规则。
-->
# 会话账号范围纠正

用户明确纠正：账号选择只适用于当前 session，不约束 session 之外的提交与 PR。已删除 AGENTS.md 中整个项目身份章节，并同步清除 CONTRIBUTING、Development、CodeTaste 的固定账号要求，更新历史汇总和 PR 描述。

先前交接把账号偏好写成项目级规定是误解，后续会话不得继承。移除本次会话新增的仓库级 Git user.name / user.email；当前会话提交使用单次命令身份，GitHub 操作使用单次进程凭据，不持久化新账号规则。

本轮只调整文档与身份配置，不修改业务逻辑，不运行测试。文档链接、文件清单和 diff 静态检查后更新 PR #36，不自动合并。更早目录审查交接已汇入 HistoryEpitaph，目录继续只保留最近三篇。
