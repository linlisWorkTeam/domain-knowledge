<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：候选文件发现设计。
-->
# 候选文件发现设计

代码位置：[src/domain/services/sourceScan/SourceScan.ts](../../../../../src/domain/services/sourceScan/SourceScan.ts)、[src/application/apps/KnowledgeDiscoveryApp.ts](../../../../../src/application/apps/KnowledgeDiscoveryApp.ts)。


SourceScanner 实现 KnowledgeDiscoveryPort，只依赖最小 SourceKnowledgeReader 提供已入库正文摘要。scan 接收配置的扫描根和返回上限，输出 candidates、total、truncated；候选包含相对路径、SHA256、大小与修改时间。

扫描先将仓库根和请求根解析为真实路径，越出仓库返回 SOURCE_ROOT_DENIED；不存在的根跳过。递归跳过符号链接、忽略目录和文件，只选择 Markdown 文件。正文摘要已入库的文件不返回，候选按修改时间和路径排序后截断。

本模块是文件候选发现，不是语言分析、远程爬虫或 SearchAgent。发现不自动入库、评测或发布；Application 决定后续用例。文件系统读取在本次目录迁移中保留，接口不引用完整仓库实现。


文档关系：[设计目录](../../../README.md)负责代码与设计定位；[开发指南](../../../../Development.md)说明修改和交付步骤。
