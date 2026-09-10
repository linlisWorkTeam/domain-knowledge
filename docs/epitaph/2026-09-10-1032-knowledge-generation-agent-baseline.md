<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接知识库生成 Agent 分支基线与数据流调研。
-->
# 知识库生成 Agent：基线与数据流

用户要求复用已有 worktree，新建知识库生成 Agent 开发分支，先调研当前数据流。本次复用 /tmp/domain-knowledge-agent-guide，从隔壁 /root/projects/domain-knowledge 的已提交 main@96d277b 新建 feat/knowledge-generation-agent。隔壁未提交的进度文档已阅读但未带入；domain-knowledge-wxc 的在途改动保持原状。没有 cherry-pick 额外提交，没有修改业务实现。

Node 24.13.0 下 npm run bootstrap:worktree 已完成 READY，依赖为本 worktree 独立安装。调研依据为当前源码和 docs/specs/domainFunction/agents/Agents.md；未运行真实模型或端到端验收。

生产链路：Scenario 显式指定模块、源码路径、接口路径和测试命令；TrustedProjectEvaluator.inspect 固定 Git commit 并保存摘要 manifest。Orchestrator 的任务拓扑固定，Worker 按路径下标分配文件，DocGen 汇总片段与源码，生成 body/title/description。Application RoleExecution 保存 CAS 工件与结果信封；candidate_knowledge 保存候选版本并检查质量。之后 Code 重建、Check、可信评测、Review、Gate，PASS 才发布。质量反馈或 Review correction 连同上一轮正文进入下一轮 DocGen。

边界：单次工作流围绕一个 moduleId；尚无生产链路中的自主全仓模块发现。Worker 与 TestGen 的 generationKey 使用 stable-source，可复用已提交结果。TestGen 候选命令未进入实际 oracle；实际评测使用 Scenario 命令。Review 输入尚未绑定 Check findings 明细。DocWorker 和 DocGen 的 unresolvedRisks 在此基线中固定为空，不能把另一条 MVP 分支的风险生命周期现状套用到本分支。

推荐下一次先明确知识库生成范围：单模块正文的生成质量，还是全仓模块识别、任务拆分与多文档组织。再更新现有 Agents 设计并实现；本次调研不代表生成能力已验收。按当前用户指示保留所有旧墓志铭，新增本记录不覆盖历史。
