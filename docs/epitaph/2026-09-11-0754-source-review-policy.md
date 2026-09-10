# 来源复核有界期限

工作区 /tmp/domain-knowledge-workbench，feat/five-stage-workbench；基线9ae594d71337840c625dcee63324e57afdca3253。原wxc脏区、taste:4310/v0.2.0未变，未删知识。目标active未完成，Node24/384MiB，重任务串行。

新来源输入冻结 source-review-policy-v1/600000ms；Review仅FINAL_SOURCE_REVIEW和REVISION_SOURCE_REVIEW允许该策略。旧无字段输入和普通Review保留180000ms，旧材料字节不改变。来源修订继承并核对父策略。取消、总预算、供应商/适配器限制、请求和重试次数不变。pipeline-v14采用新策略，旧v13只读；来源顶层仍v4，显式策略及inputDigest区分新输入，不修改旧任务审计。

验证：9定向单元/集成（含实际gcc、旧/新期限、取消和历史起点）、8架构、类型/Spec、1Console桌面/390px通过。证据 real-knowledge-revision/source-policy-v1。实际只读准备对比证明：删除新策略字段后输入与旧v4完全相同，旧task完整未变；未调用模型。新taskId stage-3ac5a7c55407b750e1205020b04657f09b5e4d4590903f6e5592bf3ab3967b48，此记录写入时仅准备，尚未启动。

提交后拟启动 /tmp/RunWholeSourcePolicyV1.ts，无resume参数，日志 /tmp/RealWholeSourcePolicyV1.log；输出 source-policy-v1/WholeSource.json。必须看实际状态，不能把准备当运行。旧0ff633来源任务已FAILED/AGENT_STAGE_TIMEOUT；不要恢复它（保持180秒是兼容性要求）。新任务新身份不继承旧任务计数，旧用量/audit保持不变，同输入恢复仍累计。

当前无活跃重任务。后续检查新真实复核，已知5条历史矛盾不得被模型PASS抹除；完成来源修订后重建及可信/固定/来源复测。仍缺最终联合发布事务、双目标新版完整链路、Make/CMake与模块参数、完整TS分析/历史版本选择、全回归和网站部署。旧C固定11/11、CPP40/40不表示知识已发布。
