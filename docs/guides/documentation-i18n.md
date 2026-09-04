# 文档语言与 I18n 约定

本文是按需查阅的文档编写指南，不属于项目入门必读内容。

domain-knowledge 的主要使用者和贡献者使用中文，因此仓库文档默认用中文说明问题。英文不是被删除，而是放在真正有跨语言价值的位置：项目摘要、架构边界、快速启动、安全限制和贡献入口。

<details lang="en">
<summary>English summary</summary>

Chinese is the default documentation language. Keep code identifiers, API paths, schema fields and protocol values unchanged. Key entry documents provide a short English summary next to the Chinese source text; do not maintain a second, drifting full-document tree unless a release process can verify both versions.

</details>

## 写作规则

1. 标题、解释性正文、操作说明、失败原因和图中说明以中文为主。
2. 类名、函数名、命令、路径、环境变量、JSON 字段、HTTP 路径和状态值保持源码中的英文拼写。
3. 第一次出现不熟悉的术语时使用“中文名称（English term）”，后文选一种稳定写法，不循环换词。
4. 不逐句中英对照。关键入口用相邻的 `<details lang="en">` English summary，中文正文仍是唯一需要完整维护的版本。
5. 路线图必须标明“已实现”“Demo”或“计划中”，英文摘要不能扩大中文正文的能力声明。
6. 机器日志、schema 示例和代码块可以保留英文，但文件要有中文标题或中文说明，交代用途与事实源边界。

## 哪些内容需要双语摘要

- 仓库目标与五分钟启动路径；
- domain-knowledge 与 `wpKnowledge` 的职责边界；
- Gate、发布权威和安全限制；
- 贡献流程与文档维护规则；
- 对外 Adapter 的用途、权限和配置方式。

English summary 只保留决策所需信息，通常控制在一到三段。完整命令和细节回到中文正文，避免双份文档长期漂移。

## 关键术语

| 中文主写法 | 代码或英文写法 | 使用说明 |
| --- | --- | --- |
| 知识飞轮 | Knowledge Flywheel | 产品概念；品牌语境可保留英文 |
| 候选知识 | `CANDIDATE` | 未经行为发布 Gate 放行 |
| 已验证知识 | `VERIFIED` | 只能由 Publication 事务产生 |
| 工件 | Artifact | CAS 中按 SHA-256 寻址的不可变内容 |
| 评测报告 | `EvaluationReport` | 绑定输入、证据与工具链指纹 |
| 发布门禁 | publication Gate | 决定知识能否发布，不等同于工作流路由 |
| 工作流路由 | workflow route | LangGraph 的执行控制结果 |
| 检查点 | checkpoint | 首次出现可写“检查点（checkpoint）”，代码语境保留英文 |
| 追加提示词 | `promptAddon` | 唯一允许在前台修改的 Agent 配置 |

## 文件与链接

- 不建立与中文目录镜像的整套 `docs/en/`，除非 CI 能校验内容同步。
- 中文文件名可直接使用 UTF-8；会被命令或外部工具频繁引用的工程文档继续使用稳定英文文件名。
- 翻译标题时，如已有外部锚点，保留显式 HTML `id`，避免旧链接失效。
- PR 修改行为、接口或前台文字时，要同时检查 Spec、工程文档、网站、Console 和演示材料。

## 提交前检查

```bash
npm run typecheck
npm run validate:specs
npm test
```

`component-layout` 契约测试会扫描 Git 已跟踪的 Markdown：每个文档必须有中文说明；关键入口还必须带结构化 English summary。代码块和标识符保留英文不算违规。
