# 编排类 Agent

## OrchestratorAgent

- **职责**：把需求拆为模块、声明资源、委派任务、汇总结构化结果；并行度不超过策略上限（V1 最大 5）。
- **非职责**：不写知识/实现/测试，不给质量打分，不决定 pass/iterate/stopped。
- **输入 Schema**：`schemas/agent-command.schema.json`，`agentType=orchestrator`，payload 含 policyRef、moduleRefs、latestReportRef（可选）。
- **输出 Schema**：`schemas/agent-result.schema.json`，payload 为 `plan`：节点、依赖、resourceClaims、artifactExpectations。
- **权限**：见数据边界矩阵；仅能读取元数据与报告，创建调度命令，不能读取源码正文或写发布区。
- **失败**：无环 DAG、资源声明或 Schema 不合法即拒绝；部分 worker 失败只汇总事实，由确定性工作流分类。

不变量：调度输出中的每个节点必须有稳定 nodeId、幂等键素材、输入/输出 Schema URI 和非空资源声明。
