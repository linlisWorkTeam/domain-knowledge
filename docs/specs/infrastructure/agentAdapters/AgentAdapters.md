<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：模型与角色运行适配设计。
-->
# 模型与角色运行适配设计

代码位置：[src/infrastructure/agentAdapters/ModelExecution.ts](../../../../src/infrastructure/agentAdapters/ModelExecution.ts)、[src/infrastructure/agentAdapters/deepSeekHarness/DeepSeekHarnessSdkAgent.ts](../../../../src/infrastructure/agentAdapters/deepSeekHarness/DeepSeekHarnessSdkAgent.ts)、[src/infrastructure/agentAdapters/deepSeekHarness/ConfiguredProvider.ts](../../../../src/infrastructure/agentAdapters/deepSeekHarness/ConfiguredProvider.ts)、[src/infrastructure/agentAdapters/companyCodeAgent/CompanyCodeAgentCliAdapter.ts](../../../../src/infrastructure/agentAdapters/companyCodeAgent/CompanyCodeAgentCliAdapter.ts)。


## Domain Port 到运行时

modelExecutionFactory 为每个角色绑定 ModelExecutionPort。输入包括 Prompt、输出 Schema、授权工具和可读路径，Adapter 准备 Workspace，映射 AgentProvider 请求、会话和模型配置。JsonSchemaAgentContractValidator 校验公共命令/结果，DSH 负责授权工具自主调用，Domain 仍控制角色阶段。

## Provider 与运行策略

DSH 原生 SDK 是默认接入后端，Adapter 负责输出提取、闭合 Schema 校验、网络/格式修复重试、超时、取消和调用摘要。角色层不再重复网络重试。模型正常返回仍须检查取消，防止迟到输出提交。受控场景模型注入同一入口，不能通过继承覆盖业务步骤。

ConfiguredProvider 解析已验证设置或环境配置。Console 已保存但未启用/未验证的配置阻止新 Run，不静默回退；已有 Run 使用冻结配置。OpenCode Go 根据非秘密参数生成运行目录补丁，补丁只记录密钥环境变量名。配置方式见 Runtime 指南。

模型转发请求使用产品 User-Agent，并在 x-opencode-session 头中传递原生 DSH 会话标识。会话启动回调在首次请求前绑定标识，工具往返保持稳定，格式重试使用新会话；不能将整次飞轮或不同角色共用一个会话。该头来自可信适配器，不从模型或转发请求复制。此行为遵循 [OpenCode Go 客户端要求](https://opencode.ai/docs/go/#where-can-i-use-it)，凭据仍只由父进程注入。

SSE usage 按单次 HTTP 请求的最新累计快照统计，不能逐帧累加；工具往返的不同请求相加，格式重试的调用记录独立计数。旧记录保持原样，若旧适配器对累计快照重复求和，验收证据必须标注其 token 统计不可作为实际用量或计费依据。

## 显式连接验证

用户点击验证后，先读取模型列表，再通过生产 ConfiguredDshProvider 和原生 DSH SDK 执行一次最小 JSON 生成。模型列表可访问不代表生成协议可用；只有两阶段均通过才记录 GENERATION_READY 并允许启用。公开结果和持久化记录分别保存 modelList、generation 检查结论；旧版仅 READY 的记录保持可读，显示 GENERATION_VERIFICATION_REQUIRED，等待用户重新验证。保存、读取、启动服务及加载旧记录均不触发生成。

最小生成使用空的临时工作空间、无授权工具、64 个输出 token、一次 Schema 尝试和最多一次上游生成请求。复用生产原生会话标识、产品 User-Agent、流解析、Bubblewrap 隔离及凭据转发，不另造与实际运行脱节的生成 HTTP 请求。原生网络重试关闭；即使模型意外请求工具，转发器也不会产生第二次付费请求。界面在操作前说明可能产生少量模型费用。

探针与业务模型共用 ECS 串行执行槽，30 秒总期限覆盖排队、模型列表请求及生成，HTTP 客户端断开传递取消。模型列表最多 64 KiB，生成响应及进程输出均有上限；超时、取消与失败等待子进程退出后清理临时目录。失败只返回固定原因码，不返回响应正文、密钥或任意异常消息。受控端点回归证明协议与隔离；不把受控通过当作真实提供方验收。

## 凭据与材料

ProviderSettings 加密保存凭据，对外只返回配置状态、脱敏摘要和校验结果；密钥不进入浏览器持久化、Prompt 日志或 Run 摘要。PublicHttps 位于独立 http 适配器，模型探针与来源读取共用。材料插件按角色白名单读取；Bubblewrap 隔离和会话限制由运行时实现，不扩大 Domain 工具权限。

read_material 在访问文件系统前校验词法路径，拒绝隐藏路径、穿越及路径中的符号链接，再核对规范路径和普通文件类型。越权请求统一返回 DSH_MATERIAL_DENIED，不因隔离空间内目标不存在而改变分类。原生 DSH 验收使用真实 Bubblewrap，并在子进程内部单独探测授权文件可见、同级参考文件不可见，避免仅凭工具拒绝结果推断进程隔离成立。

## 公司 CLI 的实际边界

CompanyCodeAgentCliAdapter 保留进程调用和既有契约测试，真实公司 CLI 的会话、认证、工具协议及行为没有完成验证。不得将 DSH 的材料插件或隔离证明直接套用到该 CLI；新的真实适配应保持 AgentProvider 契约并提供自己的验证证据。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。

业务 DSH 的 SSE 累计传输上限为 16 MiB，覆盖帧头、usage 快照和推理字段；该值不作为内存缓冲大小。单行未闭合缓冲仍限 2 Mi 字符，原生进程输出、token、阶段/总时间限制保持独立。显式连接探针仍限 64 KiB，不随业务默认值增大。大帧开销的小正文受控流必须通过；累计流、超长单行及探针超限仍拒绝，且不自动重试。
