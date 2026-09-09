<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：可信项目评测执行设计。
-->
# 可信项目评测执行设计

代码位置：[TrustedProjectEvaluator.ts](../../../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts)、[ModuleCaseExecutor.ts](../../../../src/infrastructure/evaluation/project/ModuleCaseExecutor.ts)、[ProjectScenario.ts](../../../../src/application/services/ProjectScenario.ts)。


TrustedProjectEvaluator 接受显式项目场景和固定源码快照，建立独立参考与生成副本，执行声明的准备、测试和检查命令。生成 files 只允许写入场景白名单，不修改原项目工作树。每次新一轮生成使用 fresh 实现，避免上一版残留影响结果。

工具为 node、pnpm、cargo 白名单，命令使用 argv 和明确工作目录。执行记录退出码、耗时、超时、截断输出与完整证据引用；取消处理子进程及进程树，重复执行结果形成稳定性数据。测试计数必须来自受支持输出格式，不能只用退出码虚构通过数。

## Linux 独立模块门禁

MVP 使用 `moduleSuite` 分支及 `module-cases-v1` 数据契约。每个案例只有唯一编号、说明、公开函数参数和 JSON 预期值。Application 在角色生成之前冻结固定门禁；TestGen 候选必须先在固定提交的参考模块全案验证，失败候选不得通过删案、改预期或执行候选脚本晋升。候选只追加评测，不能替换固定门禁。

`inspect` 通过 `git show <commit>:<path>` 读取授权源码与公开接口，分别保存内容工件和摘要清单。参考评测再次验证源码与清单摘要。生成评测要求恰好一份同路径实现，仅写入该实现，不复制参考仓库、其他源码或测试。参考工作树保持只读。

构建进程只读挂载待测模块、公开签名、受信编译配置和随包 TypeScript 工具目录，只有专门的构建输出目录可写。编译采用 strict、noEmitOnError、erasableSyntaxOnly 和公开签名赋值检查，拒绝类型忽略指令。运行进程只挂载编译后的 JS 与固定执行器，无参考源码、编译器和预期值。静态及动态模块导入均拒绝。

每个案例使用独立 `bwrap --unshare-all` 进程，文件只读、网络隔离、能力全部移除，环境不继承凭据；Node permission 进一步限制文件与子进程能力。执行器将模块放入独立 JS 上下文，避免模块修改宿主的序列化函数。JS 上下文不作为唯一安全边界，仍由内核隔离包围。案例的实际 JSON 值交回宿主，用深相等比较预期值；不读取 TAP、退出码自报计数或 Agent 自评作为通过依据。

每套案例串行重复 5 次，首个失败停止后续执行，未执行案例保留在总数中。任意构建或案例失败均不能 PASS。单个运行进程最大堆 64 MiB、虚拟地址空间 1 GiB、输出 128 KiB、墙钟 5 秒；编译进程 GOMAXPROCS=1、GOMEMLIMIT=128MiB、地址空间 2 GiB、墙钟 30 秒。每次只启动一个进程。取消、超时及输出超限杀死进程组，PID 命名空间销毁全部后代；隔离组件或内核能力不可用时失败关闭，禁止退回无隔离运行。

证据使用 `module-evaluation-v1`，记录源码/案例/工具/执行器摘要、每案每次实际值、预期值、错误、构建结果和执行次数。原始候选脚本仅供阅读复现，不进入可信执行路径。旧命令场景仍为受信项目兼容模式，不作为本版独立模块隔离验收证据。执行器返回事实，EvalRunnerDomainService 决定门禁。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。
