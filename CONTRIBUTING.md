# 贡献指南

domain-knowledge 以 Spec 驱动。改了行为，就要同时改对应的 Spec、实现、测试和追踪矩阵；只改其中一处，评审者无法判断哪份才是真的。

<details lang="en">
<summary>English summary</summary>

Behavior changes must update the Spec, implementation, tests and traceability matrix together. Keep runtime work in domain-knowledge and submit knowledge content or research to the separate wpKnowledge repository.

</details>

## 开始之前

1. 从最新 `main` 创建分支，一次 PR 处理一个明确问题。
2. 阅读 [Spec 总入口](specs/README.md)和对应 ADR。
3. 使用 Node.js 24+，运行 `npm ci`。
4. 先看 `git status`，不要覆盖别人尚未提交的文件。

## 文件放在哪里

| 内容 | 目录或仓库 |
| --- | --- |
| 领域规则与状态机 | `src/domain/` |
| 用例服务与 Port | `src/application/` |
| LangGraph、Agent、SQLite/CAS、评测器 | `src/infrastructure/` |
| CLI、HTTP、DSH 接口 | `src/interfaces/` |
| 产品规范、ADR、Schema | `specs/` |
| 测试与验收夹具 | `tests/`、`acceptance/` |
| Console 与项目网站 | `web/`、`site/` |
| 知识正文、调研和治理证据 | [`wpKnowledge`](https://github.com/linlisWorkTeam/wpKnowledge) |

不要重新建立 `endlessWpKnowledgeRunner/`、`packages/`、`apps/` 或第二套工作流实现。更完整的规则见[仓库目录说明](docs/REPOSITORY-GUIDE.md)。

## 修改流程

行为或契约变化需要：

1. 在 `specs/` 写清正常路径、失败路径和权限边界；
2. 更新 `specs/13-verification/traceability-matrix.md`；
3. 实现最小闭环，不增加平行 Registry、Gate 或发布路径；
4. 增加对应层级的测试；
5. 同步使用、开发和运维文档。

纯文档也要区分源码证据、运行证据和推断。解释性文字以中文为主，关键入口补相邻 English summary。知识内容不在本仓库落盘，请到 `wpKnowledge` 提 PR。

## 本地验证

```bash
npm run typecheck
npm run validate:specs
npm test
```

固定 commit 的 ohMyWorkPanel 验收依赖本机源码，不是每个贡献者都能运行的通用门禁。没有运行就如实写进 PR，不能用 fixture 结果冒充真实模型质量。

不要提交 `.workpanel/`、`.env.local`、API key、Bearer token、外部 CLI 登录态、数据库或临时验收目录。安全问题请按 [`SECURITY.md`](SECURITY.md) 私下报告。

提交贡献即表示你同意按 [MIT License](LICENSE) 发布该内容。
