<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：公共 HTTPS 访问适配设计。
-->
# 公共 HTTPS 访问适配设计

代码位置：[src/infrastructure/http/PublicHttps.ts](../../../../src/infrastructure/http/PublicHttps.ts)、[src/infrastructure/agentAdapters/provider/ProviderSettings.ts](../../../../src/infrastructure/agentAdapters/provider/ProviderSettings.ts)。


PublicHttpsEndpointPolicy 校验 HTTPS 目标，拒绝本地与私有地址，对 DNS 结果执行公开地址检查。createPinnedHttpsDispatcher 将实际连接固定到已校验解析地址，避免校验地址和请求地址分离。

模型配置探针和来源内容获取复用该实现。URL 不携带凭据；连接验证不创建业务 Run，但用户显式操作会通过生产 DSH 执行一次可能计费的最小生成。模型列表与生成固定使用此次验证批准的地址，不再次使用系统 DNS；两个阶段均禁止重定向。客户端断开、总超时和响应上限终止网络及子进程，失败只输出受控错误摘要。代理不能绕过原有地址策略。具体预算与结果语义见[模型与角色运行适配设计](../agentAdapters/AgentAdapters.md#显式连接验证)。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
