# 教程：基于 DSH 开发一个 Agent 角色

> 状态：R1 已合入；R2 T103/T104 的真实 DocGen、独立检查和第二工作区修改复现已通过本地验收，PR #26 已合入。实际 Run、源码复核及失败记录见 [DEV-019 证据](../../specs/changes/active/DEV-019-dsh-agent-foundation/evidence.md#r2-live-验收2026-09-07)。R3/R4 未执行。

## 从公共范例开始

先由公共底座负责人完成“LangGraph 节点 → DSH 角色 → 业务结果校验与工件存储”的最小链路，再分发七个 Agent 的开发任务。完整步骤见[公共开发 SOP](../guides/agent-customization.md#agent-development-sop)，架构见[架构说明](../ARCHITECTURE.md)。

首个范例选用普通 CPU 可运行的小模块，默认示范角色为 DocGen。范例应提供固定源码版本、公开接口、现成测试、所需环境说明、一个真实 DSH 角色和可检查的输出。R0 固定样例为 `structuredMarkdownDiff`，下文提供运行和独立检查命令；不把 ohMyWorkPanel 写成公共运行器的前提，也不要求先准备昇腾硬件或公司 CodeAgent 环境。

## 开发一个角色

按文件定位职责、业务分支和测试，请先查[角色开发指南](../guides/agent-customization.md#目录与类)。本教程负责范例运行与检查，代码分工在指南统一维护。

1. 复现范例，阅读 `specs/06-agents/` 中本角色的职责及可见材料。
2. 在 DSH 上定义角色指令与所需工具，按业务 Schema 准备输入输出样例。复用 DSH 的会话、模型和工具运行能力。
3. 实现角色行为，通过现有业务边界返回结果；材料不足和失败必须明确表达。
4. 独立验证角色结果与权限边界，保存脱敏证据，再接回 LangGraph 做上下游联调。
5. 交付角色说明、配置、实现、测试和联调证据。实际职责或契约变化同步 Spec 与相关文档。

开发者负责自己的角色，不另建 Agent 运行框架，不把固定项目的源码路径和测试命令写入公共逻辑。简单措辞调整仍可使用现有 [`promptAddon`](../guides/agent-customization.md#允许改什么)；它不是新增工具或改变职责的入口。

## 两层验收

| 阶段 | 必须证明 | 不能据此宣称 |
| --- | --- | --- |
| 底座与范例 | 普通 CPU 样例上 DSH 真实执行一个角色；结果校验、工件、失败与取消可检查；开发者能沿用范例开发角色 | 七角色已具备全部业务能力、知识已验证发布 |
| 第一版闭环 | 七角色通过 DSH 实际协作，候选知识经过独立测试与确定性门禁；失败归因和修订路径有证据 | 公司 CLI 已适配、生产规模或 CANN 硬件性能已验收 |

工作流夹具可用于自动回归与补齐尚未实现的测试节点，但必须明确标识；不能用预写知识或代码冒充真实模型生成。新文档可以在闭环中生成，独立测试的预期须来自可信参考实现或确认过的规则。

## 持续保留的边界

- Agent 不直接决定 `VERIFIED`；评测与发布属于业务服务。
- DSH 执行事件不自动成为知识真实性证据；输出需经过业务校验。
- Code 角色不能读取参考源码或门禁答案；不同 session 本身不证明文件隔离。
- 工件通过版本化 Schema 和 ArtifactRef 交接；SDK 类型不进入业务核心。
- 恢复与重试不能重复发布，配置按 Run 冻结；Prompt 和凭据不进入命令行参数或公开报告。
- CodeAgent CLI 后续交付相同的业务结果，真实命令与认证协议需另行验证。

## 运行 CPU DocGen 范例

范例入口为 `src/interfaces/runner/docgen-example.ts`，公开签名见 [markdown-diff.d.ts](../../examples/docgen/markdown-diff.d.ts)，角色指令见 [prompt.txt](../../examples/docgen/prompt.txt)。源码固定到 `3f999204f988697cc5bb9473c5a10ad5b4fc1f78` 的 `src/domain/services/markdown-diff.ts`，不读取当前工作树中的修改。DocGen 的工作区只物化该源码（其中包含完整公开签名），参考测试和运行凭据不作为材料提供。

使用 Node 24。新 worktree 必须先完成 bootstrap，依赖目录独立：

```bash
npm run bootstrap:worktree
npm run bootstrap:worktree:check
npm run example:docgen -- prepare
```

`prepare` 从固定 commit 导出可信源码、核对源码与参考测试 SHA-256，再实际执行 7 项非空参考测试。失败时不启动模型，临时参考副本位于运行目录的 `reference-checks/`。需要完整 Git 历史；浅克隆须先取回固定 commit。

默认使用独立运行目录 `.workpanel/docgen-example`。Linux 真实运行要求 Bubblewrap 可用，原生 DSH 模型配置方法见 [DSH 部署说明](../guides/dsh-runtime.md)。可以使用已经安全配置的 `DEEPSEEK_API_KEY` 环境变量，或通过 Console 在同一个运行目录保存并验证模型：

```bash
WP_FLYWHEEL_HOME="$PWD/.workpanel/docgen-example" npm run knowledge:serve
```

使用不同运行目录时，将同一路径传给下方的 `--runtime`。没有配置时返回 `DOCGEN_LIVE_CONFIGURATION_REQUIRED`，不会回退 Fixture，也不会调用公司 CLI。不要将密钥写进角色指令或命令行参数。

```bash
npm run example:docgen -- run
# 使用另一个已经配置好模型的独立运行目录：
npm run example:docgen -- run --runtime /absolute/path/to/example-runtime
```

入口通过 Application 的开发执行观察器调用生产 `ProjectWorkflowStages` 和 Domain DocGen，复用现有 DSH 适配、配置快照、只读材料、Command/Result Schema、checkpoint 和 CAS。它与通用 `npm run agent:run -- --role <role> --input <sample.json> --output <directory>` 共用 `RoleExecutionService`，不启动 LangGraph 或七角色发布图。示范 Run 只用于角色工件关联，业务状态保持 CREATED；节点完成并不代表整个业务 Run 或知识已验证。请使用专属运行目录，不通过生产批次恢复入口恢复这个示范 Run。

成功调用后，`examples/<runId>/` 包含：

- `document.md`：实际角色输出的候选正文；
- `result.json`：固定源码/测试摘要、Run、Result/正文 CAS 引用及独立检查结果；
- `audit.json`：脱敏调用、session/命令关联、实际可取得的 Token 统计。缺失统计保留 null，不写固定的 100/20。

这些是运行产物，不提交到仓库。正文检查失败也保存结果和失败原因；SDK 调用失败可通过专属 runtime 的 Registry 节点事件与 `demo/agent-runs.jsonl` 排查。SIGINT/SIGTERM 会取消当前 DSH 调用，不能把迟到成功记成完成。

## 独立检查与角色修改

角色指令要求生成三个以上的 JSON 数据例子，覆盖相同输入、CRLF 归一化和标题下编辑。检查器将例子交给固定版本的可信实现，比较 hunk 数及 changedSections，并核对源码引用行号范围；它不执行模型生成的脚本。

```bash
npm run example:docgen -- check --document /absolute/path/to/document.md
```

`checks.status=PASS` 只证明这些数据例子与引用范围通过；`semanticReview=REQUIRED` 表示仍须阅读正文，检查签名、行号语义、章节归属、空输入、LCS 阈值与回退描述是否被源码支持。引用行号合法不能证明引用支持该论断。源码复核完成前不能把本轮 DocGen 正文标为通过；复核记录须说明复核者、方法、源码版本与正文摘要，不能将自动检查或 Codex 复核冒充用户审查；该范例始终 `publication=NOT_EVALUATED`。

修改已有指令文件或复制一份到本地，再启动新 Run：

```bash
cp examples/docgen/prompt.txt /tmp/docgen-prompt.txt
# 编辑 /tmp/docgen-prompt.txt，例如要求增加插入/删除行为说明，保留 JSON 例子约束。
npm run example:docgen -- run --prompt-file /tmp/docgen-prompt.txt
```

入口通过现有 promptAddon 更新 DocGen 指令；旧 Run 的 Prompt 快照不会改变。比较两次 Run 的指令摘要、正文和独立检查结果，确认改动生效。不要把这一步当作授权增加工具或改变角色职责。完整业务图也使用相同 `ProjectWorkflowStages` 的 doc_gen 接线；它的回归由 `tests/acceptance/dsh-configured-flow.test.ts` 覆盖。

T104 还要求从本 PR 提交创建第二个独立 worktree，重新 bootstrap（不得共享 node_modules），重跑 prepare、真实 run 和 check，并修改指令再次真实运行。记录两个不同工作区的提交、运行 ID、会话与工件摘要；受控 SSE 回归不能代替这两次 live 调用。

## 提交前验证

```bash
npm run typecheck
npm run validate:specs
node --test tests/integration/docgen-example.test.ts
npm test
npm run evaluate:framework
```

集成测试使用明确标识的本地受控 SSE，验证生产接线、配置冻结、失败/取消和报告关联；live 结果单独记录。具体任务和阶段判定继续维护在 [DEV-019](../../specs/changes/active/DEV-019-dsh-agent-foundation/proposal.md)。
