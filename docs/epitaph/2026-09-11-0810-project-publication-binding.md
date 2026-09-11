# 项目与构建发布绑定

/tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线aa2c1a7827aa3390ca97d79805a66ccf3a9ed223。原脏区/旧网站不变，未删知识，目标active；Node24/384MiB重任务串行。

发布准备v3增加必须的projects:Pick<WorkbenchProjectStore,get>端口。检查项目/快照/commit/sourceDigest，固定报告manifestRef对应project.manifestRef；参考manifest逐源文件路径/摘要完整对应project.sourceFiles(kind=source)，参考和生成buildConstraints与project.build一致且sanitizers=true。项目快照及引用纳入准备凭据/CAS扫描。11定向单元/集成、8架构、类型/Spec通过。

实际只读 /tmp/VerifyPublicationProjectBindings.ts 用两目标真实可信报告检查参考文件/构建参数/启用sanitizers均通过，C31、CPP37原始观察仍通过、失败副本仍拒绝。无模型/编译调用，脚本已退出0。证据publication-project-binding/ActualReports.json与日志。不是完整prepare真实成功，来源尚未通过。

下一步仍需可信interface/policy绑定与suite schema复验；项目snapshot身份重算和分析manifest内容与sourceFiles/objectId核对可进一步补齐（当前对持久化project及manifestRef绑定，不伪称全字段验证）。来源原始Review必须按正文全部H2、原criteria/ref/result复算并检查完整覆盖，然后接SQLite/可恢复Markdown发布事务、Composition/API/UI。生成/参考构建约束已校验，不用重复实现。PREPARED不是VERIFIED。

来源新任务stage-3ac5a7c55407b750e1205020b04657f09b5e4d4590903f6e5592bf3ab3967b48，PID2411792/session82991本轮再确认活跃，最新RUNNING，21章节/2卡片，总共7卡片。driver /tmp/RunWholeSourcePolicyV1.ts，日志 /tmp/RealWholeSourcePolicyV1.log，完整证据source-policy-v1/WholeSource.json，不重启。来源修订需等待整任务结果，不能把部分卡片完成当整体通过。

完整剩余目标仍含来源修订后新重建/可信固定来源复测，双目标新版完整一键链路、最终发布、Make/CMake模块参数、TS完整分析/历史选择、全回归和网站部署。
