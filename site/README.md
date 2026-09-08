<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明项目官网。
-->
# 项目官网

这里是 domain-knowledge 的 GitHub Pages 源码。它介绍 Knowledge Flywheel、LangGraph 执行层和知识治理层的边界，不读取本地 Registry，也不提供治理入口。Agent 列表、节点状态和提示词配置属于本地 Console，不属于静态站点。

## 本地预览

在仓库根目录运行：

```bash
npm run site:serve
```

打开 <http://127.0.0.1:4175>。需要更换端口时设置 `WP_SITE_PORT`。

## 文件

- `index.html`：语义结构、项目内容、版本更新和使用入口；
- `Styles.css`：深色/浅色主题、响应式布局和动效；
- `App.js`：主题、导航、飞轮阶段、快速入门页签和复制；
- `Mark.svg`、`SocialCard.svg`：站点图标和分享卡片；
- `ConsoleDev007Dev008.gif`：由真实 Console 与持久化接口数据录制的 DEV-007/008 操作动图；
- `ConsoleDev007Dev008Poster.webp`：为减少动态效果的访问者提供的静态替代图；
- `Release.json`：当前公开内容的发布标识、内容提交和演示证据 Run，供部署验收读取；
- `DevServer.mjs`：无依赖的本地静态服务器。

页面使用相对资源路径，可以部署在 GitHub Pages 的 `/domain-knowledge/` 项目子路径下。没有 CDN、第三方字体、统计脚本或后端请求。

## 重录 Console 动图

在仓库根目录运行：

```bash
node scripts/CaptureConsoleDemo.mjs
```

脚本会启动真实的 `createKnowledgeServer`，在临时目录中通过正式 API 写入知识版本、评测证据、来源漂移和已验证的 Pi Agent 配置，并通过正式工作流观察器、治理命令和 SQLite 观测组件写入确定性验收事实，再用 Chromium 依次截取操作中心、知识血缘与差异、评测、来源、Agent 设置、治理指标和浅色主题。输出会覆盖 GIF 与静态替代图，临时数据库和来源目录在结束时删除。

这些素材展示的是已有 Preview 与确定性验收事实，不是新 DSH 底座或真实模型效果证据。[DEV-019](../docs/Status.md) 已确认 DSH 角色运行方向；Pi 退出目标底座，但新实现交付前不得把旧截图改标为 DSH 成果。

这些记录只用于复验数据链路，不代表外部生产表现。调用耗时、Token 和重试来自持久化验收事实；未配置可信模型定价时，估算成本保持显示为 `—`。

演示使用专用假密钥。录制前会检查所有密码输入框与可见文字，发现密钥值就直接失败；生成的公开资产不包含密钥。该脚本需要项目依赖已经安装，并需要 Playwright Chromium 可用。

## 发布

本目录是公开站点的唯一源码。根目录保留兼容分支/Jekyll 的薄入口，构建时嵌入本页，并把资源指向本目录；不要在根目录复制页面资产。`.github/workflows/Pages.yml` 仅允许从 Actions 页面手动运行，不随 main 推送自动部署。使用前先在 Settings → Pages 启用站点并选择 **GitHub Actions**；工作流会探测 Source，Actions 模式发布本目录，分支模式跳过。未启用 Pages 时，探测接口可能返回 404，需先完成配置。

默认地址是 <https://linlisworkteam.github.io/domain-knowledge/>。若组织或仓库改名，要同步更新 `index.html` 中的 canonical、Open Graph URL 和文档里的访问地址。
