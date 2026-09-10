# 来源v4保留历史矛盾

/tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线9569d94f6d96c7402cd757d2a61708a0a8dde2c8。完整目标active；Node24/384MiB、重任务串行；原wxc脏文件和taste:4310/v0.2.0保留，未删知识。

真实v3第二次恢复先前超时的字段章节约3.9s成功，后续14.3s成功，但两者把旧v2已指出的同正文矛盾误判SOURCE_MATCHED。已主动取消：stage-d82a2b70db7a696fb189fa4fbc370d3cb9ab8116325b8e952f75812f9f72c2cc，PID2384190消失，session66339待取最终退出码。最终CANCELLED/STAGE_CANCELLED，5calls/67655已报告tokens/reserved381611/350679ms，完成3个章节；v3不能再恢复。证据whole-source-v3/WholeSource-attempt-2-cancelled.json、Run-attempt-2-cancelled.log、StreamDiagnosis.json。不存在本次持续超时证据，第三调用84638ms为主动取消。

明确反例：kv_1312e3b8dc85e3a3a49fd91e正文sha0f9fd8ed...字段语义段仍断言字符串等叶子size未递增；真实固定参考jsmn_parse_members显示keySize=1（report9e768476...），与旧v2纠正一致。v3精确章节case列表为空，丢弃了相关观察上下文；KnownFalsePass.json保留证据，不授权发布。

来源v4 / 来源修订v4 / pipeline-v12：启动冻结同快照/源码/正文的旧明确矛盾，验证旧stage inputDigest、原章节检查点、CAS、Review命令/结果/原输出、规范化纠正与精确H2后继承，originEvidence标记原任务检查点。仅原生意见参与最早稳定选择，继承副本不递归制造新输入。后续PASS不能抹除矛盾；来源修订再次核对冻结证明和原命令后消费。新正文不继承旧正文意见，需重建/评测/复核。v2/v3只读证据可消费，不跨版本恢复。保留精确完整case并增加其他模块参考观察摘要relatedObservations，明确摘要不是完整输入、标签不是事实边界。Console标注沿用的旧矛盾。没有伪造新Review调用或修改旧记录。

20单元/真实gcc受控集成/流程测试通过，覆盖后续模型准备PASS仍保留已知矛盾、无重复Review、历史摘要篡改/版本不符拒绝、继承后DocGen修订与索引恢复；类型/Spec/架构8/Console1通过。实际验收库只读校验5条旧v2意见完整绑定成功，HistoryPreparation.json；未启动模型。证据whole-source-v4。未做最终全回归/部署。

提交后计划 /tmp/RunWholeSourceVerificationV4.ts 启动新v4任务（whole-source-v4/WholeSource.json及Launch.json记录），先查真实进程，禁止重复启动。旧v3最终用量与证据保留，新材料不冒充旧任务恢复。等待完整来源结果再来源修订→新代码/可信固定评测/来源复核。完整待办仍包括最终固定/可信/来源联合发布、一键固定输入、Make/CMake/模块参数、完整语言与历史快照、双目标最终链路/全回归/网站部署。旧固定C11/11、C++40/40不等于知识VERIFIED。
