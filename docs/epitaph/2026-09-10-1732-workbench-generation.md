<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接已接通的C/C++知识生成、逐卡恢复和下一步可信评测边界。
-->
# GENERATE 与 INDEX 可操作，完整目标继续

工作树 `/tmp/domain-knowledge-workbench`、`feat/five-stage-workbench`，前序2479904。用户完整五阶段目标仍active，本轮无真正阻塞，不应标记完成。原wxc仅追加指针，线上taste/4310及v0.2.0未更新。Node24.13.0、独立READY依赖、384MiB堆，重测试串行。剩余磁盘约310MiB，未删除旧知识；本任务生成证据很小，勿删其他活动工作树或依赖。

## 当前实现

WorkbenchGeneration接通生产GENERATE：固定项目输入、配置和接口选择，调用NativeToolchain提取接口，Domain KnowledgeUnits按函数/重载族及类型划稳定cardId。storageModuleId为unit加身份摘要，metadata.sourceModule保留展示模块；来源提交和符号作为确定性正文尾注，源码变化不会错复用旧来源版本。候选逐张提交，即时可读；质量和行为评测独立，生成成功不等于验证或发布。INDEX沿用已有增量用例，YAML模块使用sourceModule。

配置为workbench-model-v1 CAS工件，冻结七角色提示词/模型/契约/策略。阶段使用自身taskId，不创建伪旧Run，不写旧Run外键配置表。复用Domain DocGen概要/章节及新抽出的RoleArtifacts通用结果绑定；旧RoleExecution仍走相同提交边界。阶段角色日志保存在CAS+阶段事件，成功概要/正文重放，成功卡片检查点复用。角色活动时钟排除暂停时长，实际调用及保守Token预留先记账，供应商报告用量另记，缺失用量不当零。每模型会话最多一次供应商请求、一次schema尝试，全部材料内联，物理模型工作区空、授权工具为空。

新阶段显式冻结resumeOperationalFailures=true：额度、取消、关闭、预算中断写failureCode，尝试编号和使用量累计，不消耗两次语义修正额度，不在当前执行中自动循环重试。未知错误/未知进程中断仍按原限次规则。旧Run不启用该策略，原两次限制与时钟不变。配置缺失或变化、资源不足明确暂停；新入口需要Console保存并验证的Provider配置，尚未接入env-only模式。配置变更应新启动输入，不能改旧任务冻结配置。

HTTP新增POST /api/v1/generations {snapshotId, scopes?}；scopes为模块键及entryPath/astFilter/symbols。状态/取消/恢复共用stage-tasks。操作中心保存项目后可生成，显示逐卡产物、用量、错误和索引下一步；可选范围不需要场景JSON，刷新可找回最近任务。只读未授权页面不请求受保护历史。接口字段内容及展开状态在重绘保留。截图基线经审阅更新，原几何和1%阈值未放宽。

Clang声明自动选择当前入口的公开声明，排除包含文件声明；过滤C++类时恢复完整命名空间，重载同族。原native-interface-v1仍只含声明，错误stderr保存在参考侧diagnosticRef，不能交给Code。单模块源码最多1MiB，DocGen目前每卡内联该模块全部源码；尚未实现函数正文切片或完整源码依赖图。新GENERATE仅C/C++；TypeScript新端口仍待接通，原markdownLite回归保留。

## 验证及证据

最终typecheck通过；领域+架构54/54（含8架构），完整integration181/181通过。Console四文件共29个独立用例覆盖通过：Console+Product26，DirectEditing1，RunExecution2；后续定向还验刷新找回已完成生成。真实C编译+模拟模型驱动生产DocGen与SQLite/CAS测试，连续两次额度暂停、重启、仅未完成正文重试、用量累计、相同输入复用、源码变化稳定卡片身份/新版本、旧索引失效均通过。自动C声明排除依赖头，C++类命名空间/重载保持验证通过。

证据 `/root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/generation`。保留初次失败日志：公共辅助函数误删导致旧角色3项失败，恢复后完整181通过；一次浏览器调用遗漏显式Playwright配置造成基线路径/主题失败，使用仓库配置后通过。另浏览器与原生编译并行时真实内存预检查暂停，UI测试改注入接口投影，实际编译仍在integration验证，不降低资源阈值。UI模型输出为受控数据，截图卡片质量REJECTED如实展示；没有真实模型调用或新真实Run编号。

## 下一步完整目标

优先接通FLYWHEEL/EVALUATE，别继续只扩外围基础。现有CodeAgent输出files，可复用；TestGen当前ModuleBehaviorSuite仍偏TypeScript，需原生声明式用例协议和宿主受信harness。不能让模型自由测试源码/自报stdout计数直接变成可信门禁：候选先在参考实现上验证，失败不得晋升或据此判知识错误；生成实现与参考分别隔离构建，由宿主比较固定输入/真实输出。错误候选、可信旧预期保留不可篡改；测试缓存绑定知识正文、参考源码/接口、策略及工具链摘要（后者尚未实现）。

Code只接收卡片、声明和清理后的构建约束，不能读取project.sourceFiles、原构建文件、完整AST或diagnosticRef。需通用阶段角色提交/日志交接以复用当前DocGen实现，但不要新增动态Agent平台。公开接口/结构/规范化代码差异和段落修订、等价差异未解决项、质量/行为门禁发布仍待实现。当前通用materialModelExecution只允许read_material请求；接Code/TestGen前核对角色工具声明并保持实际授权为空，不能因此开放参考仓库。

随后ASSOCIATE、指定本地/URL外部材料、关联回退、全部顺序执行。阶段全局租约不能内部启动并等待子INDEX；修订完成后先刷新索引再推进。需要持久化总流程状态，复用单阶段用例而不是另起旁路。无主动搜索、无账户、无固定三轮总上限，额度查询失败关闭。

真实目标和前序参考材料仍在1623/1645记录与tests/fixtures/nativeTargets/Targets.json。jsmn/TinyXML2 XMLUtil真实模型多卡片→重建→可信评测→关联链路未跑，旧参考compile观察不算模型验收。最终markdownLite回归、最终完整截图/报告/真实运行编号和当前网站更新均未完成，完整goal继续active。
