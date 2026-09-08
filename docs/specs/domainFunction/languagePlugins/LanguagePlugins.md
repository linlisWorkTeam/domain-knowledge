<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：语言能力契约与当前支持范围。
-->
# 语言能力契约与当前支持范围

代码位置：[src/application/ports/ApplicationPorts.ts](../../../../src/application/ports/ApplicationPorts.ts)、[src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts](../../../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts)。


## 已有契约

当前 LanguagePlugin 端口只有 languageId、compile(sourceRefs, sandbox, signal) 和 test(binaryRef, testRefs, sandbox, signal)，返回 SandboxResult。SandboxResult 用 stdout/stderr 工件引用、退出状态、超时和资源数据表达执行结果。

仓库没有独立的 `src/domain/languagePlugins/` 或 C++ 插件实现，所以不新增占位代码目录。设计归在领域功能是为了表达语言能力边界；实际端口位置以上方代码链接为准。

## 当前可执行路径

生产项目评测走 ProjectEvaluator 和 ProjectCommand，工具白名单为 node、pnpm、cargo；根据显式场景执行 prepare、test、check 及重复次数。它不是通过 LanguagePlugin 自动发现语言，也不是 C++ 资源沙箱。

## 扩展契约

新增语言应实现现有 Port，明确产物、诊断、工具链指纹、取消、输出上限和执行约束；通用 Agent 不接收 AST、编译器句柄或语言 SDK。`LanguagePlugin.schema.json` 保留版本化交换设计，其能力字段不代表当前接口已经实现 describe/discover/normalize。实现接口扩展时同步 Schema、消费者和契约测试。KF-SYS-012/014 按验收追踪保持未完成状态。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
