<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：公共 HTTPS 访问适配设计。
-->
# 公共 HTTPS 访问适配设计

代码位置：[src/infrastructure/http/PublicHttps.ts](../../../../src/infrastructure/http/PublicHttps.ts)、[src/infrastructure/agentAdapters/provider/ProviderSettings.ts](../../../../src/infrastructure/agentAdapters/provider/ProviderSettings.ts)。


PublicHttpsEndpointPolicy 校验 HTTPS 目标，拒绝本地与私有地址，对 DNS 结果执行公开地址检查。createPinnedHttpsDispatcher 将实际连接固定到已校验解析地址，避免校验地址和请求地址分离。

模型配置探针和来源内容获取复用该实现。URL 不携带凭据，探针不执行业务 Run；失败对调用方输出受控错误摘要。代理和重定向不能绕过原有地址策略。独立 security 规范已移除，本文件只描述已有 HTTP Adapter 的输入和失败契约，不增加功能或放宽运行行为。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
