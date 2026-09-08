<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明数据边界与权限矩阵。
-->
# 数据边界与权限矩阵

动作缩写：`R` 读、`W` 创建新 Artifact、`X` 隔离执行、`P` 发布、`-` 拒绝。表中未出现的主体、资源或动作一律拒绝。

| 主体 | 参考源码 | 候选知识 | 公开接口 | 候选测试/oracle | 门禁测试 | Code 工作区 | 评测报告 | 发布知识 | Checkpoint/事件 |
|---|---|---|---|---|---|---|---|---|---|
| OrchestratorAgent | - | 元数据R | 元数据R | 元数据R | - | - | R | - | 仅命令W |
| DocGen/Worker | R(授权范围) | W / base R | R | - | - | - | R(仅Correction证据) | - | - |
| TestGenAgent | R | - | R | W | - | - | - | - | - |
| CodeAgent | - | R | R | - | - | W | - | - | - |
| CheckAgent | - | R | R | - | - | R(diff) | - | - | - |
| ReviewAgent | - | R | R | - | - | - | R | - | - |
| SearchAgent（待实现） | - | - | - | - | - | - | - | R（仅当前 VERIFIED 正文及授权元数据） | - |
| EvalRunner | R(oracle验证) | R | R | R | R | R/X | W | - | 事件W |
| Workflow Service | 元数据R | 元数据R | 元数据R | 元数据R | 元数据R | 元数据R | 元数据R | - | R/W |
| Knowledge Publisher | - | R | - | - | - | - | R | P | 事件W |
| Human Governor | 按仓库ACL R | R/W新版本 | R | R | 仅受控R | - | R | 通过门禁后请求P | 审计R |

## 数据级别

SearchAgent 由 Application 直接调用，其权限以独立请求 ID、主体、资源摘要、动作和有效期绑定，不伪造治理 runId。受信读取服务先核验当前 `VERIFIED`、发布回执、访问范围与正文摘要，再提供材料；发布元数据核验不授予 Agent 读取评测正文的权限。provenance 仅提供可追溯引用，不授予参考源码、测试或未发布历史正文的读取权限。SearchAgent 无发布、反馈写入或工作流调度工具；用户反馈走独立 Application 用例。

`SOURCE_RESTRICTED`（源码/门禁测试）、`CANDIDATE`, `INTERNAL`, `PUBLISHED`, `SECRET`。密钥仅由 Provider/Sandbox Adapter 在调用瞬间取得，不成为 Artifact。日志只记摘要和引用；stdout/stderr 先脱敏并受大小限制。飞轮调用的授权令牌绑定 runId、主体、资源摘要、动作、过期时间，不可跨 Agent/session 转移；独立检索按上文绑定请求 ID。

## 当前执行边界

- `LocalAgentWorkspace` 从场景允许的来源根复制逐文件白名单，拒绝绝对路径、`..`、越界真实路径和源码符号链接。每个节点得到带文件摘要的不可变视图。
- DocWorker、DocGen、TestGen 可以看到场景列明的来源与公开接口；Code、Check、Review 只挂载公开接口。候选知识、生成代码和评测证据按上表从 CAS 注入 Prompt，不会顺手把完整 Registry 或参考仓库暴露给 Agent。
- `DeepSeekHarnessSdkAgent` 在 Linux 默认通过 Bubblewrap 启动。mount namespace 只包含角色视图、Node/DSH 运行依赖、可信 Provider patch 和该节点自己的 DSH_HOME；参考仓库不挂载，Prompt 经 stdin JSON-RPC 传输。
- 这层隔离负责“模型看得见什么”。`TrustedProjectEvaluator` 执行生成代码时仍共享宿主机内核，只允许受信项目；敌对代码执行、CPU/内存硬限额和断网由独立 Sandbox 能力验收，不能拿 Agent 隔离测试代替。
- OS 拒绝读取参考路径已由安全测试覆盖，但完整的 `AccessDenied` 业务事件尚未覆盖所有 Harness 工具调用，因此 `KF-SYS-003` 在追踪矩阵中保持 `Partial`。
