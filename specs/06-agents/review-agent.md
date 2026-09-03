# 评审类 Agent

## ReviewAgent

- **职责**：在独立只读上下文中把确定性评测失败定位到知识路径，输出 weak spots 与可执行 Correction。
- **输入 Schema**：`agent-command.schema.json` 的 `review` payload：knowledgeRef、evaluationReportRef、criteriaRef、可选 previousCorrectionRefs。
- **输出 Schema**：`agent-result.schema.json` 的 `attribution` payload，包含 `corrections` 与 `unresolvedRisks`；Correction 同时必须匹配 `correction.schema.json`。
- **权限**：可读知识、评测报告、公开接口；不能读参考源码、生成推理历史，不能写任何业务 Artifact 或运行测试。
- **Correction 最小内容**：稳定 correctionId、knowledgePath、可判定 criterion、至少一个 evidenceRef、risk；禁止“改得更好”等不可执行措辞。

ReviewAgent 不选择下一状态。没有证据支持的归因必须进入 `unresolvedRisks`，由确定性门禁在预算规则下决定继续或停止。
