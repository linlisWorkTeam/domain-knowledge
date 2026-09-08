<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：可信项目评测执行设计。
-->
# 可信项目评测执行设计

代码位置：[src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts](../../../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts)、[src/application/services/ProjectScenario.ts](../../../../src/application/services/ProjectScenario.ts)。


TrustedProjectEvaluator 接受显式项目场景和固定源码快照，建立独立参考与生成副本，执行声明的准备、测试和检查命令。生成 files 只允许写入场景白名单，不修改原项目工作树。每次新一轮生成使用 fresh 实现，避免上一版残留影响结果。

工具为 node、pnpm、cargo 白名单，命令使用 argv 和明确工作目录。执行记录退出码、耗时、超时、截断输出与完整证据引用；取消处理子进程及进程树，重复执行结果形成稳定性数据。测试计数必须来自受支持输出格式，不能只用退出码虚构通过数。

参考源码检查通过才能作为本轮可信基线。模型提出的命令只作为候选工件，当前门禁使用场景声明的可信命令。执行器返回事实，EvalRunnerDomainService 决定门禁。该实现面向可信项目，不声明为敌对代码的通用沙箱或 C++ 插件。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
