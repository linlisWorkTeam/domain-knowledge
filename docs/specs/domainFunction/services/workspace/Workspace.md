<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：角色材料工作空间设计。
-->
# 角色材料工作空间设计

代码位置：[src/domain/services/workspace/LocalAgentWorkspace.ts](../../../../../src/domain/services/workspace/LocalAgentWorkspace.ts)、[src/infrastructure/agentAdapters/ModelExecution.ts](../../../../../src/infrastructure/agentAdapters/ModelExecution.ts)。


LocalAgentWorkspace 根据 isolationKey、role、sourceRoot、可选 sourceCommit 和 readablePaths 生成 AgentWorkspaceView。它为一次角色执行准备可读文件，不是供开发者修改项目的 Git worktree。

必须先校验源根在 allowedSourceRoots 内，路径规范化后不能绝对寻址或越界，文件不能经符号链接逃逸。提供 sourceCommit 时从该固定 Git 提交读取，避免混入工作树未提交内容；未提供时按当前文件读取。工作区文件以不可变写入方式保存，内容冲突报错，不覆盖成另一份证据。

返回 workspaceRoot 和实际可读路径给 Adapter；DSH 工具再按授权范围读取。Code 的白名单不含参考源码和门禁测试，TestGen 的材料不含候选知识。该模块本身不提供操作系统级沙箱证明，进程隔离由模型 Adapter 处理。


文档关系：[设计目录](../../../README.md)负责代码与设计定位；[开发指南](../../../../Development.md)说明修改和交付步骤。
