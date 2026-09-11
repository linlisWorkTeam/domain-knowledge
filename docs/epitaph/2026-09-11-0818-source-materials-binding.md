# 来源材料与模块身份

/tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线041b7dbe8ec43db3ec3439e381cdc44fc6900e0a。原脏区/旧网站不变，未删知识，目标active；Node24/384MiB重任务串行。

WorkbenchSourcePublication已接project及按源码模块的trustedSets，核验reference.schema/revision/digest和固定模块源码路径/内容摘要，重新执行sourceSectionObservations核验完整直接案例与相关观察投影。CAS合法也不能替代语义对应。14定向测试、8架构、类型/Spec通过。

重要真实发现：card.moduleId是知识单元ID，不等于metadata.sourceModule源码模块ID！此前发布准备只在同名测试夹具通过，真实材料脚本找不到模块。已修复联合证据v2/准备v6：cards.moduleId保留知识单元，用于正文路径/criteria；sourceModules[versionId]独立冻结源码模块，用于Code/测试/项目分组。fixture改成knowledge-unit与module不同值，错sourceModules反例拒绝。该问题未影响已运行来源任务或旧发布，因新准备服务尚未正式接入口。

/tmp/VerifySourcePublicationMaterials.ts修正映射后，实际15个SOURCE_MATCHED章节的原始Review、固定源码及可信观察投影匹配通过，退出0。第一次脚本因混用身份退出1，不能隐去这个发现。证据publication-source-materials/ActualSections.json、VerifyActualMaterials.ts、日志。仍非全部来源或发布通过。

准备仍未接Composition/API/UI，无最终SQLite/Markdown发布事务。后续必须完成可信interface/policy与suite schema、project snapshot identity/分析manifest内容校验，再接最终提交和页面。源码/观察材料及H2覆盖已接好，不用重复拆分实现。卡片知识moduleId与源码moduleId以后必须区分，所有后续模块关联使用sourceModules。

来源task stage-3ac5a7c55407b750e1205020b04657f09b5e4d4590903f6e5592bf3ab3967b48，PID2411792/session82991再次确认活跃，最新RUNNING，25章节/2卡片，总共7卡。driver /tmp/RunWholeSourcePolicyV1.ts，日志 /tmp/RealWholeSourcePolicyV1.log，完整source-policy-v1/WholeSource.json，保持运行不重启。

完整剩余目标：来源修订后新重建/可信固定来源复测，双目标新版一键链路，最终发布，Make/CMake模块参数、TS完整分析/历史选择，全回归和网站部署。
