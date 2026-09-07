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
