<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接产品浏览器验收的路由拦截修复与安装测试配置补全。
-->
# 产品浏览器路由修复

从主提交 `4aaf256` 在既有独立 worktree 创建 `fix/product-console-acceptance`，bootstrap 检查 READY。读取最新验证组交接及主 Agent 的 `/tmp/mvp-ui-product.log`（新增浏览器 2 通过 / 3 失败）。

三项失败具有同一原因：Playwright 的 `**/api/v1/publications**` 只匹配列表，不匹配 `/settings`、`/sync` 与正文子路径；静态调用当前安装版 glob parser 已复现。结果是设置读到随机临时目录、同步落到真实 Git、正文访问未准备的数据库。改用 URL pathname 边界匹配，并给测试服务产品用例注入未拦截即失败的哨兵，确保受控测试无法误调用真实文件操作、Git 或模型。

安装包白名单补入 `Playwright.config.ts`，tests 下的用例和基线原已包含。没有产品 UI 缺陷的直接证据，不修改展示行为、测试断言或截图。当前未审设置截图含随机临时目录，主 Agent 需在修复后重新采样并审阅；知识阅读截图仍待生成。

仅运行 bootstrap 检查、glob parser 静态复现、TS/JS 语法和 diff 检查；未运行浏览器、模型、安装包或重测试，避免与模块评测争用 ECS。主 Agent 接续串行运行五个新增浏览器用例并完成视觉审阅。
