# 冻结来源判断策略，真实 C 复核已进入模型

目标active，本轮progress。工作树/tmp/domain-knowledge-workbench，原用户树不动。77f8ab6已推PR50，Draft；未合入/关闭38或50。网站仍5c72fa5，健康200，线上尚无完整真实C/C++验收。

用户明确允许停止cjson-real、cjson-v10、cjson-v12 Console及各自tunnel，六套session和全部已记录子进程已退出。保留work、ljy、mvp-console-review、mvp-console-tunnel，不删除任何数据。1904中的等待授权已经过时。可用内存约1.1GiB。

dd7fa6e新增模块批次冻结execution配置：固定测试上传/下载、scope entryPath/astFilter/symbols、指定材料、轮次传递；列表只摘要。16相关后端、2浏览器通过，类型/Spec通过。未部署。原项目仍Git/已跟踪源码，任意非Git目录和全部文件语义仍缺。

6bca000冻结sourceAssessmentPolicy=source-assessment-v1，新来源和来源修订criteria继承，同版本恢复不改变旧prompt。普通Review的effectivePrompt和用户附加保留，来源专用指令澄清checkReportRef固定源码/evaluationReportRef参考观察；静态事实不要求逐节行为测试，实际覆盖声明仍需实测，范围外事项和publicationVerified=false不自动判编译失败。既有矛盾、未知及发布门禁保留。18相关测试、typecheck、Spec通过，日志/tmp/SourceAssessmentTests.log、Types.log、Specs.log。CI34837653415为6bca000，最后见in_progress，dd7fa6e CI被新提交取消；不宣称新HEAD全绿。

真实C准备暴露旧Review命令缺executionContract，导致历史矛盾校验失败。77f8ab6增加sourceHistoryCommandView，仅v2/v3/v4、无assessment策略、恰四个来源引用的旧Review适配当前schema校验；不修改CAS/命令/摘要，授权仍原始命令。只用于历史矛盾保留和修订，发布PASS没有兼容旁路。来源修订从真正originTask读取版本，继承纠正不能清除。8测试（四种原生集成+四领域）通过，/tmp/SourceHistoryCompatibilityTests2.log；类型Types2.log和Spec通过。首轮因遗漏import失败，已修正后全量重跑，未改断言。

真实C来源stage-585f6ac07abad91ace514de4b94f7273e8d73a6ebe5443396b5efe4eccab0bdd正在运行：父可信0187ebe80e13b2637b63bf5d33f9a84662b8a68619029981ec41b409daa2b3d6，原7卡不变。PID60768、exec session5566；/tmp/RunCSourceAssessmentV1.ts，日志/tmp/CSourceAssessmentV1ResumePreparation.log，证据real-knowledge-revision/c-source-assessment-v1/Source.json。19秒快照4calls53970tokens，首节SOURCE_MATCHED；尚未最终结果或工件审计。用Node24、heap384，配置来自原验收runtime，不需要.env.local；最初带不存在env文件未启动，随后旧证据失败也未创建任务。现在必须先检查PID/日志，活着就继续观察，不重开重复任务；终止后才按同taskId恢复。runtime=/tmp/workbench-revision-acceptance-20260911。早期/tmp/CSourceAssessmentV1.log是失败旧日志，不要误判当前进程。

后续先观察C来源；明确矛盾走原修订并重建评测，未知按证据处理，不手改卡片和测试。C++仍旧v11可信37/37固定40/40但来源39未知，当前引擎闭环还未完成。所有原编号见1904/1857和WorkbenchAcceptance。全量真实验收、任意项目目录、最终部署和线上一键/分步验证后再比较合入PR38/50。PR正文/tmp/WorkbenchPr50Current.md已更新批次配置与来源策略，后续需补当前运行结果和77f8ab6验证。
