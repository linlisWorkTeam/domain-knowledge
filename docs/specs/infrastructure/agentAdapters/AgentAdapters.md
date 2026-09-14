<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：模型与角色运行适配设计。
-->
# 模型与角色运行适配设计

代码位置：[src/infrastructure/agentAdapters/ModelExecution.ts](../../../../src/infrastructure/agentAdapters/ModelExecution.ts)、[src/infrastructure/agentAdapters/deepSeekHarness/DeepSeekHarnessSdkAgent.ts](../../../../src/infrastructure/agentAdapters/deepSeekHarness/DeepSeekHarnessSdkAgent.ts)、[src/infrastructure/agentAdapters/deepSeekHarness/ConfiguredProvider.ts](../../../../src/infrastructure/agentAdapters/deepSeekHarness/ConfiguredProvider.ts)、[src/infrastructure/agentAdapters/companyCodeAgent/CompanyCodeAgentCliAdapter.ts](../../../../src/infrastructure/agentAdapters/companyCodeAgent/CompanyCodeAgentCliAdapter.ts)。


## Domain Port 到运行时

modelExecutionFactory 为每个角色绑定 ModelExecutionPort。输入包括 Prompt、输出 Schema、授权工具和可读路径，Adapter 准备 Workspace，映射 AgentProvider 请求、会话和模型配置。JsonSchemaAgentContractValidator 校验公共命令/结果，DSH 负责授权工具自主调用，Domain 仍控制角色阶段。

## 内部子任务的技术调度

ConcurrentTasks 实现 Application 的 TaskBatchRunner，默认最多三个并发调用。DocGen 决定最多五个 Worker 任务的业务范围，执行器只控制启动与取消；任务失败时取消其余在途调用、停止启动排队任务，并等待所有已启动任务结束。结果保持输入任务顺序。内部 Worker 继续使用 modelExecutionFactory，每个任务拥有独立命令、授权源码路径及隔离工作区。

## Provider 与运行策略

DSH 原生 SDK 是默认接入后端，Adapter 负责输出提取、闭合 Schema 校验、网络/格式修复重试、超时、取消和调用摘要。角色层不再重复网络重试。Check 通过 outputAttempts=1 接管报告的统一修正预算，DSH 每次只尝试一个输出；JSON/Schema 错误以 ModelResponseError 保留原始响应，供 Check 反馈修正，其他角色沿用既有策略。报告尝试追加独立 report-N 幂等后缀及审计字段，不改变冻结命令和授权范围。模型正常返回仍须检查取消，防止迟到输出提交。受控场景模型注入同一入口，不能通过继承覆盖业务步骤。

ConfiguredProvider 解析已验证设置或环境配置。Console 已保存但未启用/未验证的配置阻止新 Run，不静默回退；已有 Run 使用冻结配置。OpenCode Go 根据非秘密参数生成运行目录补丁，补丁只记录密钥环境变量名。配置方式见 Runtime 指南。

已配置提供方的 HTTP 转发使用自己的 `User-Agent` 标识。对 `opencode.ai`，依据 [Go 客户端约定](https://opencode.ai/docs/go/#where-can-i-use-it) 发送 `x-opencode-session`：从当前角色调用的 idempotencyKey 生成不可逆摘要，同一次调用内的工具往返和格式修复保持稳定，不同角色/轮次使用不同标识；不发送原始项目路径或密钥，也不转发客户端任意头。其他主机不发送此提供方专属头。传输策略版本进入运行配置指纹；已有失败运行不在配置改变后静默恢复。`GET /models` 通过只证明模型目录可访问，不证明正式生成请求成功。

## 凭据与材料

ProviderSettings 加密保存凭据，对外只返回配置状态、脱敏摘要和校验结果；密钥不进入浏览器持久化、Prompt 日志或 Run 摘要。PublicHttps 位于独立 http 适配器，模型探针与来源读取共用。材料插件按角色白名单读取；Bubblewrap 隔离和会话限制由运行时实现，不扩大 Domain 工具权限。

2026-09-10 已确认的 CodeAgent 目标见 [CodeAgent](../../domainFunction/agents/codeAgent/CodeAgent.md) 和 [Workspace](../../domainFunction/workspace/Workspace.md)：读取本轮卡片与必要配置，不给原仓库接口授权；工具限制与进程隔离必须同时落实，不能仅设置 cwd。当前默认 DSH 入口启用 Bubblewrap，但底层仍允许 `processIsolation: none`，因此不能把现有可选隔离描述为目标已完成。后续实现应拒绝无法满足隔离的目标运行，并验证提示词材料也没有绕过文件白名单。CodeAgent 不开放 Shell、全局文件读取或直接写入工具；源码由框架校验后落盘。

## 公司 CLI 的实际边界

CompanyCodeAgentCliAdapter 保留进程调用和既有契约测试，真实公司 CLI 的会话、认证、工具协议及行为没有完成验证。不得将 DSH 的材料插件或隔离证明直接套用到该 CLI；新的真实适配应保持 AgentProvider 契约并提供自己的验证证据。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。

## reasoning 参数传递与响应诊断

2026-09-14 cJSON 记录显示会话reasoningEffort=off且原生适配配置thinking=disabled，但响应包含持续推理。排查须区分配置声明、实际HTTP请求与上游响应。通过真实DSH SDK到受控上游捕获请求，验证thinking.type=disabled且无启用的reasoning_effort；ConfiguredProvider转发原始请求字节，不替换模型内容。

提供方审计只记录请求摘要、允许的推理配置、响应推理/正文字符数及首次出现的相对时间。关闭推理却收到reasoning_content时明确记录差异，不隐藏推理、不伪称已关闭、不自动修改上游模型参数。请求/响应正文和凭据不进入这份摘要。SDK会话依旧保留原始响应。真实提供方是否遵守请求需独立验证，受控服务器只能证明本地链路。

TestGen计划与批次各用独立Provider幂等键，角色命令和授权材料保持绑定。批次checkpoint由Application实现，Domain决定分批与组装规则；既有节点及SDK超时不因分批延长。
