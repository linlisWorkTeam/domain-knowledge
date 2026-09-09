<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接离线运行库在评测与 DSH 隔离空间中的修复和验证。
-->
# 安装版动态库路径修复

从 `98197d9` 在原独立工作树建立 `feat/mvp-runtime-libs`，bootstrap 检查 READY。静态发现 Knowledge.sh 虽设置 LD_LIBRARY_PATH，评测的白名单环境会丢弃它，DSH 隔离空间也没有挂载该路径；富宿主可能掩盖离线机器缺少运行库的问题。

新增 BundledLibraries 验证当前 Node 的同级 tools/lib 专属目录，拒绝任意服务器路径、符号链接、子目录和非动态库文件。Knowledge.sh 显式导出 WP_BUNDLED_LIB_DIR。基线读取、快照检查、评测 Git/prlimit 传递专用库环境；模块与 DSH 隔离只读挂载 `/runtime-libs` 并设置对应 LD_LIBRARY_PATH，不扩大源项目或用户目录的可见范围。

新增 4 项小测试全部通过，耗时 269 ms；真实 bwrap 进程加载复制的准确 libstdc++.so.6，process.report 证实来源为 `/runtime-libs`，写入返回 EROFS，宿主私有文件不可见。typecheck 与 diff 检查通过。没有执行编译评测、模型或浏览器。主 Agent 继续实际安装后的评测与 DSH 验收；系统许可证映射和 VerifyBundle 加固由主 Agent 实施。

主分支同期修改 MarkdownLiteScenario 的 realpath 错误映射与 Git replace-object 行为，集成时保留这些变更，并加入本补丁的库环境设置。
