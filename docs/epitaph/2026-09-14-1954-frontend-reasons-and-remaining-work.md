# 前台中文原因与剩余入口问题

目标 active，本轮 progress。独立树 /tmp/domain-knowledge-workbench，原用户树不动。PR50仍Draft，未处理38/50合并，网站尚未更新。c2c2b83已推；CI34839947794本轮见in_progress，不宣称全绿。

c2c2b83实现普通本地目录WORKTREE快照、独立项目设置页、悬停问号、搜索文案、节点职责与中文日志。7目录集成、2入口、4相关Console、1发布提示框、类型和Spec此前通过。本轮补充轮次/节点中文处理原因，原始代码折叠保留，过程message直接展示；更新ProductConsole旧目录标签和已查看的发布截图基线。专项结果见/tmp/ChineseReasonsBrowser2.log，Spec见/tmp/ChineseReasonsSpecs.log。不代表完整Console或部署验证。

重要未完成：RepositoryAnalysis删除生成面板后，KnowledgeGeneration及重建/评测/修订的独立阶段入口在生产页面失去挂载。不要放回用户要求清理的项目设置页。需要结合飞轮批次安排可访问入口，并迁移Console.spec.ts“工作台固定仓库完整流程”7个串行测试；旧测试仍填写源码版本并在项目页面点击阶段操作，不能删行为断言掩盖入口缺失。其余全量回归、部署仍待做。

历史批次与衍生产物删除只有未跟踪的domain/BatchDeletion.ts和unit/BatchDeletion.test.ts（2测试已通过）。没有应用/SQLite/HTTP/确认UI实现。需真实引用/所有权扫描，保留共享产物及源码配置，运行中拒绝，预览和二次确认绑定最新状态，文件/DB崩溃可恢复。未删除用户数据。

真实C新来源585f6ac...执行SUCCEEDED但UNRESOLVED，53节14匹配32未知7矛盾，48calls984624tokens；c-source-assessment-v1/Source.json和307refs审计。后续来源修订stage-05ccb3e4944ad031679afc287e6dea5e45bab418a84d72a2efdbdc61df9217c7本轮确认PID89942不存在，日志终态SUCCEEDED/outcome UNRESOLVED，8calls537550tokens64232ms。/tmp/CSourceAssessmentRevision.log，驱动/tmp/RunCSourceAssessmentRevision.ts，证据c-source-assessment-v1-revision/SourceCorrection.json。不能重复启动或认作门禁通过，下一步检查具体未解决项和修订产物。C++仍旧可信37/37固定40/40、来源39未知，当前引擎完整发布未完成。无主动搜索、降门禁、手改可信测试或无限预算。

当前网站根据上一轮已核实状态仍5c72fa5；本轮未重新访问网站。发布位置/root/projects/domain-knowledge-releases/2026-09-14-workbench-5c72fa5/app，local4310，mvp-console-review与tunnel保留。新部署需重新核对PID/目录/活动任务，独立依赖，备份symlinks=True；旧/tmp/DeployWorkbench5c.py硬编码不可照跑。已获准停止三套cjson旧服务及tunnel并完成，work/ljy保留。完成剩余前台、C/C++真实闭环、线上验证后再依授权比较并处理PR38/50。
