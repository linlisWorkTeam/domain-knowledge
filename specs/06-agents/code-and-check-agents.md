# 代码与检查类 Agent

## CodeAgent

- **职责**：仅根据候选知识和公开接口，在 fresh session 中生成可构建实现。
- **输入 Schema**：`agent-command.schema.json` 的 `codegen` payload：knowledgeRef、publicInterfaceRefs、languageId、buildContractRef。
- **输出 Schema**：`agent-result.schema.json` 的 `codeArtifact` payload，至少包含 `codeRef`，可附 `buildManifestRef`。
- **禁止**：读取参考源码、探针、候选/门禁测试、旧轮实现和生成者推理历史；不得运行门禁或自称通过。
- **固定 ohMyWorkPanel Adapter**：当前自动验收桥接层把候选知识作为 CAS 正文、公开接口作为角色工作区文件传入，要求输出闭合的 `{ files: [{ path, content }] }`。运行时会把 `path` 的 JSON Schema 动态收紧到场景 `allowedGeneratedPaths`，并拒绝重复路径；桥接格式不能被前台 `promptAddon` 修改。

## CheckAgent

- **职责**：在全新只读上下文中检查实现 diff 的语义、边界和知识一致性，输出发现清单，不评分。
- **输入 Schema**：统一命令的 `check` payload：diffRef、criteriaRef、publicInterfaceRefs。
- **输出 Schema**：统一结果的 `findings` payload，每项含 findingId、severity、criterionId、evidenceLocation、message。
- **限制**：发现不直接决定门禁；不能写实现、知识或测试。

二者必须使用不同 sessionId，且权限令牌不可转交。当前 SDK Adapter 每次节点尝试都创建新的 DSH session；业务幂等由 GenerationKey、Checkpoint 和 CAS 保证，不依赖复用模型会话。
