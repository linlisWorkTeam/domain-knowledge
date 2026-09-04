# Knowledge Flywheel 文档中心

本目录存放 domain-knowledge 的非规范性工程指南。产品行为、权限、状态机和验收条件以 [`../specs/`](../specs/README.md) 为规范性事实源；工程文档负责说明如何理解、运行、修改和维护当前实现。

## 按任务查找

第一次接触项目请先阅读[从这里开始](START-HERE.md)。它提供 5 分钟运行路径、按任务定位代码和测试的入口。

| 任务 | 文档 | 适合谁 |
| --- | --- | --- |
| 查看当前开发进度、下一任务和后续队列 | [DEVELOPMENT-STATUS.md](DEVELOPMENT-STATUS.md) | 负责人、贡献者、评审者 |
| 第一次安装、初始化和打开 Console；或把完整配置 Prompt 交给 Agent | [GETTING_STARTED.md](GETTING_STARTED.md) | 使用者、Agent、评审者 |
| 理解治理上层、domain-knowledge/LangGraph 基础设施和知识生命周期 | [ARCHITECTURE.md](ARCHITECTURE.md) | 开发者、架构师 |
| 搭建开发环境和实现变更 | [DEVELOPMENT.md](DEVELOPMENT.md) | 贡献者、Agent |
| 只调整某个 Agent 角色，或判断是否必须改核心合同 | [AGENT-CUSTOMIZATION.md](AGENT-CUSTOMIZATION.md) | Agent 定制者、节点开发者、评审者 |
| 选择测试层级和提交证据 | [TESTING.md](TESTING.md) | 贡献者、评审者 |
| 汇报当前 LangGraph 框架机制与未测边界 | [框架阶段性测评](report/框架阶段性测评.md) | 汇报者、架构评审者 |
| 确定目录和文件归属 | [REPOSITORY-GUIDE.md](REPOSITORY-GUIDE.md) | 所有贡献者 |
| 编写中文主文档与英文摘要 | [DOCUMENTATION-I18N.md](DOCUMENTATION-I18N.md) | 所有贡献者、Agent |
| 摄取、评测、发布、验收和部署 | [OPERATIONS.md](OPERATIONS.md) | 操作员、维护者 |
| 查看真实 SDK 运行、失败恢复和脱敏证据 | [DeepSeek Harness 治理演示](https://github.com/linlisWorkTeam/wpKnowledge/blob/main/knowledge/3.workpanel/%E8%AF%81%E6%8D%AE/2026-09-02-DeepSeek-Harness%E7%9C%9F%E5%AE%9EAgent%E6%B2%BB%E7%90%86%E6%BC%94%E7%A4%BA.md) | 使用者、评审者、演示者 |
| 用幻灯片了解架构、流程和 Agent 边界 | [当前 wpKnowledge 知识飞轮方案](https://github.com/linlisWorkTeam/wpKnowledge/blob/main/knowledge/2.wiki/%E8%AE%BE%E8%AE%A1/%E5%BD%93%E5%89%8DwpKnowledge%E7%9F%A5%E8%AF%86%E9%A3%9E%E8%BD%AE%E6%96%B9%E6%A1%88.pptx) | 使用者、开发者、汇报者 |
| 从旧 Runner 迁移 | [MIGRATION.md](MIGRATION.md) | 旧版本使用者 |
| 了解跨仓库拆分 | [REPOSITORY-MIGRATION.md](REPOSITORY-MIGRATION.md) | 维护者、评审者 |
| 本地预览或发布项目官网 | [site/README.md](../site/README.md) | 维护者 |

## 开发教程与图示

- [系统总览图](diagrams/system-overview.md)
- [知识生命周期图](diagrams/knowledge-lifecycle.md)
- [开发变更链路图](diagrams/development-change-flow.md)
- [新增 HTTP API](tutorials/add-http-endpoint.md)
- [新增或调整 Agent 能力](tutorials/add-agent-capability.md)

## 按角色阅读

- **使用者**：快速上手 → 用户用例 → 运维手册的 Dashboard/API 部分。
- **贡献者**：根目录贡献指南 → 开发指南 → 测试策略 → 对应 Spec。
- **架构评审者**：Spec 总入口 → 架构说明 → ADR → 追踪矩阵。
- **操作员**：安全策略 → 运维手册 → 数据边界 Spec。

相关入口：

- [仓库首页](../README.md)
- [贡献指南](../CONTRIBUTING.md)
- [安全策略](../SECURITY.md)
- [组件首页](../README.md)
- [Spec 总入口](../specs/README.md)

## 文档维护规则

1. 文档只描述当前可证明行为；路线或假设必须明确标记。共性规则集中见[工程治理原则](GOVERNANCE-PRINCIPLES.md)。
2. 项目级进度只在 [DEVELOPMENT-STATUS.md](DEVELOPMENT-STATUS.md) 维护；需求级状态只在追踪矩阵维护，进度变化必须在同一 PR 回写。
3. 行为变化先更新 Spec，再同步本目录的操作说明。
4. 命令必须从仓库根目录可执行，并注明额外前提。
5. 相对链接必须通过 `component-layout` 契约测试。
6. 不在仓库根目录创建第二个 `docs/`；组件相关文档全部留在本目录。
7. 解释性文字以中文为主；关键入口按 [I18n 约定](DOCUMENTATION-I18N.md)提供 English summary。
