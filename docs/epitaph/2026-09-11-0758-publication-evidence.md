# 联合发布证据规则

/tmp/domain-knowledge-workbench，feat/five-stage-workbench；基线fb3f28b8d2949af64da2303abef9b2bd477992d5。原脏工作区/旧网站不变，目标active，未删知识。重模型/构建任务串行，Node24/384MiB。

新增Domain WorkbenchPublication.publicationEvidence：四成功阶段身份/完整版本/源码/配置/快照一致，两类测试绑定同Code结果摘要，来源绑定可信评测摘要；模块/卡片/正文覆盖、固定suite、非零全通过用例检查。返回不可变内容摘要凭据和publicationVerified=false，不改变发布状态。3单元测试覆盖跨版本拼接、改源码/配置/代码/正文/suite、失败状态/计数/模块遗漏等；8架构、Spec、类型通过。证据real-knowledge-revision/publication-evidence。

此规则尚未接入Application或HTTP/UI，不得宣称已完成联合发布。下一步Application重读四任务及卡片，校验CAS/原始测试与来源报告，然后执行独立SQLite发布审计与可恢复Markdown工件事务；不能借用旧Flywheel的runId或只凭该Domain凭据授予VERIFIED。现有pipeline仍v14，没有因新增未接入规则升版。

真实来源策略task stage-3ac5a7c55407b750e1205020b04657f09b5e4d4590903f6e5592bf3ab3967b48 在本轮确认PID2411792仍活跃，session82991；driver /tmp/RunWholeSourcePolicyV1.ts，日志 /tmp/RealWholeSourcePolicyV1.log。已观察6章节完成，3条历史MISMATCH保留，3新MATCHED；此前超时的接口契约章节已成功完成。尚无整个任务结论。看source-policy-v1/WholeSource.json与进程，不重复启动。来源进度副本在publication-evidence/SourceProgress.json。

后续仍需来源修订→新重建/可信/固定/来源复测，双目标新版一键真实链路、最终发布、Make/CMake与模块参数、TS完整分析/历史选择、全回归和部署。旧C11/11、CPP40/40固定通过不足以发布。
