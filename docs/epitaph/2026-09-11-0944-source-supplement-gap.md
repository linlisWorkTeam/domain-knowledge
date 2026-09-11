# 原生混合风险通过与补充测试缺口

实际/tmp/domain-knowledge-workbench，feat/five-stage-workbench，功能ef4b3d5/504ac15，最新设计d324b7adc78da01782dc63a7b779b96be1769943。Node24/384MiB，旧站原树保持，目标active。

真实source stage-826fed86bba18a7aa3b75ead348d503aac5181395798f5f4a1d341194f734bd4已SUCCEEDED/UNRESOLVED，44calls/842651tokens/1054423ms，session32339退出0、PID2522760结束。5卡SOURCE_MISMATCH（1312、2071、5a34、8c9a、e6b4），2卡UNRESOLVED（64a8错误码缺tokens=NULL错误组合路径直接案例；6a18续解析需求待确认且跨节定位）。完整Source.json/script/log在source-after-correction-bindings-v1，不再等待旧handle。

模型结束后实际执行WorkbenchEvaluation.test.ts：三场景3/3通过、32528ms，/tmp/MixedApplicationActual.log，覆盖旧false/true sourceReject与新mixed；不是只有typecheck。随后Console.spec.ts筛选“操作中心从固定 Git|已完成的一键流程”2/2通过，/tmp/MixedPipelineBrowserActual.log。log已保存mixed-source-pipeline。全部测试断言保留，最终全套尚需在剩余功能完成后跑，480/32仍旧基线。

已启动新真实修订/tmp/RunSourceCorrectionSelectionV1.ts，stage-c32fbb4e24f9f30e81d03a2aa45623f08ef5a834e5a2b29252c157e07fe0be7c，PID2550876/session87129，/tmp/SourceCorrectionSelectionV1.log，输出real-knowledge-revision/source-correction-selection-v1/SourceCorrection.json。已RUNNING；使用最新完成826fed输入及source-correction-selection-v1，不对旧版本强制修订。继续poll同handle，重资源串行。

关键新缺口（不是可选扩展）：NativeSuiteEvaluation.prepare第74行左右 `inherited.length ? null : await input.propose()` 导致有可信库后永不新增用例。当前source64a8明确要求tokens=NULL的INVAL/PART和括号组合行为证据，仅重验旧31例无法补齐。d324b7a在Workbench Spec末节“来源缺证据的补充测试（待实现）”写了目标与边界，尚无实现。下一步可在模型运行时做轻量代码实现：显式补充模式绑定成功source任务的未知cardId#H2、同版本Code/接口/源/工具链/配置；TestGen生成新增例，先守住旧可信参考门禁，再单独验证新候选，仅全通过且不覆盖旧expected才合并。普通prepare不变；新候选失败不可因reused>0误标旧可信冲突（WorkbenchEvaluation现在用该判断）。冻结需求摘要/新执行契约与成功复用/预算恢复必须齐全。

还需HTTP/Console“补充验证用例”无需JSON入口和一键自动补证。一键优先明确修订，纯未知才补例；按未知章节集合是否减少控制连续无进展，不靠新随机caseId重置。完整来源不通过仍禁止关联/发布。不得把源代码可证明但缺测试的未知风险直接改PASS，不改旧可信预期或删除风险。可扩展NativeSuiteEvaluation显式supplement mode，先区分历史门禁失败与候选拒绝，再结合Domain nativeTrustedGates合并。现有所有可信复用断言保留。

后续真实修订结果仍需新重建/可信固定/来源；最终jsmn与TinyXML2双目标一键/分步完整真实编号、关联截图、报告/当前网站部署均未交付。不要以受控测试或旧31/11通过完成goal。
