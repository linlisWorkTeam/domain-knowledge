<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：固定 Git 清单及本机工具探针的技术边界。
-->
# 源码分析适配

代码：[GitRepositoryAnalyzer](../../../../src/infrastructure/source/GitRepositoryAnalyzer.ts)。

目录通过 realpath 与允许根校验，要求 Git 顶层目录。revision 使用 --end-of-options 解析并固定完整 commit；读取 ls-tree 的 blob身份与大小，不读工作区实现、测试正文或符号链接目标，不展开子模块。构建配置仅识别编译数据库、Make、CMake、Node 配置文件的存在，尚不解析构建参数或依赖。

命令无 shell，输出上限2MiB，单命令10秒，取消杀死进程组；Git关闭系统/全局配置与交互凭据，设置禁止惰性抓取，不执行仓库构建或下载工具。环境检查读取 MemAvailable、磁盘可用量，以及 gcc/g++/clang/make/cmake/bwrap/prlimit 的版本；不足时明确失败，不静默改变隔离。工具版本成功不等于内核隔离或编译行为已验证。

最多分析20000个Git条目。主要源码扩展之外不推测语言支持；不支持语言明确标识。环境实时观测与固定源码 CAS 清单分开。后续需补齐实际公开接口提取、构建配置解析、编译资源控制。

readFiles只接受完整提交与清单内的源码/构建文件路径；再次解析固定提交清单后用cat-file读取blob，不读取当前工作区或参考测试。单文件1MiB、总计8MiB上限，严格UTF-8（保留BOM），拒绝NUL与长度不符。所有读取仍使用无shell、禁止惰性抓取和进程组取消的命令边界。

指定外部材料捕获复用 SQLiteContentGovernance 的来源读取：同一次读取同时返回字节与 SHA，Application 校验固定修订，避免另读造成内容与摘要不一致。FILE 读取前检查文件大小，HTTPS 沿用地址固定、主机限制和禁止跳转策略。MaterialText 只转换 UTF-8 文本/Markdown/JSON/HTML，HTML 去除脚本、样式、标记并解码常见实体；原始字节保留于 CAS，转换文本不是原始网页的等价副本。材料上限 2 MiB。
