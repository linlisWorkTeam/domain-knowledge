<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接共享隔离执行、原生工具链和真实参考观察。
-->
# C/C++隔离工具链已实现，继续接通生成和可信评测

工作树/tmp/domain-knowledge-workbench、feat/five-stage-workbench，前序e65140a。用户完整五阶段目标继续active，本轮有效进展，尚无真正阻塞。原wxc只追加指针；线上taste/4310和v0.2.0均未更新。Node24.13.0、独立READY依赖、384MiB堆，重任务串行。没有模型调用或新模型Run编号。

## 新实现

ModuleCaseExecutor的captureIsolated抽出到infrastructure/runtime/IsolatedCommand，TypeScript保持既有调用及报告。原生NativeToolchain用相同运行时，并强制独立cgroup资源树和全部Linux命名空间。系统只读挂载/usr、/lib、/lib64、/etc/alternatives（本机ld经该目录链接），不挂载其他/etc或宿主用户目录。没有宿主编译回退。

CommandResourceGroup在真实cgroup2文件系统创建自己父/叶组。受限父组memory.max/pids.max不可被子命名空间放宽；只允许一个叶组/一层，Node24受信启动器先进叶组再execve prlimit+bwrap，无先执行再迁移窗口。退出都kill整组，等待populated0再删除。没有改动宿主祖先控制器；缺控制器、权限或清理失败明确报错。当前root服务器可用，其他账户需已委派父目录WP_EVALUATION_CGROUP_ROOT，不宣称任意Linux都已配置好。设计核对了内核官方cgroup-v2文档，链接在Runtime.md；本机挂载还带nsdelegate。

NativeLanguageToolchain端口的NativeToolchain支持C/C++compileAndRun和publicInterface。构建512MiB/32进程/30秒，运行128MiB/16进程/3秒；原生启动前检查576MiB可用内存与32MiB磁盘。源码1MiB单文件、8MiB总量，AST最多8MiB，普通输出128KiB。编译、运行与模型复用进程内modelProcessLane；临时目录退出清理。原始退出码/stdout不被当作可信用例数或门禁。

ClangDeclarations投影函数签名/参数、公开字段/成员、typedef、枚举；保留静态方法、重载，合并重复声明，丢弃函数体/源码范围/注释/私有成员。native-interface-v1记录入口路径和astFilter选择上下文，Tiny过滤后的根不自带外层namespace。它不是完整C++语义分析，也没有接口/结构相似度实现。接口编译失败把stderr保存在Error.cause参考诊断，不能把该诊断当成Code可读接口。

## 验证与真实参考材料

类型、Spec、架构8项通过；完整integration179/179通过，涵盖现有TS模块9项。最后的接口失败诊断修改后原生6/6定向复验通过。测试包含真实C和C++编译、缺依赖、枚举/typedef/静态接口、秘密正文/私有成员不外泄、fork上限、取消、输出限制、资源组清理、不可读宿主文件和不可连宿主监听TCP端口。UI未改，本轮未重跑Console；上一提交29项Console保持历史证据。

证据/root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/native-toolchain：固定SHA校验后，jsmn7项声明、TinyXML2类型转换15项声明已通过生产NativeToolchain提取。jsmn四种原始Makefile配置均编译并运行上游参考测试，退出0，原输出每组16项通过；TinyXML2完整参考库加小探针编译运行，宿主比较整数42、浮点2.5、布尔true通过。探针源码和原报告在tinyxml2-reference-observation.json，jsmn各配置在jsmn-reference-observations.json。这不是模型Run或可信测试晋升；不要把上游stdout自报计数作为生成代码门禁。

参考仓库和项目输入仍见1623记录：/tmp/workbench-reference-inputs及/tmp/workbench-native-acceptance-20260910；锁在tests/fixtures/nativeTargets/Targets.json。原生临时目录及新cgroup均清理，没有删除固定源码/输入或旧知识。磁盘从约800MiB降至约340MiB，本任务证据约2MiB、参考仓库4.6MiB、输入584KiB，旧知识几KiB，删旧知识不能释放大量空间。不要删除活跃工作树/依赖；新构建有实际资源预检查。

## 下一步保留完整目标

尽快把已固定项目输入和独立接口材料交给生产GENERATE，完成多卡片而非继续只做辅助骨架。还需要Domain知识单元划分、稳定cardId写入、阶段绑定稳定Run/冻结模型配置，复用RoleExecutionService和Domain七角色，不用AgentExample的新Run样例充当恢复。ingestCandidate按moduleId串历史且要求slug，多卡片存储身份必须防止跨卡串版本。

NativeLanguageToolchain尚未接到应用阶段，TS目前只共享运行时，尚未实现统一语言端口适配。还缺工具链摘要/缓存键、源码依赖与实际构建配置解析、原生可信行为测试协议、候选在参考上晋升规则、隐藏测试材料边界、结构/规范化差异与知识段落修订。公开接口并不允许Code读取项目sourceFiles或原build配置。参考与生成分别调用独立目录；原生生成程序可伪造stdout，必须由宿主按固定输入/期望比较，不解析自报计数。

继续实现FLYWHEEL/EVALUATE/ASSOCIATE、指定外部材料关系及一键链路。修订先刷索引；不能持全局阶段租约再启动等待子INDEX。无主动搜索、无新账户、无固定三轮总上限；取消/恢复不重置预算。完整jsmn/TinyXML2模型闭环、markdownLite最终回归、最终截图/报告和网站部署均未完成。
