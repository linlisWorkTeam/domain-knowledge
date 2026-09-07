# 验证证据

## 基线与本次范围

- 日期：2026-09-07。
- 分支：`docs/contributor-worktree-quickstart`。
- Commit：`1e826bb614f7fada9e29c3f4bb9e9e4125a4fa1a`。
- 本次仅修改文档和本变更包；未切换运行后端、修改依赖、迁移数据或运行真实模型。
- 开始时有未跟踪的三份 DFX epitaph 和一份 DFX 报告；保持原样。DEV-014 worktree 有独立未提交实现，不属于本次验证范围。

## 首轮文档验证

使用本机 Node 24.13.0；没有重跑全量实现测试或 live 验收。

| 检查 | 结果 |
| --- | --- |
| `git diff --check` | 退出 0，无空白错误 |
| `/root/.nvm/versions/node/v24.13.0/bin/node specs/13-verification/validate-specs.ts` | 退出 0；`SPEC_VALIDATION_OK schemas=17 commands=7 results=8 p0=51` |
| `/root/.nvm/versions/node/v24.13.0/bin/node --test tests/contract/site.test.ts` | 退出 0，测试文件通过，无失败或跳过 |
| 本地 Markdown 链接与锚点检查 | 覆盖 6 份修改文档和本变更包 6 文件，共 86 个本地链接，缺失路径/锚点 0；未检查外部链接 |

链接检查读取上述文件的 Markdown 链接，跳过代码块与外部 URL，将相对路径按文档目录解析，并核对目标文件及标题/显式锚点。人工复核确认：当前实现与目标分开、未将 Pi 或固定执行器记为已删除、底座与完整闭环分别验收、DEV-010 后置、所有实现和 live 任务仍未勾选。

## 全库文档同步复核（2026-09-07）

按用户要求复核仓库内 Markdown，补齐根 README、贡献/开发/快速上手/运维指南、DSH 部署与两个方向的接入说明、系统图、站点素材说明，以及需求、架构、前台、用例、Agent、API 和验收入口。各处统一区分已确认目标、当前实现和历史证据。现行正式条款与实现状态保留 baseline；待迁移范围归入 spec-delta，不把文字同步记为代码完成。

公司 CLI 的现有操作说明已改为未验证的 Adapter 协议假设；不能仅靠工具参数、工作目录或自建夹具证明真实兼容及文件隔离。旧报告和 epitaph 保留原样，文档首页明确其历史性质与当前任务的优先关系。修复快速上手指向运维手册的缺失英文锚点。

| 检查 | 结果 |
| --- | --- |
| 全库 Markdown 本地链接/锚点 | 含本轮交接共 94 份 Markdown、230 个本地链接，缺失路径/锚点 0；外部链接未联网验证 |
| Spec 校验（Node 24.13.0） | `SPEC_VALIDATION_OK schemas=17 commands=7 results=8 p0=51` |
| `node --test --test-concurrency=1 tests/contract/component-layout.test.ts tests/contract/site.test.ts`（Node 24.13.0） | 17/17 通过，无失败或跳过 |
| `git diff --check` | 退出 0，无空白错误 |

链接扫描覆盖根目录、docs、specs、部署、源码 README、站点、验收样例和模板；逐行排除 fenced code，解析相对路径并核对 Markdown 标题或显式锚点。历史记录同样纳入链接检查。没有修改运行代码、API、Schema 或依赖，没有重跑全量实现测试、真实模型或公司 CLI。

## 未验证边界

AC-DSHF-001～005 全部尚未执行；普通 CPU 模块和示范角色的具体选择留待实现设计。用户转述的公司 CLI 参数仅为后续协议核对线索，不是本仓库已完成的兼容性证据。

## 结论

本轮文档交付完成并通过上述检查。底座实现、可运行范例、七角色开发、外部完整闭环与公司适配均不能据此标记完成；变更包保持 active，实施增量保持 Draft。

## Roadmap 拆解与执行交接（2026-09-07）

用户要求在原有文档中形成可执行、可验收的 Roadmap，并将下一步设为执行开发。本轮沿用 plan/tasks/acceptance/spec-delta/proposal/evidence 和现有开发状态、SOP、教程，不新增 roadmap、报告、角色任务书或交接文件。此节承接最新执行状态；此前 epitaph 仍保留当时记录。

已将开发分为 R0 基线核实、R1 底座收敛、R2 真实 DocGen 范例、R3 七角色、R4 外部闭环。增加实际依赖迁出、DSH 配置与旧 Run、逐角色交付三项拟验收，明确公司 CLI 后置不阻塞 DEV-019 关闭。旧 Run 保留可读且不跨后端恢复，旧秘密不自动迁移；实施时遇到实际不兼容再按证据处理。

下一步直接执行 T100、T101，完成环境/参考测试与 DSH 接线核实后进入 T102/T105/T106 开发。常规实现细节由实施者按 Roadmap 落实；未要求再次确认整体架构。当前只是文档拆解，尚未执行这些开发任务。

| 阶段 | 状态 | 实现/验收证据 | 下一动作 |
| --- | --- | --- | --- |
| R0 | NOT_RUN | 尚未执行本 Roadmap 基线、样例参考测试和能力核实；已有历史测试不自动计入 | 执行 T100、T101 |
| R1 | NOT_RUN | Pi 与固定执行器仍在当前代码中 | 执行 T102、T105、T106 |
| R2 | NOT_RUN | 通用 live 范例入口尚未交付 | 执行 T103、T104 |
| R3 | NOT_RUN | 当前七角色历史能力不等于 DSH 新底座逐角色验收 | 执行 T200、T210、T211 |
| R4 | NOT_RUN | 无本目标的完整外部闭环证据 | 执行 T201、T220、T300 |

后续每个阶段在本文件追加记录，不把上表的规划结果当成实测。所有实现任务保持未勾选；未启动真实模型、修改代码/依赖、提交或推送。

本轮文档验证使用 Node 24.13.0：Spec 校验通过（17 schemas、7 commands、8 results、51 P0），component-layout/site 契约 17/17 通过；全库 94 份 Markdown、240 个本地链接/锚点检查通过，git diff --check 通过。Roadmap 中任务引用全部可解析，实施任务均未勾选，所列现有 npm scripts 均存在。外部链接未联网检查；新增验收场景及 live 入口仍待开发，不能由这些文档检查认定通过。

## T100/T101 执行及 R1 首批开发（2026-09-07，最新）

用户要求先推送文档，再执行 T100/T101 并进入 R1。文档提交 `3f999204f988697cc5bb9473c5a10ad5b4fc1f78` 已推送到 `origin/docs/contributor-worktree-quickstart`，`git ls-remote` 核实一致。首次网络连接超时，带超时的重试成功。之后在同一工作区创建 `codex/dev019-dsh-foundation` 分支继续开发，未新建 worktree，未动 DEV-014 工作区或旧 DFX 草稿。

### R0 结果：PASS

- 默认 shell 为 Node 22，本次所有 Node/npm 验证显式使用 Node `24.13.0`。
- 当前独立 `node_modules` 中所需顶层依赖版本匹配 package/锁文件；存在两个未声明的可选图像包，未作为本次验证前提。未重新安装或共享依赖目录。锁文件 SHA-256：`bf6460e28462e9138b0608e4e64563ac0683ce81108df99476afbb1a3dba452f`。
- DSH 与 SDK 均为 `0.1.2-alpha.4`，Bubblewrap `0.11.0`。已读本地 SDK `types.d.ts`、`api.d.ts` 及项目 Adapter、业务阶段、配置组合根，职责与待补能力写回 spec-delta.md。
- 本轮进程未提供 `OPENCODE_GO_API_KEY`/`DEEPSEEK_API_KEY`，仓库无 `.env.local`；没有执行真实模型或网络认证探测。R2 live 前仍需配置并验证实际路由和凭据，不能以本轮夹具替代。
- R0 类型与 Spec 通过；架构、角色契约、DSH、工作区四组测试 28/28 通过。受限沙箱最初拦截 Git 子进程（EPERM），申请权限后按相同范围重跑通过，无基线代码修复。
- CPU 样例选用 `src/domain/services/markdown-diff.ts` 的 `structuredMarkdownDiff`，源码 commit 固定 `3f999204f988697cc5bb9473c5a10ad5b4fc1f78`，源码 SHA-256 `58ac3ba8b93fb94fa9c8abedb7c6cb8017b28ccfa4dfec2f9923f767ab52eb80`。参考契约为两个字符串输入及结构化差异输出；R2 补独立公开声明，后续允许生成路径仅为该模块，不暴露参考测试给 Code。
- 新增独立参考测试 `tests/unit/markdown-diff.test.ts`，SHA-256 `17ed0b564ffcfc6387ecb57ac1e33d4dd8fb72694b69694eab31ace7b973f199`。用 `git archive 3f99920 src/domain` 构建 `/tmp/dev019-cpu-reference`，将该测试复制进去后执行 `node /tmp/dev019-cpu-reference/tests/unit/markdown-diff.test.ts`，7/7 通过；不依赖修改中的工作区源码、公司平台或 NPU。

### R1 当前已实施范围

1. 将公共业务阶段改为 `ProjectWorkflowStages`，保持现有 LangGraph 与业务 Schema；移除公共阶段的 assets 类型、assetRoot 和预写内容读取。显式夹具留在 Infrastructure 的 `FixtureProjectWorkflowStages`，只在 fixture 路径选择。真实 Provider 缺失或执行失败不会由公共阶段生成预写结果。
2. 真实路径测试不再需要假 assets；两个不同模块/目录场景通过实际业务阶段、固定 commit 工作区和 DSH Adapter，并用受控 SDK runtime 检查输出入 CAS、角色/Run/session 关联。该测试没有执行外部模型，也不证明完整七角色或不同评测命令已通用化。
3. DSH 每次尝试记录 sessionId，拒绝错配 session 的响应；取消与同刻成功竞态不得返回成功。业务阶段在调用前、结果返回后和完成提交前检查取消，防止迟到结果形成成功 checkpoint。现有 Schema、工件和角色校验继续执行。
4. 旧 Pi SDK、配置/API/Console、默认选择及 CLI/API 的固定场景入口仍保留；T102/T105/T106 均未整体验收，AC-DSHF-006/007 不能标为通过。未迁移秘密、旧 Run 或公开 API/Schema。

### 验证

以下命令在仓库根目录执行，Node/npm 通过 `PATH=/root/.nvm/versions/node/v24.13.0/bin:$PATH` 选择版本；需要 Git/隔离/本地服务的测试在授权的沙箱外执行。

| 检查 | 结果与定位 |
| --- | --- |
| `npm run typecheck` 的等价命令 `node node_modules/typescript/bin/tsc --noEmit` | 退出 0 |
| `node specs/13-verification/validate-specs.ts` | `SPEC_VALIDATION_OK schemas=17 commands=7 results=8 p0=51` |
| R0 四组基线 | 28/28，`/tmp/dev019-r0-tests-unrestricted.log` |
| 固定源码参考测试 | 7/7，源码 commit 与测试摘要如上 |
| `npm test` | 160/160，无失败/跳过；`/tmp/dev019-r1-full.log`。首轮 159/160，新取消测试缺少 getArtifact 夹具；补齐后重跑全量通过 |
| `npm run evaluate:framework` | 7/7，`frameworkMechanics=VERIFIED`；`/tmp/dev019-r1-framework.log`，不代表 live 质量 |
| 文档和差异检查 | 94 份 Markdown、240 个本地链接/锚点有效；`git diff --check` 通过；外部链接未联网验证 |

### 执行交接

当前 R0=`PASS`；R1 开发中且整体验收未完成；R2～R4=`NOT_RUN`。本轮开发差异位于 `codex/dev019-dsh-foundation` 工作区，尚未提交或推送；此前文档已推送。下一步继续 R1：迁出 Pi SDK/配置与默认选择，落实 DSH 的真实配置/工具能力和旧 Run 拒绝跨后端恢复，打通通用 CLI/API 场景输入，再完成 AC-DSHF-006/007 及 T102 剩余检查。不要重新启动整体架构讨论，也不要把本批测试记为仅 DSH 的完整底座已验收。继续在现有证据文件追加记录，不新增阶段报告。

## R1 / T102（2026-09-07）：PASS

在 `512b2ed` 上完成 DSH 原生 minimal profile、项目只读工具插件、独立尝试 home 和角色工具快照。真实 DSH 进程对本地受控 SSE 服务完成读取和拒绝测试；运行审计关联 session、任务、角色，不含模型正文或密钥。应用契约/CAS/事件继续沿用既有实现；无新增 Agent 框架。

Node 24.13.0、DSH/SDK 0.1.2-alpha.4。验证命令：`npm run typecheck`（0）、`npm run validate:specs`（17 schemas / 7 commands / 8 results / 51 P0）、`npm run test:architecture`（6/6）、`npm test`（161/161，0 skip）。针对 DSH/业务契约/角色工作区的五文件回归 28/28，含非法输出、有限重试、超时、取消、迟到成功、session 错配与权限拒绝。完整测试临时输出 `/tmp/t102-full.log`；可复执行源码为 `tests/integration/dsh-native-tools.test.ts`、`deepseek-harness-agent.test.ts`、`agent-contracts.test.ts`、`dsh-project-stages.test.ts` 和 `tests/security/agent-workspace.test.ts`。

AC-DSHF-002、003 自动化部分 PASS；R2 真实模型及 R4 完整崩溃恢复不计入本次证明。T105/T106 尚未完成。

## R1 / T105 场景入口功能（2026-09-07）：PASS，任务仍待 Pi 迁出

CLI `--scenario`、API/Console `scenario` 同步接入通用校验，固定项目 loader/assetRoot 从组合根移除。已解析 Git commit 的场景存入 CAS 和业务 checkpoint，重新生成从原 Run 读取；没有旧场景不自动套用模板。

`tests/acceptance/automated-langgraph-flow.test.ts` 用 formatter/lib 与 normalizer/components/nested 两个模块和不同测试文件命令，经过同一 LangGraph 七角色接线、两轮真实 CPU 测试、纠正及确定性发布。角色输出明确使用 Fixture Adapter，不能算 live 模型。两个场景均验证冻结场景、七角色信封、评测输入和唯一发布。

针对性验收：场景全流程加 Server 回归 9/9；新增场景验证 2/2；typecheck 与 Spec 校验通过。T105 的 Pi 迁出和 T106 的配置迁移需原子更新，下一功能继续完成；本次不提前勾选整个 T105。

## PR #23 CI 修复（2026-09-07）：本地验收 PASS

GitHub Actions run `34096298827` 的失败来自三个真实回归：场景读取绕过 Application 直接访问 Repository；场景 checkpoint 在 AgentCommand 校验前执行；缺 Provider/取消场景仍提交场景 checkpoint。修复为应用服务提供带 Run/节点范围校验的已提交输出查询，并把场景 checkpoint 放在编排角色成功之后。保留原有架构、命令校验和取消断言，新增跨 Run/未提交 checkpoint 拒绝检查。

在独立 worktree `/tmp/domain-knowledge-pr23-ci` 从 PR 原提交 `9af91b4` 启动，`npm run bootstrap:worktree` 与 `bootstrap:worktree:check` 均为 READY；Node 24.13.0，按该 PR 锁文件独立安装依赖，未使用另一工作区中尚未验收的 DSH 配置迁移代码。

验证：`npm run typecheck` 通过；`npm run validate:specs` 为 17 schemas / 7 commands / 8 results / 51 P0；`npm test` 165/165、0 skip；`npm run test:ui` 14/14。新增浏览器测试通过实际 HTTP API 验证非法路径返回 422 且不调度，合法场景返回 202 并保留模块及仓库输入；只替换最终任务启动用于观察输入，不冒充模型闭环。首次新增浏览器测试因导航标题写错失败，修正为“飞轮批次”后完整重跑 14/14。

本次补齐 #23 的浏览器验收，不代表 T105 整体、T106 或 R2 live 模型已完成。远程 CI 结果以本 PR 最新提交的 Actions 为准；临时输出 `/tmp/pr23-full.log`、`/tmp/pr23-ui-final.log`。
