<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：角色材料工作空间设计。
-->
# 角色材料工作空间设计

代码位置：[src/domain/workspace/LocalAgentWorkspace.ts](../../../../src/domain/workspace/LocalAgentWorkspace.ts)、[src/infrastructure/agentAdapters/ModelExecution.ts](../../../../src/infrastructure/agentAdapters/ModelExecution.ts)。


## 当前实现

LocalAgentWorkspace 根据 isolationKey、role、sourceRoot、可选 sourceCommit 和 readablePaths 生成 AgentWorkspaceView。它为一次角色执行准备可读文件，不是供开发者修改项目的 Git worktree。

必须先校验源根在 allowedSourceRoots 内，路径规范化后不能绝对寻址或越界，文件不能经符号链接逃逸。提供 sourceCommit 时从该固定 Git 提交读取，避免混入工作树未提交内容；未提供时按当前文件读取。工作区文件以不可变写入方式保存，内容冲突报错，不覆盖成另一份证据。

返回 workspaceRoot 和实际可读路径给 Adapter；DSH 工具再按授权范围读取。Code 的白名单不含参考源码和门禁测试，TestGen 的材料不含候选知识。该模块本身不提供操作系统级沙箱证明，进程隔离由模型 Adapter 处理。

## CodeAgent 目标工作区（已确认，待实现）

按 [CodeAgent](../agents/codeAgent/CodeAgent.md) 的目标，CodeAgent 的主要材料来自本轮知识卡片；公开接口包含在卡片内，取消从 `publicInterfacePaths` 取得原仓库接口文件的授权。模型可见正文和配置也要经过材料裁剪，不能只限制文件工具而让答案通过 Prompt 进入。

项目/场景配置保存读取与输出规则，Application 在启动时解析为本轮文件白名单和输出位置并冻结。规则和实际路径由受信框架产生，知识卡片正文或模型输出中的路径请求不能扩大权限。CodeAgent 不读取原始实现、参考测试、其他角色材料和其他运行的文件。

工作区可以采用以下逻辑布局，物理位置由框架分配：

```text
本轮工作区/
├── knowledge/       # 固定版本的授权知识卡片
├── config/          # 按角色裁剪的必要配置
└── generated/       # 框架写入本轮生成源码
```

目录存在不表示整目录可读。读取使用具体文件白名单，校验规范化路径、真实路径与符号链接边界；工具不开放任意文件访问、Shell 或直接写入能力。进程隔离限制可见文件系统，不能挂载原始业务仓库给 CodeAgent，也不能仅通过切换工作目录代替隔离。缺少所需隔离能力时，本方案的真实运行应明确失败。

输出 `path` 相对于本轮 `generated` 根目录；绝对路径、越界路径、未授权路径、重复路径和符号链接逃逸均拒绝。框架先校验整组文件，再落盘并保存工件引用；CodeAgent 自身不写业务仓库，不直接修改测试或构建配置。原始实现由后续比较、评测执行器在自己的权限范围内使用。

运行快照保存材料版本、配置版本、实际白名单、隔离工作区和输出根目录；拒绝访问记录角色、Run 与原因。工作区重用不得暴露旧文件。验收对应 AC-SEC-001、AC-CODE-002、AC-CONFIG-001；当前旧接口材料路径和可选进程隔离不代表本目标已完成。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
