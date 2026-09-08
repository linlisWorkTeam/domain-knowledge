<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明项目验收解耦与 OpenCode Go 环境配置。
-->
# 项目验收解耦与 OpenCode Go 环境配置

## 用户目标与范围

- 用户要求清理 `acceptance/ohmyworkpanel` 与 `deploy/deepseek-harness`，保留 OpenCode Go 模型接入，并允许用环境变量配置密钥和连接参数。
- 基于最新 `origin/main`（`a743ffc`）创建独立分支 `refactor/remove-project-fixtures`，没有修改其他工作区。本轮准备本地提交，尚未推送或创建新 PR。
- 前序 SearchAgent PR #31 已由 skelitalynn 创建，账号授权已完成；前一篇交接中的“PR 尚未创建”是当时状态，不再是阻塞。

## 已完成

- 删除两个目标目录，移除 WorkPanel 专属验收 CLI、npm 命令和目录强制断言。通用 `runRealSourceFlow`、项目评测器和 LangGraph 验收保留，以临时 Git 项目验证两轮流程。
- 公共工作流新文档使用 `automated-project` 分类与 `langgraph` 标签，真实源码验收只保留通用 `e2e` 标签；不改写已有知识版本的历史元数据。
- 新增 DSH `opencode-go.ts`：根据环境参数生成运行目录内按内容摘要命名的 JSON patch；只记录 API-key 环境变量名，不写密钥值。保留原有 API 地址默认值、DeepSeek thinking 格式和重试设置。
- 核实上游锁定版本的 sdk-minimal 不包含 llm-pi-ai/default-model；旧覆盖模板无法注册模型。生成配置在 minimal 中显式插入上游模型适配插件，由 SDK 初始化选择 Provider/模型；其他 profile 沿用覆盖方式。
- 部署说明移至 `docs/guides/dsh-runtime.md`，更新环境模板、规范、测试说明、目录结构和当前进度。历史研究证据与墓志铭保留；不把旧验收结果改写为 V1 完整闭环已通过。

## 使用与兼容

- 环境方式：`WP_DSH_PROVIDER=opencode-go`、`OPENCODE_GO_API_KEY`、可选 `OPENCODE_GO_BASE_URL`、`WP_DSH_MODEL`、`WP_DSH_MAX_TOKENS` 与 `WP_DSH_CONTEXT_WINDOW`，放在忽略的 `.env.local` 或进程环境中。
- 默认上下文 262144、输出上限 32768；地址和模型默认沿用原配置，未做外部服务能力声明。不得在对话、源码、patch 或快照中粘贴密钥。
- 已保存 Console Provider 配置仍优先：有效启用配置直接使用；保存但未验证/停用时拒绝新 Run，不自动回退环境配置。文档建议环境方式使用无 Console 设置的独立运行目录；不要删除旧运行数据。
- 显式 `WP_DSH_PATCHES_JSON`（包括 `[]`）覆盖内置生成配置。非秘密参数变化与旧 patch 路径迁移会改变 Run 配置摘要，旧 Run 可读但不兼容恢复需新建 Run；密钥轮换不改变摘要。

## 验证

- 当前 shell 默认 Node 22，与现有 better-sqlite3 的 Node 24 ABI 不匹配。首次完整测试失败后，使用 `/root/.nvm/versions/node/v24.13.0/bin` 置于 PATH 最前重跑，不重新编译或改变锁文件。
- Node 24 的 `npm run typecheck`、`npm run validate:specs` 通过。
- 完整 `npm test` 176 项通过，0 失败/跳过；`npm run test:ui` 14 项通过。日志：`/tmp/domain-knowledge-decoupling-tests-node24.log`、`/tmp/domain-knowledge-decoupling-ui-node24.log`。
- 在完整回归后补充 minimal 模型插件注册；随后重跑 OpenCode Go、Run 配置与文档契约共 14 项通过（OpenCode Go 共 3 项），包括真实 DSH 配置合成和 initialize 启动，不发送模型请求。
- `git diff --check` 通过；两个目标目录已不存在，活动代码与命令没有旧目录引用，文档链接契约通过。

## 后续

- 用户提供或自行配置真实 OpenCode Go 密钥后，通过既有 CPU 范例验证模型请求；本轮没有读取或保存真实密钥，也没有调用外部模型。
- V1 R3/R4 仍须独立验收。若用户要求 PR，以 skelitalynn 推送本分支并创建独立 PR，不混入其他未审改动，不自动合并。
