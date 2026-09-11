# 摘要绑定修复与实际浏览器验收

实际工作树/tmp/domain-knowledge-workbench，feat/five-stage-workbench，Node24/384MiB；原工作树及v0.2.0旧站保持。目标active，尚未部署。实现b722198、d3da9c199cfac09fbcc7a4a75b06d3743a368418。

SourceEvidenceBindings新增source-evidence-bindings-v1冻结policy，显式提供项目清单sourceDigest与sourceFiles工件摘要，publication重算并要求一致。旧任务无policy恢复不改变材料。实际只读CAS审计确认jsmn.h正文哈希c045...与仓库清单5cb5...各自匹配，不是来源冲突；旧UNRESOLVED不改判。13项防篡改/兼容测试、2项真实原生评测修订集成、8项架构、type/Spec通过。证据real-knowledge-revision/source-digest-clarification含脚本、ActualBindings.json及logs。

来源task stage-3ac5a7c55407b750e1205020b04657f09b5e4d4590903f6e5592bf3ab3967b48结束SUCCEEDED/UNRESOLVED，49calls/1162775tokens/4040365ms，7卡2MISMATCH、4UNRESOLVED、1MATCHED。PID2451866已结束，旧session24433无需再等待。source-policy-v1/WholeSource.json和/tmp/RealWholeSourcePolicyV1-attempt2.log完整保留。不得发布或自动PASS。准备了/tmp/RunSourceCorrectionAfterPolicy.ts（尚未启动）：对上述source task调用workbenchSourceRevision.start，输出source-correction-after-policy-v1/SourceCorrection.json；只修正已有明确MISMATCH，其余风险保留。先完成下面回归，再串行启动该真实模型任务，不与浏览器/编译争内存。需检查版本是否仍latest，失败保留真实原因。

真实gcc双C模块固定用例test已执行通过：WP_TEST_NATIVE_MODULE_BUILDS=1 node --test tests/integration/ModuleBuilds.test.ts，/tmp/NativeModuleBuildsActual.log。指纹仍受控fixture，不能称真实指纹验证。

完整Console新tests/e2e/WorkbenchPublication.spec.ts首次失败暴露App下载白名单漏workbench-publications；d3da9c1修复并更新评测旧文案。重跑1PASS，匿名发布、cards/card.md下载、刷新历史、390px无溢出均实测。截图已查看；模型证据来自受控fixture，不是真实发布。real-knowledge-revision/publication-browser-actual保留首次失败trace/error-context/log和成功截图/log。

当前全量npm test正在运行，session58450，/tmp/WorkbenchFullRegressionCurrent.log，Node24/384MiB，尚未得到最终结果（已通过多个原模块flywheel案例）。必须接着poll最终结果，若失败修复不放宽断言。结束后串行运行npm run test:ui（37个test定义，不是已通过数量），检查截图差异。最新Spec日志/tmp/WorkbenchCurrentSpecs.log通过。其后运行上述真实SourceCorrection脚本，继续修订→增量索引→新Code→可信/固定→完整source→publication。两个真实目标完整一键/分步、最终关联截图、全回归报告与当前网站部署仍未交付。原范围以Status矩阵及0855为准，不扩充任意TS生成或任意动态Make构建。
