<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：共享隔离命令和原生资源组的技术契约。
-->
# 隔离运行时

[IsolatedCommand](../../../../src/infrastructure/runtime/IsolatedCommand.ts)供TypeScript模块执行器与NativeToolchain复用；语言策略和结果解释留在调用方。BundledLibraries继续校验安装包专用动态库，原边界见[评测适配](../evaluation/Evaluation.md)。

Linux命令使用prlimit和Bubblewrap，不执行shell文本。系统只读挂载/usr、/lib、/lib64和/etc/alternatives（服务器链接器经此目录定位）；不挂载其他/etc、用户目录或原仓库。源码workspace只读，可选buildOutput单独可写。环境仅传入明确PATH及包内动态库，不传模型凭据。旧TS保留原命令/预算与报告，原生任务显式要求用户、IPC、PID、网络、UTS、cgroup全部命名空间，不能使用失败忽略的cgroup命名空间选项。

CommandResourceGroup仅在已有cgroup2父目录下创建自己命名的资源组，默认/sys/fs/cgroup，或显式WP_EVALUATION_CGROUP_ROOT。验证真实文件系统magic和控制器文件；不修改宿主祖先的subtree_control，不使用普通目录模拟成功。受限父组设置memory.max、memory.swap.max=0、memory.oom.group、pids.max，仅允许一个叶组和一层深度；启用自己父组的memory/pids子控制器。受信Node24启动器先进入叶组，再execve prlimit/Bubblewrap。资源上限位于子进程cgroup命名空间根之外，不能由后代放宽；依据[内核cgroup v2文档](https://docs.kernel.org/admin-guide/cgroup-v2.html#delegation)的分层限制。

任何退出都先cgroup.kill整个自己创建的父组，等待populated=0再删除叶/父组；取消、超时、输出超限同时杀进程组。创建、权限、控制器或清理失败向调用方明确报错，不静默降级。正常资源组可由无特权进程使用已委派父目录；当前服务器的真实验证使用root创建独立组。没有声称任意未配置的Linux账户都可运行原生任务。

原生资源组的fork上限、取消、输出限制和清理使用真实内核集成测试；临时宿主秘密文件不可读取、监听中的宿主TCP端口不可连接。测试证明这些已覆盖的边界，不把声明投影或原始stdout当作行为可信门禁。


原生可信用例启用 AddressSanitizer/UndefinedBehaviorSanitizer。IsolatedCommand 的显式 addressSpaceBytes 只用于虚拟地址空间，必须同时提供 processLimit 以启用物理内存/进程 cgroup；小于物理上限或超过 128 TiB 的值拒绝。原默认地址空间限制不变，原生检测模式仍保留 128 MiB 物理内存、16 进程、3 秒运行超时及进程组取消。检测器不是隔离替代，缺失依赖时构建失败，不自动退回无检测模式。
