## 动机与范围

<!-- 为什么需要这项改动？关联 Issue、KF-SYS、UC、ADR 或研究证据。 -->

## 实现摘要

<!-- 描述行为和架构变化；不要把无关修改混入同一 PR。 -->

## Spec 与兼容性

- [ ] 已更新或确认无需更新相关 Spec、用例和追踪矩阵。
- [ ] 没有引入第二套 Registry、状态机、Gate 或发布路径。
- [ ] 数据格式、CLI、HTTP API 和旧 Runner 兼容性已说明。
- [ ] 没有恢复 `endlessWpKnowledgeRunner/`、`apps/`、`packages/` 或第二套工作流实现。

## 安全与证据

- [ ] 评测证据仍由独立评测器产生，Agent 不能自行批准发布。
- [ ] 未提交密钥、token、数据库、`.workpanel/` 数据、登录态或构建产物。
- [ ] 受信源码验收没有被表述为敌对代码沙箱或 live-model 质量证明。

## 验证

<!-- 保留实际执行项；未运行的命令写明原因。 -->

- [ ] `npm run typecheck`
- [ ] `npm run validate:specs`
- [ ] `npm test`
- [ ] 其他：

## 文档与限制

- [ ] 用户可见行为、开发方式或运维方式已同步到对应文档。
- [ ] 文档以中文为主；关键入口已按 I18n 约定同步 English summary。
- [ ] 已列出未验证内容和已知限制；没有则写“无”。
