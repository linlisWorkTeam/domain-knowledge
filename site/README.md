# 项目官网

这里是 domain-knowledge 的 GitHub Pages 源码。它介绍 Knowledge Flywheel、LangGraph 执行层和知识治理层的边界，不读取本地 Registry，也不提供治理入口。Agent 列表、节点状态和提示词配置属于本地 Console，不属于静态站点。

## 本地预览

在仓库根目录运行：

```bash
npm run site:serve
```

打开 <http://127.0.0.1:4175>。需要更换端口时设置 `WP_SITE_PORT`。

## 文件

- `index.html`：语义结构、项目内容和使用入口；
- `styles.css`：深色/浅色主题、响应式布局和动效；
- `app.js`：主题、导航、飞轮阶段、快速入门页签和复制；
- `mark.svg`、`social-card.svg`：站点图标和分享卡片；
- `release.json`：当前公开内容的发布标识、内容提交和演示证据 Run，供部署验收读取；
- `dev-server.mjs`：无依赖的本地静态服务器。

页面使用相对资源路径，可以部署在 GitHub Pages 的 `/domain-knowledge/` 项目子路径下。没有 CDN、第三方字体、统计脚本或后端请求。

## 发布

本目录是公开站点的唯一源码。当前 Pages Source 是分支/Jekyll，根目录的薄入口会在构建时嵌入本页，并把资源指向本目录；不要在根目录复制页面资产。`.github/workflows/pages.yml` 会先探测 Source：分支模式下主动跳过，避免和 Jekyll 争抢发布环境；管理员日后若在 Settings → Pages 切换到 **GitHub Actions**，它会直接发布本目录。之后也可以从 Actions 页面手动运行。

默认地址是 <https://linlisworkteam.github.io/domain-knowledge/>。若组织或仓库改名，要同步更新 `index.html` 中的 canonical、Open Graph URL 和文档里的访问地址。
