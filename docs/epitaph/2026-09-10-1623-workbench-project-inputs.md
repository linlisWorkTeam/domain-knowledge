<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接不可变项目输入与已固定原生验收仓库。
-->
# 项目输入已持久化，继续公开接口和真实生成

工作树/tmp/domain-knowledge-workbench、feat/five-stage-workbench，前序47ef4c5。原wxc只追加交接，不覆盖；线上taste/4310及v0.2.0未更新。Node24.13.0、独立READY依赖、384MiB堆、重测试串行。用户完整五阶段目标继续active，不是只有输入快照的目标；没有新阻塞或需要审批的事项。上一轮属于有效进展。

## 本轮实现和证据

Domain WorkbenchProject定义仓库级projectId、内容寻址snapshotId、模块选择和编译器/标准/相对包含目录/预处理定义。拒绝空/未知/不支持模块和任意命令参数。Application WorkbenchProjects从固定提交读取选定源码及构建配置到CAS，然后SQLite原子保存输入；相同输入保留原快照，源码/参数变化生成新历史。保存与读取接口/api/v1/projects已接通，Console支持模块勾选、参数调整和保存，修改后提示重新保存。

Git readFiles只接受完整提交和清单内source/build文件，不读取测试/示例、脏工作区或符号链接。单文件1MiB，总8MiB，严格UTF-8保留BOM，NUL/非UTF-8失败；命令继续隔离Git配置、禁止惰性抓取、无shell、限时限输出及进程组取消。注意这仍不是编译隔离器。

类型、Spec、架构8项、完整integration173/173与Console29/29通过。本轮浏览器失败一度源于getByLabel精确名称匹配select选项，改为实际可访问combobox角色定位后全量通过，没有放宽断言或更新截图基线。截图、日志与Verification.md在/root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/project-inputs/。

## 真实源码输入已固定，不是模型Run

/tmp/workbench-reference-inputs/jsmn：25647e692c7906b96ffd2b05ca54c097948e879c；TinyXML2：8224e427b655b83dae5e2298f1e6919523a78737，位于同根tinyxml2。仓库为明确验收目标的浅克隆，无主动搜索或工具下载。tests/fixtures/nativeTargets/Targets.json记录提交、源码/上游测试SHA256和限定符号。可信测试状态仍PENDING_REFERENCE_VALIDATION。

生产WorkbenchProjects已将两者固定到/tmp/workbench-native-acceptance-20260910；NativeProjectInputs.json有准确projectId/snapshotId。jsmn snapshot为project-input-21e524125df7aa1b6059f449e1d1918fab0019d81af04c5de0af3bddf398c107，TinyXML2为project-input-ddcec08c93215dc7f714e227e097957774dad4d832f85ddbea162564edce42d8。这是参考源码输入，不是Code可读接口，也没有模型Run编号。

## 下一步必须向完整目标推进

优先抽取可复用Linux隔离命令边界和C/C++语言工具链；现有src/infrastructure/evaluation/project/ModuleCaseExecutor.ts私有captureIsolated可参考，具有bwrap网络/PID/文件隔离及地址空间/超时/输出边界，但尚无可信原生协议和可靠进程数限制。TS也应接同一边界保持原断言。不要只把gcc列入命令白名单，也不要在宿主直接构建不可信源码。实际编译前检查资源和工具，失败关闭。当前构建参数是声明式快照，不代表依赖解析已实现；工具摘要须在构建阶段另行冻结。

jsmn.h通过JSMN_HEADER预处理可屏蔽实现，但Code不能拿原头文件；Clang AST须只投影声明/类型/枚举，不携带函数体或源码片段。参考Makefile有默认、STRICT、PARENT_LINKS及两者组合四种测试配置。TinyXML2 XMLUtil类同时包含内联实现，需提取ToStr重载、ToInt/Unsigned/Bool/Float/Double/Int64/Unsigned64和SetBoolSerialization的独立接口。不能重建整个XML库。上游xmltest.cpp不是已完成的限定类型转换可信测试集。

然后实现稳定stage绑定Run与冻结模型配置的GENERATE，复用RoleExecutionService和Domain七角色，不用每次新Run的AgentExample。ingestCandidate按moduleId串历史且要求slug，多卡片需明确稳定cardId/存储身份，不能直接传带斜杠的候选模块路径。Code不能读取sourceFiles或原build文件，只有提取接口/知识/约束。还缺公开接口/依赖分析、生成、FLYWHEEL/EVALUATE/ASSOCIATE、测试复用/晋升/失败修订、一键索引刷新、真实模型和最终部署。持全局阶段租约时不能启动并等待子INDEX。取消/重试不得重置预算，禁止恢复固定三轮总上限。
