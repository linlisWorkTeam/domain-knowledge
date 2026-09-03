# ADR-007：按领域驱动设计收敛源码目录

- 状态：Accepted
- 日期：2026-09-02
- 决策范围：Knowledge Flywheel 源码布局与依赖方向

## 背景

组件此前同时使用 `apps/`、`packages/` 和 `infrastructure/` 三个源码根。应用服务、端口、领域模型和适配器虽然已经遵循六边形架构，但目录把部署形态、包边界和技术实现混在一起，阅读者无法从路径直接判断代码职责，也容易出现跨层相对导入。

技术架构已经把系统定义为领域层、应用层、基础设施层和交互层。源码目录必须表达同一套边界，避免规范与实现各说一套。

## 决策

所有运行时代码收敛到 `src/`，使用四层结构：

```text
src/
├── domain/                 # 聚合、值对象、状态机与确定性领域规则
├── application/
│   ├── ports/              # 入站和出站端口契约
│   └── services/           # 用例、工作流控制与质量策略
├── infrastructure/         # 端口的技术实现
│   ├── agents/
│   ├── evaluation/
│   ├── migration/
│   ├── persistence/
│   ├── source-scan/
│   └── workflow/
└── interfaces/             # 命令行、服务接口和外部适配入口
    ├── runner/
    └── dsh/
```

依赖只能指向内层：交互层和基础设施层可以依赖应用层；应用层可以依赖领域层；领域层不得依赖应用层、基础设施层或交互层。基础设施实现不得成为领域事实源，运行、知识、评测和发布状态仍由领域模型与应用服务管理。

旧的 `apps/`、`packages/` 和顶层 `infrastructure/` 目录不保留兼容副本。命令入口通过 `package.json` 和根兼容脚本指向新路径，防止两套源码继续演化。

## 结果

- 路径直接表达业务职责，代码评审可以用目录边界检查依赖方向。
- 工作流、评测器、持久化和智能体实现都位于基础设施层，但通过应用端口接入。
- 命令行、网页服务和外部适配器归入交互层，不能直接拥有领域状态。
- 大规模移动会产生一次性路径变更；文档、测试、脚本和追踪矩阵必须在同一变更中更新。

## 验证

- `tests/contract/component-layout.test.ts` 检查新目录存在，并拒绝旧源码根重新出现。
- `tests/contract/architecture.test.ts` 检查领域层和应用层的依赖方向。
- `npm run typecheck`、`npm test` 和真实源码验收共同证明移动没有改变运行行为。

<details lang="en">
<summary>English summary</summary>

All runtime code is consolidated under `src/` and organized into domain, application, infrastructure, and interfaces layers. Dependency checks enforce inward dependencies, while legacy source roots are removed to prevent parallel implementations.

</details>
