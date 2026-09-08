# SearchAgent PR 交付与账号边界

## 目标与当前状态

- 用户要求提交 SearchAgent 文档 PR，并明确 GitHub 操作使用 `skelitalynn`。
- 已创建 `docs/search-agent-direct-application`，将 SearchAgent 文档提交移到 `origin/main`，排除原分支 `docs/startup-main-access` 中的启动文档提交 `bc5e121`。原分支和提交保留。
- 文档提交 `d28b6b3` 已通过 `git@github.com:linlisWorkTeam/domain-knowledge.git` 推送；SSH 身份检查明确返回 `Hi skelitalynn!`。
- PR 尚未创建：当前 gh API、Git 凭据存储和 GitHub 连接器的实际身份均为 `icedblkamericano`，不能用它们代替用户指定的账号创建 PR。SSH 只支持推送，不提供 PR API 授权。

## 验证与准备材料

- 基于 main 重新执行 `npm run validate:specs`、5 项 `component-layout.test.ts` 文档契约和 `git diff --check origin/main...HEAD`，全部通过。
- PR 标题：`docs: 新增 Application 直调 SearchAgent 的架构与检索流程`。
- 已按仓库 PR 模板准备正文：`/tmp/search-agent-pr-body.md`。
- 新建 PR 页面：https://github.com/linlisWorkTeam/domain-knowledge/pull/new/docs/search-agent-direct-application 。目标分支为 main。

## 后续动作

- 用户在此环境通过 gh 完成 `skelitalynn` API 登录后，先核验实际 API login，再使用正文文件创建 PR。不得展示、记录或要求在对话中粘贴 token。
- 创建后确认 PR 作者、base/head 与文件范围，向用户返回真实 PR 链接；不要合并。
- SearchAgent 仍为 Planned，本次只交付文档，不启动其代码实现。
