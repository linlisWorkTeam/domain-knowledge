# 测试生产类 Agent

## TestGenAgent

- **职责**：读取参考源码和公开接口，先提取前置/后置条件，再产生候选行为测试与 oracle 探针。
- **输入 Schema**：`agent-command.schema.json` 的 `testgen` payload：moduleId、sourceSnapshotRef、publicInterfaceRefs、languageId、testPolicyRef。
- **输出 Schema**：`agent-result.schema.json` 的 `testCandidates` payload：`candidateSetRef`、`caseManifestRef`、`oracleClaims`。
- **权限隔离**：可读参考源码，不能读候选知识、CodeAgent 工件或发布区；只能写候选测试区。
- **硬规则**：`expected` 只有在 EvalRunner 对参考实现执行并生成 `oracleVerificationRef` 后才成为 Core/Candidate Gate Test；Agent 声明本身不是 oracle。

不支持的语言能力返回 `UNSUPPORTED_CAPABILITY`，不得输出猜测期望值作为降级。
