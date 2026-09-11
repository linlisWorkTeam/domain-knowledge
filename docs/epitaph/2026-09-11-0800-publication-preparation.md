# 发布证据准备

工作区 /tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线f07e4aa74a6d352f9a6ad7a42ec6190acc344924。原脏区、旧网站不变，未删知识，目标active。Node24/384MiB，重任务串行。

WorkbenchPublicationEvidence.prepare从端口重读四任务与卡片，校验快照/cardId/moduleId/bodyDigest，再用Domain联合规则校验身份/版本/结果。遍历任务输入/结果、卡片及suite的CAS引用图，验证摘要/大小，JSON递归展开并去重，上限10000引用/128MiB/64层。成功只写PREPARED凭据CAS，publicationVerified=false；重复准备同内容摘要一致，损坏嵌套工件或卡片变化在写入前拒绝。

5定向单元/集成、8架构、类型与Spec通过，证据real-knowledge-revision/publication-preparation。用例为受控内存端口，不冒充真实发布。新增准备服务尚未接入Composition/API/UI；必须继续原始测试和来源报告语义复算、独立SQLite审计/可恢复Markdown发布事务，最终才可VERIFIED。不能直接把PREPARED当发布门禁全部完成。递归扫描针对完整ArtifactRef，原始引用描述与实际工件集合的完整性仍需语义核验确保。

真实source-policy-v1任务 stage-3ac5a7c55407b750e1205020b04657f09b5e4d4590903f6e5592bf3ab3967b48，PID2411792/session82991已再次确认活跃，driver /tmp/RunWholeSourcePolicyV1.ts，日志 /tmp/RealWholeSourcePolicyV1.log。最新观察RUNNING，9章节/1卡片完成，7calls/135117reported tokens/reserved619861/319973ms。尚无整体结果，不重启。完整证据source-policy-v1/WholeSource.json；此时只有首张卡片完成，不能据此来源通过。

后续完整目标仍含真实来源修订后重建/可信固定来源复测，双目标新版一键链路，最终发布，Make/CMake/模块参数，完整TS分析/历史版本选择，全回归与部署。原授权空间不足可删旧知识，但未执行。
