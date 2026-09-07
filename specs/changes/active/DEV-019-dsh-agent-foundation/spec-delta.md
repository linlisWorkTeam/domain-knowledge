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

## R0 已核实的接线选择与 R1 进度

CPU 范例选择本仓库 `structuredMarkdownDiff`，参考源码固定到文档提交 `3f999204f988697cc5bb9473c5a10ad5b4fc1f78`，默认示范 DocGen；公开输入为前后两个字符串，输出为 hunks、changedSections、rangeValidation。测试覆盖正常编辑、空/相同输入、CRLF、远距修改、插入/删除、大输入和非法类型；Code 阶段只允许生成该模块路径，参考实现及测试不交给 Code。R2 再交付独立的公开契约材料和 live 命令，当前不伪称已存在通用入口。

锁定 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-sdk-client` 均为 `0.1.2-alpha.4`。SDK 的 `run` 接收 Prompt、session ID 和通知回调，`close` 关闭其运行进程；模型路由、profile、patches、工作目录和环境在启动参数中指定。高层 `run` 未提供逐角色工具白名单参数；细粒度工具限制需继续结合 profile/patches 和实际工作区验证，不能凭接口推定支持。

| 责任 | 本轮核实/实施结果 | 后续验证 |
| --- | --- | --- |
| LangGraph | 业务节点、迭代及恢复；Registry/CAS 持有幂等与结果 | 沿用 checkpoint/发布回归；完整恢复仍按 R4 门槛 |
| DSH | 角色模型/工具会话、通知、进程关闭；SDK 本身不持有业务发布权 | R2 实际模型，R1 补细粒度工具与事件检查 |
| 业务接线 | `ProjectWorkflowStages` 保留命令、校验、工件及确定性阶段；预写输出移出到显式 Infrastructure 夹具 | 无 assets 的双目录场景验证；公共入口通用化仍待完成 |
| 超时/取消/重试 | Adapter 管单次期限和有限 Schema 重试，每次新 session；工作流管业务恢复；迟到输出不能提交为成功 | 现有失败矩阵及新增取消同刻返回、session 错配检查 |
| 配置与旧 Run | 继续采用旧记录保留可读、禁止 Pi 快照跨后端恢复、不自动复制旧秘密的方案；本轮未迁移数据 | T106 补实际 DSH 配置、API/Console 和旧记录回归 |
| 旧 Pi 与固定场景 | 原固定执行器已移除；Pi SDK/配置/默认选择、固定 CLI/API 场景入口仍存在 | T105/T106 迁出全部运行依赖，完成 AC-DSHF-006/007 后才可声称仅依托 DSH |

本轮不改变 HTTP API 或版本化 AgentCommand/AgentResult Schema；更新的是业务阶段实现、测试夹具隔离与 DSH 审计关联。正式规范中未实施的 Pi 配置条款暂保留，不将部分 R1 工作改记为全部完成。

## T102 已实施

KF-SYS-025 与 ADR-011 已同步 DSH 的会话/工具职责及应用业务契约边界。原生 `sdk-minimal` 配置加项目 DSH 插件：编排角色无工具，其余角色只能 `read_material`，输出写入由业务结果处理；权限不依赖提示词。每次 Schema 尝试使用独立 session/home，延续应用 checkpoint 幂等。

锁定 DSH 上游包含 `dsh-llm-pi-ai` → `pi-ai` 模型适配依赖；原生 minimal 路径不加载此适配器。T105 移除的是项目直接依赖及执行的 Pi coding-agent 框架，不能把上游模型适配包的间接存在误报成框架迁出失败或声称锁文件完全无 `pi` 字符串。
