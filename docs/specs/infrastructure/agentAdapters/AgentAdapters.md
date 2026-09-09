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

## 凭据与材料

ProviderSettings 加密保存凭据，对外只返回配置状态、脱敏摘要和校验结果；密钥不进入浏览器持久化、Prompt 日志或 Run 摘要。PublicHttps 位于独立 http 适配器，模型探针与来源读取共用。材料插件按角色白名单读取；Bubblewrap 隔离和会话限制由运行时实现，不扩大 Domain 工具权限。

read_material 在访问文件系统前校验词法路径，拒绝隐藏路径、穿越及路径中的符号链接，再核对规范路径和普通文件类型。越权请求统一返回 DSH_MATERIAL_DENIED，不因隔离空间内目标不存在而改变分类。原生 DSH 验收使用真实 Bubblewrap，并在子进程内部单独探测授权文件可见、同级参考文件不可见，避免仅凭工具拒绝结果推断进程隔离成立。

## 公司 CLI 的实际边界

CompanyCodeAgentCliAdapter 保留进程调用和既有契约测试，真实公司 CLI 的会话、认证、工具协议及行为没有完成验证。不得将 DSH 的材料插件或隔离证明直接套用到该 CLI；新的真实适配应保持 AgentProvider 契约并提供自己的验证证据。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
