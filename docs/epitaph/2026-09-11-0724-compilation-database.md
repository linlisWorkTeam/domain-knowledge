# 编译数据库候选与真实来源终态

/tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线 c15a9fdd55ba3f1a66bca871b25ba7f5cbdce589。完整目标 active；原wxc脏工作区和taste:4310/v0.2.0未更新，未删除知识。Node24/384MiB，重任务串行。

仓库分析从固定Git对象读取compile_commands.json，支持arguments优先或command词法解码，绝不执行命令/展开。提取编译器、标准、仓库内include和定义，保留逐记录来源和问题；无法表达的flags/外部路径/范围外源码显式报告。Console折叠展示候选，无问题时可填入公共构建表单，修改使旧项目选择失效，保存冻结新输入。未自动覆盖用户参数；不同模块的独立构建参数、Make/CMake动态解析仍未实现。格式核对Clang官方JSONCompilationDatabase文档。

2单元、3集成、8架构、类型/Spec、1Console通过。新增数据库fixture必须出现在快照源文件列表，断言同步保留精确完整覆盖。首次浏览器发现填值后textarea嵌套label名称受正文影响，增加明确aria-label后通过；原断言未放宽。证据 /root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/compilation-database，含桌面/窄屏截图，非最终全回归/部署。

真实source-v3 task stage-d82a2b70db7a696fb189fa4fbc370d3cb9ab8116325b8e952f75812f9f72c2cc 已终止 FAILED/AGENT_STAGE_TIMEOUT，PID2369796消失，session30339需读取最终退出结果。累计2calls、17852已报告tokens、reserved152121、247371ms；中断请求未报告用量未知。只完成首卡kv_1312e3b8dc85e3a3a49fd91e“用途与在解析流程中的位置”SOURCE_MATCHED；第二H2“字段语义：type、start、end、size”超时，key8368b4b96f25c11bd9323ab0。正文19381字节、源码12893、逐章观察853、criteria1854；不能声称只因测试观察过大。证据whole-source-v3/WholeSource-attempt-1-timeout.json和Run-attempt-1-timeout.log。source-v2旧任务仍只读，旧记录不重写。无真实来源修订/最终发布。

交接时无模型/构建/浏览器任务运行。下一步检查真实Review超时和角色材料/截止时间，不把超时算通过；若同v3恢复须保留已完成章节及累计用量，先查live进程，禁止重复启动。ReviewAgent.ts的validatedStage显式180000ms，目前未改；来源材料投影缩减后仍超时，需基于请求审计判断后续，不无限盲重试。

完整待办仍包括来源修订和修订后代码/可信固定评测/来源再核验、一键固定门禁与独立工作台发布事务（不能伪造旧RunId）、两目标最终真实链路、完整语言分析边界、编译配置/模块参数、历史快照、最终全回归和网站更新。固定11/11和40/40不等于知识VERIFIED。
