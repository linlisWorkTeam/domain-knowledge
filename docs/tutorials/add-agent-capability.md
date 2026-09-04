# 教程：新增或调整 Agent 能力

## 先判断范围

如果只是调整表达方式，优先使用已有角色的 `promptAddon`；职责、输入输出、拓扑或工具权限变化属于契约变更。

## 契约变更步骤

1. 更新 `specs/06-agents/` 中的角色和行为规范。
2. 更新 `specs/schemas/` 中的输入输出 Schema。
3. 更新 `src/infrastructure/workflow/langgraph/agent-definitions.ts` 和相关节点。
4. 让结果经过 Schema 校验后再进入 Domain/Application 流程。
5. 增加 Agent contract、integration 和适用的 acceptance 测试。
6. 更新追踪矩阵、开发状态和相关操作文档。

## 不允许绕过的边界

- Agent 不直接决定 `VERIFIED`；
- 前台不改变 Agent 职责或拓扑；
- 不建立第二套 Workflow 或 Registry；
- 不把大对象直接塞入跨节点状态；
- 不把 Prompt 或凭据放入命令行参数。

## 验证

```bash
npm run typecheck
npm run validate:specs
npm test
npm run evaluate:framework
```
