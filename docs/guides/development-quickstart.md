# 新开发者快速指南

本文给第一次参与 domain-knowledge 开发的人一条最短路径，并解释项目为什么以及如何使用 Git worktree。完整规则仍以[开发指南](../DEVELOPMENT.md)和[贡献指南](../../CONTRIBUTING.md)为准。

## 1. 开始前

准备 Node.js 24+、Git 和仓库访问权限，然后阅读：

1. [文档中心](../README.md)：按任务找到 Spec、代码和测试入口；
2. [开发状态](../DEVELOPMENT-STATUS.md)：确认当前任务和未验证边界；
3. `docs/epitaph/` 中时间最新的文件：了解上一位开发者留下的可核验状态。

产品行为以 `specs/` 为准。开始实现前，先确认需求 ID、验收条件和对应追踪矩阵行。

## 2. 为什么使用 worktree

普通分支切换复用同一个工作目录；worktree 可以让多个任务各自在独立目录和分支工作，同时共享同一份 Git 对象库。

```text
同一个仓库
├── /path/to/domain-knowledge          main
├── /tmp/domain-knowledge-dev-010      feat/dev-010
└── /tmp/domain-knowledge-api          feat/new-api

共享：Git 历史和对象
独立：分支、工作文件、暂存区、node_modules、运行数据
```

一个分支同一时间只能被一个 worktree 检出。不要让多个 worktree 共享或符号链接 `node_modules`，也不要在任务之间复用 `.workpanel/` 运行数据。

## 3. 创建任务 worktree

在主工作区执行：

```bash
git fetch origin
git worktree add /tmp/domain-knowledge-dev-xxx -b feat/dev-xxx origin/main
cd /tmp/domain-knowledge-dev-xxx
```

目录名和分支名应表达同一个任务。检查结果：

```bash
git worktree list
git status --short --branch
node --version
```

如果 `node --version` 低于 24，先切换到已安装的 Node 24，再安装依赖。

## 4. 初始化依赖

每个新 worktree 必须执行：

```bash
npm run bootstrap:worktree
```

脚本会：

- 要求 Node.js 24+；
- 根据 lockfile 选择包管理器：`pnpm-lock.yaml` 使用 pnpm，`package-lock.json` 使用 npm；
- pnpm 使用 `--frozen-lockfile`，npm 使用 `npm ci`；
- 复用 pnpm store 或 npm cache，但在当前 worktree 创建独立 `node_modules`；
- 拒绝通过符号链接共享的 `node_modules`；
- 成功后写入 `.workpanel/worktree-bootstrap.json`，状态必须是 `READY`。

开始任务或恢复旧 worktree 时可以先快速检查：

```bash
npm run bootstrap:worktree:check
```

Node 版本、lockfile 摘要、依赖目录或 READY 文件不一致时，检查会返回 `STALE` 或失败；重新执行 `npm run bootstrap:worktree` 即可。

## 5. 开发流程

1. 检查 `git status`，不要覆盖不属于当前任务的修改。
2. 行为或契约变化时，从 `specs/changes/active/DEV-xxx-feature/` 复制一份任务变更包。
3. 先写清提案、Spec 增量和验收，再实现最小闭环。
4. 同步更新实现、测试、追踪矩阵和受影响的使用或运维文档。
5. 不得建立第二套 Registry、Workflow、Gate 或发布路径。

提交前至少运行：

```bash
npm run typecheck
npm run validate:specs
npm test
```

无法执行的 live、外部环境或真实源码验收必须如实记录，不能用 fixture 结果替代。

## 6. 提交并创建 PR

先检查差异只包含当前任务：

```bash
git status --short
git diff --check
git diff
```

然后提交和推送：

```bash
git add <本次任务文件>
git commit -m "<type>: <简洁说明>"
git push -u origin feat/dev-xxx
```

可使用 GitHub CLI 创建 PR：

```bash
gh pr create --base main --head feat/dev-xxx
```

PR 描述应写明变更范围、非目标、验证命令、实际结果和未验证边界。创建远端 PR 是外部可见操作，Agent 只有在任务明确要求时才会执行。

## 7. 同步和清理

开发期间需要同步主线时，在任务 worktree 中执行：

```bash
git fetch origin
git rebase origin/main
```

出现冲突时先确认规范和当前代码语义，不要用强制覆盖解决。PR 合并且工作区干净后，从其他 worktree 执行：

```bash
git worktree remove /tmp/domain-knowledge-dev-xxx
git branch -d feat/dev-xxx
git worktree prune
```

删除前必须确认提交已经推送、PR 已合并或分支仍可恢复；不要清理仍有未提交文件的 worktree。

## 常见错误

| 错误 | 原因与处理 |
| --- | --- |
| `WORKTREE_NODE_UNSUPPORTED` | Node 低于 24；切换版本后重新 bootstrap。 |
| `WORKTREE_NOT_READY` | 尚未初始化；执行 `npm run bootstrap:worktree`。 |
| `WORKTREE_READY_STATE_STALE` | Node、lockfile 或依赖状态变化；重新 bootstrap。 |
| `WORKTREE_NODE_MODULES_SHARED` | `node_modules` 是符号链接；移除链接并在当前 worktree 独立安装。 |
| 分支已被检出 | 同一分支已属于另一个 worktree；使用新分支或进入现有目录。 |
| 路径已存在 | 换一个明确的任务目录，或先核实旧 worktree 是否已经安全清理。 |

## 最短检查清单

- [ ] 从最新 `origin/main` 创建独立分支和 worktree；
- [ ] Node.js 24+，bootstrap 状态为 `READY`；
- [ ] 已阅读对应 Spec、开发状态和最新 epitaph；
- [ ] Spec、实现、测试和追踪矩阵保持一致；
- [ ] TypeScript、Spec 校验和测试通过；
- [ ] PR 写明验证结果和未验证边界；
- [ ] 合并后再安全清理 worktree。
