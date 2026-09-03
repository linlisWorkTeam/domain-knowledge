# 语言插件契约

核心通过 `LanguagePlugin` 端口调用语言能力：

```text
describe() -> LanguageCapability
discover(ArtifactRef, DiscoveryPolicy) -> DiscoveryResult
build(ArtifactRef[], BuildPolicy) -> ExecutionPlan
test(ArtifactRef, ArtifactRef, TestPolicy) -> ExecutionPlan
normalize(ExecutionResult) -> Diagnostic[] + TestSummary
```

所有参数和结果使用 `language-plugin.schema.json`、ArtifactRef 与通用执行类型。`LanguageId` 使用小写 IANA 风格标识（如 `cpp`），核心不得根据其值分支；能力协商字段为 `discovery/build/test/coverage/mutation` 与插件版本。

插件必须声明工具链摘要、输入媒体类型、资源需求、网络需求（P0 必须为 false）和诊断映射。未知能力返回 `UNSUPPORTED_CAPABILITY`。插件不得访问 Agent 凭据、KnowledgeStore 或 checkpoint，也不得把 AST、编译器对象、文件描述符放入结果。
