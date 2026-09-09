<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：知识角色升级后受控夹具与回归用例的第二批交接。
-->
# 受控角色夹具适配

目标：保持现有回归业务断言，适配新知识角色输出和两阶段调用，不新增真实模型预算。

已改：ProjectWorkflowFixture 按 ModelRequest.stage 产生 DocGen 概要或正文，Orchestrator 产生完整固定 tasks，DocWorker 从命令 sourceRefs 的已存原文构造可匹配行号的受控事实；缺原文直接失败，不读取可变参考工作树补齐。AutomatedLanggraphFlow 的 Correction 使用完整知识路径和精确 H2。受控 DSH 用例适配概要/正文两个独立调用，原角色覆盖、会话隔离、固定源码和发布断言保留。AgentExamples 使用共享 ROLE_EXECUTION_VERSION，并增加首轮概要/正文工件独立持久化及 rawOutputRef 绑定断言。

已验证：非 DSH 的 AgentExamples 与 AgentContracts 共 13 项通过（8.71 秒），新增首轮 DocGen 工件测试单独通过（2.23 秒），类型检查通过，均为单进程低内存执行。随后追加 rawOutputRef 绑定断言依赖主 Agent 的 6f30160；此断言尚未在本工作树执行，主分支合并后必须复跑，不能把前述通过记录当作它的证据。

交接：本批不修改 Application 工作流或 Composition。完整 Fixture 工作流等待主 Agent 的 sourceContentRefs 与验证组 evaluator 接线；DSH 原生测试留给主 Agent 串行窗口，当前未运行。旧非 moduleContract 夹具保留 legacy candidateCommands 输出，仅测试历史场景；module-cases-v1 MVP 门禁验收需要专用场景。已提醒主 Agent 在分块命令中按 assignedSourcePaths 过滤 sourceContentRefs，避免全量原文通过 Prompt 泄漏给其他分区。
