# 单个 Agent 角色定制指南

这份指南写给只想调整某个节点的人。你不需要理解整套 LangGraph，也不需要复制一个 Agent 实现。先在前台为固定角色追加一段提示词，用新的 Run 验证效果；只有职责、输入输出或权限确实不够时，才进入核心合同开发。

<details lang="en">
<summary>English summary</summary>

domain-knowledge exposes seven fixed Agent roles. A trusted operator may append a `promptAddon` of up to 4,000 characters. The add-on can refine wording, emphasis and decision discipline, but it cannot replace the base prompt, role responsibility, graph topology, JSON Schema, tools, workspace visibility, evaluator or publication authority. Changes beyond this boundary are core contract changes and must update the Spec, implementation and tests.

</details>

## 先分清“角色”和“执行后端”

Console 里看到的 Orchestrator、DocGen、DocWorker、TestGen、`code`、Check 和 Review 是七类固定角色。它们描述“这个节点负责什么”，不是七个分别安装的 Agent 产品。

以 `code` 为例：旧设计常把它叫作 `CodeAgent`，当前前台改称“代码生成角色（Code role）”。真实运行时，它和其他角色一样由当前 `AgentProvider` 执行。本项目当前有 DeepSeek Harness SDK 和 Pi Agent 两条 live 路径；后者由管理员在 Console 配置、验证并启用 OpenAI-compatible Provider。这里仍没有另行接入公司 `CodeAgent CLI`。

对应代码：

- 固定角色定义：[`src/infrastructure/workflow/langgraph/agent-definitions.ts`](../src/infrastructure/workflow/langgraph/agent-definitions.ts)
- 节点到角色的映射：[`src/infrastructure/workflow/langgraph/graph.ts`](../src/infrastructure/workflow/langgraph/graph.ts)
- Provider 装配：[`src/interfaces/runner/composition.ts`](../src/interfaces/runner/composition.ts)
- Pi Agent Adapter：[`src/infrastructure/agents/pi-agent/index.ts`](../src/infrastructure/agents/pi-agent/index.ts)
- 角色工作区和证据装配：[`src/application/services/automated-project-workflow.ts`](../src/application/services/automated-project-workflow.ts)

## 允许改什么

当前产品只开放一个字段：`promptAddon`。

它会被追加在固定 `basePrompt` 后面，适合做这些调整：

- 指定中文术语、语气和文档结构；
- 强调某类风险、边界条件或引用格式；
- 要求结论写得更短、更具体，或优先说明适用范围；
- 在不改变输出 Schema 的前提下，约束判断纪律；
- 让 DocGen 在保持事实和引用不变的前提下，减少模板化、宣传式或生硬的 AI 文案。

服务端会去掉首尾空白，长度上限为 4,000 个字符，并拒绝空字符。每次保存都会增加 revision，并写入 `AgentPromptConfigured` 审计事件；事件只记录角色、revision 和长度，不保存 Prompt 正文。

## 不允许从前台改什么

以下内容不是提示词定制：

- `agentId`、节点名称和职责；
- LangGraph 节点、边、并行关系、循环和路由；
- 输入输出 JSON Schema；
- 工具列表、文件可见范围和写入权限；
- `allowedGeneratedPaths`、来源隔离和 Bubblewrap 策略；
- Evaluator 命令、Quality Gate、Publication Gate；
- KnowledgeVersion、GateDecision 或 Publication 的持久化规则。

HTTP 接口只接受形如 `{ "promptAddon": "..." }` 的请求。附带 `tools`、`role`、`inputs`、`outputs` 或其他字段会直接返回 `AGENT_CUSTOMIZATION_DENIED`。这条限制在服务端执行，不依赖浏览器是否隐藏了输入框。

## 选择要调整的角色

| 角色 ID | 适合调整的内容 | 不要要求它做的事 |
|---|---|---|
| `orchestrator` | 计划摘要的重点、风险排序、输出措辞 | 改拓扑、增加节点、决定发布 |
| `doc-worker` | 片段提取格式、引用粒度、未决问题表达 | 跨未分配文件猜测、合并最终知识 |
| `doc-gen` | 中文写作风格、章节组织、术语、人性化表达 | 编造来源、忽略 Correction、直接发布 |
| `test-gen` | 边界用例偏好、oracle 描述、候选命令说明 | 读取候选知识或生成实现 |
| `code` | 实现取舍、可读性、依赖偏好、错误处理风格 | 读取参考实现/门禁测试、扩展允许路径 |
| `check` | 检查重点、严重级别表述、误报纪律 | 修改代码、把工作区缺文件当成失败 |
| `review` | 归因粒度、Correction 判据、证据引用方式 | 推翻实际 Eval 结果、直接改变 Run 状态 |

## 推荐的追加提示词模板

一段有效的 `promptAddon` 不需要重复基础职责。把它写成可观察的增量要求：

```text
本次额外侧重：<希望这个角色多注意什么>。

表达要求：<术语、语言、结构或篇幅>。
证据要求：<哪些结论必须引用输入中的路径、报告或判据>。
禁止事项：<不要猜测、不要扩展范围、不要用哪些模糊措辞>。
验收观察：<完成后我会在输出、EvaluationReport 或 Gate 中核对什么>。
```

不要把密钥、内部 token、未脱敏用户数据或完整生产日志放进提示词。`promptAddon` 会持久化在本地 Registry；虽然 Demo 报告不会导出正文，它仍然不是秘密存储。

## 三个可直接使用的例子

### DocGen：让知识更自然，但不改事实

```text
请用自然、克制的简体中文写作。先说适用范围，再解释行为和边界；保留源码标识符、路径、命令、数值和 provenance，不要为了口语化改写事实。避免“赋能”“革命性”“显著提升”等宣传词，也不要用空泛总结填充篇幅。每个可验证结论都应能回到输入证据。
```

这类定制只影响表达。它不能让 DocGen 隐去来源，也不能把没有证据的内容写成确定事实。知识的人性化应发生在“事实、引用和验收锚点不变”的前提下。

### code：收紧实现风格

```text
优先使用项目已经声明的依赖和公开类型。实现保持短小，显式处理空输入和重复值；不要新增依赖、测试、文档或配置文件。只能返回 trusted context 中 allowedGeneratedPaths 列出的实现路径，无法满足时仍按既定 Schema 返回最小实现，不要自行扩展范围。
```

这段文字不会扩大输出路径。动态 JSON Schema 和应用层白名单仍然生效，模型即使提出额外文件也会被拒绝。

### Review：减少没有证据的阻塞项

```text
EvaluationReport 是测试执行事实源。只有内联候选知识、Check findings 或评测证据里存在可准确指出的矛盾时，才设置 blocking=true。需要迭代时，Correction 必须给出具体 knowledgePath、可复验 criterion 和实际 risk；不要因为只读工作区里没有物化的生成代码而判失败。
```

这能改善 Review 的判断纪律，但不能让 Review 代替 Domain Gate。最终 `PASS / ITERATE / STOPPED` 仍由确定性规则产生。

## 四种操作入口

### 1. 先查看固定合同

```bash
npm run knowledge -- agents
```

输出包含每个角色的职责、固定基础提示词、输入输出、工具以及当前 `promptAddon` 和 revision。

只读 HTTP：

```bash
curl http://127.0.0.1:4174/api/v1/agents
```

### 2. 用 CLI 保存

```bash
npm run knowledge -- set-agent-prompt \
  --agent doc-gen \
  --prompt '先写清适用边界；每个行为结论都要保留来源路径。'
```

CLI 面向本地受信操作员，直接写当前 `WP_FLYWHEEL_HOME` 对应的 Registry。

### 3. 用 HTTP 保存

先用 `WP_KNOWLEDGE_WRITE_TOKEN` 启动 Console，再提交 Bearer token：

```bash
curl -X PUT http://127.0.0.1:4174/api/v1/agents/doc-gen/prompt \
  -H "Authorization: Bearer $WP_KNOWLEDGE_WRITE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"promptAddon":"先写清适用边界；每个行为结论都要保留来源路径。"}'
```

不要把真实 token 写进脚本、文档或 shell 历史。上例只展示环境变量引用。

### 4. 用 Console 保存

打开 `http://127.0.0.1:4174`，进入“Agent 设置”：

1. 展开固定基础提示词，确认角色职责和现有输入输出；
2. 点击“写入凭据”，只在当前页面内存中填写写 token；
3. 在目标角色的“追加提示词”中填写内容；
4. 保存后确认 revision 增加；
5. 启动新的治理批次，在节点输出、EvaluationReport 和 Gate 中核对效果。

## 验证一次定制

不要用“模型看起来听话”作为验收。建议按下面的顺序验证：

1. 记录修改前的角色 ID、revision 和基准 Run；
2. 只改一个角色、一个目标，避免同时变化导致无法归因；
3. 使用相同仓库 commit、相同场景和相同评测命令启动新 Run；
4. 检查对应节点是否使用新的 revision；
5. 对比结构化输出、确定性评测、Gate outcome、耗时和失败类型；
6. 导出 `workflow-report`，确认报告仍不包含提示词正文和凭据；
7. 若效果变差，把 `promptAddon` 清空并再跑一次基准。

清空追加提示词：

```bash
npm run knowledge -- set-agent-prompt --agent doc-gen --prompt ''
```

清空会生成新的 revision，而不是删除审计历史。

Run 启动时会冻结 prompt revision、Provider/模型摘要、工具权限和 Schema URI，并把有效提示词正文作为不可变 CAS Artifact 保存；配置快照只保留摘要和 ArtifactRef。运行中的配置修改只影响新 Run，恢复执行仍读取原 Run 的冻结 Artifact。

## 什么时候必须进入核心开发

出现下面任一情况时，停止在前台反复堆提示词：

- 输入里缺少角色完成职责所必需的业务证据；
- 输出 Schema 无法表达需要的新字段；
- 需要新增工具、读写路径或网络能力；
- 需要增加、删除或重排节点；
- 需要改变 Gate、评测或发布规则；
- 需要接入新的 Agent Provider，而不是调整现有角色语气。

这些变化应按 Spec 驱动流程实施：

1. 在 `specs/01-requirements/` 增加或修改稳定需求 ID；
2. 同步 `specs/05-workflows/`、`specs/06-agents/`、安全边界和验收条件；
3. 修改 `src/application/ports` 的端口或数据结构；
4. 在相对独立的 `src/infrastructure/workflow/langgraph` 中修改图执行逻辑；
5. 在 `src/application/services` 组装新上下文与副作用；
6. 为 Provider 或工作区能力补 Adapter；
7. 增加 contract、integration、security 和 acceptance 测试；
8. 同步 Console、静态官网、快速入门、架构文档和方案 PPT；
9. 在 PR 中附上失败用例、真实运行证据和仍未解决的边界。

## 提交前检查

```bash
npm run typecheck
npm run validate:specs
npm test
npm run site:check
git diff --check
```

重点人工复查：

- 新文字是否把角色名误写成外部 Agent 产品；
- 是否仍由 domain-knowledge 持有 Gate 和发布权；
- 提示词是否可能诱导角色读取未授权来源或扩展输出路径；
- 人性化改写是否保留源码标识、来源、数字、命令和验收事实；
- Demo、PPT、README、Spec 和当前代码是否说的是同一件事。

真实 SDK 运行及失败恢复示例保存在 [wpKnowledge 证据目录](https://github.com/linlisWorkTeam/wpKnowledge/blob/main/knowledge/3.workpanel/%E8%AF%81%E6%8D%AE/2026-09-02-DeepSeek-Harness%E7%9C%9F%E5%AE%9EAgent%E6%B2%BB%E7%90%86%E6%BC%94%E7%A4%BA.md)。
