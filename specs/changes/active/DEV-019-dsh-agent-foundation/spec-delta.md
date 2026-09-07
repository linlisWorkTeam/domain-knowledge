# Spec 增量（Draft）

架构方向已确认，以下记录待实施时合入 baseline 的语义变化。当前 Accepted Spec 与追踪矩阵保留现状，本文件不是已实现能力声明。

## 拟修改

| 规范位置 / 需求 | 当前语义 | 目标增量 |
| --- | --- | --- |
| `01-requirements/system-requirements.md`：KF-SYS-025、031；ADR-006、010、011 | 真实 DSH 通过 AgentProvider 接入，SDK 与业务核心隔离 | DSH 是外部第一版的角色运行框架；节点只保留必要业务接线，不另建通用 Agent 运行器。领域规则和 SDK 隔离继续成立 |
| 同文件：KF-SYS-041；`05-workflows/user-use-cases.md`、`10-interfaces/http-api.md` | 验证模型配置后默认 Pi 执行 | Pi 退出目标路径；DSH 配置和启动契约在 R0 核实、R1 实施并同步正式条款，安全配置与脱敏要求保留 |
| `04-product/frontend-product-design.md`：KF-UI-021、AC-UI-024；`05-workflows/user-use-cases.md`：UC-KF-007；AC-API-010 | 前台配置模型后新任务默认 Pi 执行 | 与 KF-SYS-041 同步迁出 Pi；DSH 配置的用户流程、API 和验收须一起定义，不能沿用 Pi 表单却宣称已接入 DSH |
| `01-requirements/system-requirements.md`：KF-SYS-022；`05-workflows/real-source-acceptance.md`、AC-E2E-002 | ohMyWorkPanel 固定场景承担自动验收 | 公共入口不依赖特定项目执行器；CPU 小模块是首个底座范例，项目路径与测试命令作为任务或验收数据。历史固定场景证据保留其原有范围 |
| `06-agents/README.md` 与各角色规范 | 固定角色定义及业务 Schema | 角色在 DSH 上开发；规范继续描述业务职责、输入输出与权限，不复制 DSH 的会话或工具运行框架 |
| `13-verification/acceptance-plan.md`：AC-E2E-001、002、003 | 固定场景、真实 DSH、发布闭环验收 | 区分底座范例、七角色真实闭环及公司 CLI 验收；底座范例不能替代发布条件 |

## 保持不变

KF-SYS-004 的候选 oracle 验证、006 的证据、010 的恢复幂等、011 的版本化 Schema、017 的真实闭环和确定性发布继续保留。业务层仍定义产物语义，DSH 原始文本需验证后才能成为业务工件；不能把“SDK 运行成功”视为“知识已验证”。

七角色业务分工、Code 源码不可见边界、唯一 Registry/Gate、CAS、运行配置冻结和脱敏要求不变。第一版不需要公司 CodeAgent live 作为前置条件，但现有 CLI Adapter 的真实兼容性仍未证明。

普通 CPU 小模块用于底座范例，不替代 KF-SYS-014 与 AC-LANG-002 的语言能力要求，也不降低第一版业务发布门禁。相关用例、前台、API 和追踪矩阵已加迁移提示，正式条款及实现状态仍保留 baseline，等待具体实施增量。

## R0 核实并直接落实的实施选择

按 [Roadmap](plan.md) 选择具体 CPU 模块，默认以 DocGen 示范；核对锁定 DSH 版本的配置、权限、事件和取消能力，落实任务材料及受影响 API/Schema 增量。旧 Run 默认保留可读，不跨后端静默恢复；旧秘密不自动迁移，DSH 配置重新验证。具体参数与文件布局由实施者在边界内决定并记录，不再等待另一次整体架构确认。

验收新增 AC-DSHF-006（实际依赖迁出）、007（配置与旧 Run）、008（逐角色交付），补足原 001～005 的范围。R1 同步正式配置/依赖条款与对应测试；R2 验收底座，R3 验收七角色，R4 兑现完整闭环及既有适用恢复/权限/语言门槛。新增 AC 当前仍是 Draft，不能据 Roadmap 将实现状态改为完成。

## 合并要求

实现变更须同步受影响的 baseline、ADR、测试和操作文档。Preview API 若变化，按 KF-SYS-032 原子更新生产者与消费者；业务 Schema 是否变化需显式说明，不能静默替换。需求状态按实际证据更新，旧 ID 不复用，新 AC 与需求绑定后再进入正式追踪矩阵。
