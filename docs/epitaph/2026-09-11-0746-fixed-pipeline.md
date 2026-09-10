# 一键固定用例与来源超时诊断

/tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线a051b44aeb918c6a6956a26613a1d86a540254ae。目标active未完成，原wxc脏工作区和taste:4310/v0.2.0未更新，未删知识。Node24/384MiB、重任务串行。

pipeline-v13接通可选fixedSuites：启动同步序列化冻结全部用例到CAS，纳入流程身份。每轮可信行为通过后复用WorkbenchFixedEvaluation，固定失败停在EVALUATE，不来源核验/修订/关联；取消/重启恢复沿用固定子任务，全部用量与详情纳入历史。更改用例创建新流程，旧预期不改。选用固定用例必须覆盖全部模块（固定阶段本身校验），Console按模块上传、显示轮次状态和下载；缺固定用例明确不具备最终发布条件。旧v12只读。

RunNativeWorkbench.ts验收报告v3：两种模式都绑定Targets固定suite SHA/count，pipeline启动提供固定输入；恢复核对同一fixture，成功时再次检查固定子任务；steps也执行固定阶段后才来源/关联。尚未运行新版真实pipeline，最终独立发布事务仍未实现。

14流程单元/集成通过，最终纯Domain5项复核；3仓库分析集成；8架构、类型/Spec、1Console通过（上传和API冻结，行为失败前未触发固定步骤）。固定阶段内部gcc此前独立验证通过，本轮协调器是受控替身，不冒充新真实评测。证据fixed-pipeline含日志和pipeline-mobile截图。

修复无compile_commands时返回buildCandidates=[]改变旧manifest的问题：空可选字段省略。实际重新创建jsmn和tinyxml2输入均与旧真实Code快照ID完全相同，SnapshotReuse.log记录，避免只因空分析元数据重复生成全部知识。

source-v4 task stage-0ff6339060e2673a8aac783b2a89ffdfea1b1bb4a6ed94f399613a057f59f956 已FAILED/AGENT_STAGE_TIMEOUT，PID2394039消失，session20639最终退出1。2calls/17534已报告tokens/reserved178601/184123ms，完成3章节（首MATCHED、2历史MISMATCH继承），无完整卡片完成。证据whole-source-v4/WholeSource-attempt-1-timeout.json、Run-attempt-1-timeout.log、StreamDiagnosis.json。

本次诊断已明确：失败请求首包约3531ms，最后数据179976ms，接收1176793字节/4913帧，reasoning字段56875 UTF16字符、最终content=0。到180秒时仍持续输出，不是网络停顿；未报告tokens仍未知，不能用字符估算为实际用量。上一请求3.8秒成功。

下一步基于该证据调整来源Review有界期限：建议新任务冻结显式版本化sourceReviewPolicy（例如source-review-policy-v1，最长600000ms，与现有适配器600000ms边界协调），通过criteria受信材料由Domain Review选择限定期限。旧v4无该字段必须保持180000ms及原材料，不跨输入恢复或篡改旧截止时间；改变策略产生新任务身份，旧预算审计保留。先读ReviewAgent.ts、StageValidation.ts、StageModelConfiguration policy，确保取消/额度/总预算仍有效。不应继续盲重试180秒或把超时当通过，也不能放宽质量门禁。

交接时无模型/构建/浏览器任务运行。完整待办：真实来源修订→新版本重建/可信固定评测/再来源核验，双目标新版完整一键链路、最终联合发布事务、Make/CMake/模块参数、完整语言和历史快照、最终全回归与网站更新。旧固定C11/11、C++40/40通过但不授予知识VERIFIED。
