# 真实源码验收工作流

## 目的

合成 `EvaluationReport` 只能验证发布约束，不能证明系统会执行真实软件门禁。PR 合入前必须用 ohMyWorkPanel 的固定 Git commit 运行一次独立、可重放的薄切片，覆盖失败、归因、增量修订、fresh 生成、真实执行和发布。

## 固定输入

- 参考仓库必须是 Git 工作区；报告分别记录 remote、绝对本地路径、当前 checkout HEAD、被验收的固定 commit 与脏状态。
- 验收从 `git archive <fixed-commit>` 得到仓库外快照，不要求当前分支退回旧 commit，不修改参考工作区，也不继承未跟踪文件。
- Node 依赖安装使用固定锁文件、已安装的固定 pnpm 运行时与内容寻址缓存离线完成，避免把 registry 的可用性或可变元数据混入行为判据；缓存不完整时必须在准备阶段明确失败。
- 模块薄切片使用 `src/chat/mentions.ts`、公开 `Member` 契约和仓库自己的 `src/chat/mentions.test.ts`。
- Agent 输出使用版本化 Schema 校验后才进入 CAS；可复验场景允许确定性 Scenario Provider，报告必须明确它不是在线 GLM 质量证明。
- 真实 Provider 演示使用 `WP_FLYWHEEL_AGENT_PROVIDER=deepseek-harness`，通过官方 SDK、角色工作区与 Bubblewrap 运行；旧 Headless 入口只作迁移对照，两条路径的完整 Prompt 都只能通过标准输入传输，不得进入进程参数。质量不合格的候选先反馈给下一轮 DocGen 并跳过 CodeAgent；Schema/进程错误可在同一 `runId/thread_id` 上从失败 task checkpoint 恢复。

## 两轮闭环

`runRealSourceFlow` 是固定两轮、要求首轮失败并产出纠正意见的验收基线，不是生产编排入口；生产运行统一进入 `AutomatedProjectWorkflowService` 与 LangGraph。两者复用领域门禁、内容寻址存储、评测器和发布事务，但验收基线故意要求非空 `correction`，生产复核在无需修订时允许 `correction: null`。新增运行能力不得复制到验收基线，除非本规范同时增加相应验收语义。

1. 在未改动快照执行模块参考门禁，失败则停止，避免把坏基线升级为 oracle。
2. DocGen 生成第一版知识，CodeAgent 只接收知识与公开接口，在 fresh 副本写入第一版实现。
3. 独立 EvalRunner 以 `shell=false` 和固定 argv 执行真实模块测试。预期第一版失败，并把退出码及有界 stdout/stderr 保存为不可变证据。
4. ReviewAgent 只读取知识、评测报告和判据，生成定位到知识路径的 Correction；DocGen 仅修订受影响的 Markdown 二级章节，应用层逐字比较其余章节并拒绝越界改动。
5. CodeAgent 在另一个 fresh 副本生成第二版；不得读取第一轮实现或参考实现。
6. EvalRunner 依次执行 `pnpm test`、`pnpm build` 与 `cargo test --no-default-features --lib`。全部命令退出码为零、无超时且证据完整时，Gate 才能 PASS。
7. Run 必须先进入 REVIEWING，再由确定性 Gate 进入 PUBLISHING；原子发布只验证第二版，重复发布返回同一 receipt。

自动化整合验收使用 `src/infrastructure/workflow/langgraph` 的真实 StateGraph 执行同一多轮语义，并要求七个 Agent 均留下节点投影。LangGraph 的 `pass` 路由只调度 publication 阶段，最终 `VERIFIED` 和 receipt 仍由 Knowledge Publication Gate 与 Registry 事务产生。2026-09-02 的 live 样例保存在 [wpKnowledge](https://github.com/linlisWorkTeam/wpKnowledge/blob/main/knowledge/3.workpanel/%E8%AF%81%E6%8D%AE/2026-09-02-DeepSeek-Harness%E7%9C%9F%E5%AE%9EAgent%E6%B2%BB%E7%90%86%E6%BC%94%E7%A4%BA.md)。

场景中的每条命令必须声明为 `setup`、`test` 或 `check`。只有 `test` 命令可以贡献测试计数；其输出必须能解析出大于零的真实测试总数，否则即使退出码为零也不得形成 PASS 证据。构建、语法检查和空输出命令不得伪造测试通过数。

## 信任边界

ohMyWorkPanel 是同组织的受信源码。Agent Adapter 通过 SDK stdin、角色工作区、Bubblewrap、wall time、输出上限和取消约束模型进程；ProjectEvaluator 另外负责固定 argv、禁用 shell、临时工作区与进程树终止。评测子进程不得继承真实用户的 `HOME`、`USERPROFILE`、`APPDATA`、`LOCALAPPDATA`、`TEMP`、`TMP` 或语言包管理器主目录；这些目录必须指向本次评测的临时隔离根。两者不能合并解释为敌对代码沙箱。任一来源不受信、命令不在场景 allowlist、路径逃逸、符号链接写目标或资源能力不足时必须拒绝执行；敌对 C++ 仍由 `AC-LANG-002` 单独验收。

## 完成证据

验收报告至少包含：runId、两版 knowledge version、Correction、参考/失败/最终门禁结果、工具链版本、每条 argv、工作区摘要、CAS ArtifactRef、GateDecision、publication receipt、事件序列、LangGraph 节点投影、执行日期与证据边界。人工验收报告保存到 wpKnowledge 的 `knowledge/3.workpanel/证据/`，自动化测试使用本仓库的最小 fixture 验证同一编排语义。
