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

安装启动器设置 `WP_BUNDLED_LIB_DIR` 为当前 Node 的同级 tools/lib；验证器拒绝任意目录、子目录、非动态库文件或符号链接。宿主 Git/prlimit 只接收此专用库路径；评测和 DSH 隔离空间只读映射至 `/runtime-libs` 并显式设置 `LD_LIBRARY_PATH`，不依赖宿主预装对应运行库，也不扩大应用或用户目录的可见范围。

每个案例使用独立 `bwrap --unshare-all` 进程，文件只读、网络隔离、能力全部移除，环境不继承凭据；Node permission 进一步限制文件与子进程能力。执行器将模块放入独立 JS 上下文，避免模块修改宿主的序列化函数。JS 上下文不作为唯一安全边界，仍由内核隔离包围。案例的实际 JSON 值交回宿主，用深相等比较预期值；不读取 TAP、退出码自报计数或 Agent 自评作为通过依据。

每套案例串行重复 5 次，首个失败停止后续执行，未执行案例保留在总数中。任意构建或案例失败均不能 PASS。单个运行进程最大堆 64 MiB、虚拟地址空间 1 GiB、输出 128 KiB、墙钟 5 秒；编译进程 GOMAXPROCS=1、GOMEMLIMIT=128MiB、地址空间 2 GiB、墙钟 30 秒。所有飞轮的模块评测与模型请求共享同一个外部重进程槽，排队期间也响应取消与整次预算。取消、超时及输出超限杀死进程组，PID 命名空间销毁全部后代；隔离组件或内核能力不可用时失败关闭，禁止退回无隔离运行。

证据使用 `module-evaluation-v1`，记录源码/案例/工具/执行器摘要、每案每次实际值、预期值、错误、构建结果和执行次数。原始候选脚本仅供阅读复现，不进入可信执行路径。旧命令场景仍为受信项目兼容模式，不作为本版独立模块隔离验收证据。执行器返回事实，EvalRunnerDomainService 决定门禁。


文档关系：[设计目录](../../README.md)负责代码与设计定位；[开发指南](../../../Development.md)说明修改和交付步骤。

## 原生工具链隔离边界

现有ModuleCaseExecutor的captureIsolated已抽取到runtime/IsolatedCommand供TypeScript与C/C++共用，保持旧TS调用的参数及报告。原生调用额外要求独立cgroup v2，设置memory.max、memory.swap.max=0、pids.max和memory.oom.group；受信Node启动器先将自身加入组，再execve资源限制器和Bubblewrap，消除启动后迁入的fork竞态。输入源码只读挂载，构建输出独立可写；网络与PID命名空间隔离。退出、取消、超时、输出超限都清理整个资源组，确认没有进程后才返回。缺控制器/权限/工具时失败关闭，不修改宿主控制器配置或降级为宿主编译。

NativeToolchain通过NativeLanguageToolchain端口支持C/C++源码文件的隔离编译/运行与Clang声明投影。只使用现有gcc、g++、clang、clang++；不执行仓库Makefile或自动下载依赖。构建返回原始报告，失败不执行。原始stdout不是可信用例数、相似度或发布门禁。C/C++候选测试协议、测试晋升/缓存、模型重建和阶段应用接线仍未实现。

publicInterface输入明确入口和符号选择，可用astFilter限制类范围。Clang AST只保留函数类型/参数、公开字段/成员、typedef和枚举值，不输出函数体、注释、源码范围或私有成员；重载保留，重复声明合并。过滤器保留在native-interface-v1材料中，避免丢失类的选择上下文。这是声明投影，不宣称完整C++语义或AST结构相似度已实现；自动模块/依赖划分及构建配置解析仍待完成。

原生任务先检查可用内存至少576MiB、磁盘至少32MiB。源码单文件1MiB、总8MiB；编译整组内存512MiB、进程32、墙钟30秒，运行128MiB、进程16、墙钟3秒。Clang AST输出最多8MiB，其余128KiB。文件大小、CPU、描述符及取消边界由共享执行器执行。参考与生成源码必须使用不同调用和独立临时目录；最终源码/失败证据由应用层存CAS，临时构建退出后清理。

固定jsmn四种配置均已执行上游参考测试，TinyXML2已执行三个基本类型转换参考观察；记录位于workbench-progress/native-toolchain。这些不是模型Run或发布门禁，不据此把待验证候选测试晋升为可信测试。

原生行为执行器（接入中）仅生成受信harness，不执行模型测试源码；模型提供的数据经Domain校验后才能插入固定语法位置。所有变量名、类型、函数名、字段和头文件路径受白名单约束，字符串按字节转义。expected从不写入构建目录或程序参数。每次参考/生成构建使用NativeToolchain独立目录，保留资源隔离、超时与整进程树取消；stdout只能携带逐字段观察，不接受自报通过数。编译或协议失败不能被相似度覆盖。

原生行为harness强制AddressSanitizer与UndefinedBehaviorSanitizer，并在首个错误停止，以拒绝参考端越界或未定义行为的候选。ASan需要巨大虚拟影子地址，原生案例运行显式允许128TiB虚拟地址空间，但128MiB真实内存和16进程仍由强制cgroup控制；只有存在该资源组时才能使用虚拟地址覆盖。普通原生调用与TypeScript原有RLIMIT_AS不变。关闭LeakSanitizer（这里检查行为/越界，不用泄漏判定知识），不移除地址/UB检查；编译、超时、输出与namespace边界保持。

虚拟地址限制依据[Clang AddressSanitizer官方限制说明](https://clang.llvm.org/docs/AddressSanitizer.html#limitations)：64位ASan映射超过16TB影子地址，普通ulimit语义不能代替真实内存限制。这里的隔离仍由namespace和cgroup承担，sanitizer只是测试中的缺陷检测器。
