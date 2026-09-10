<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接整卡来源复核、真实 Code 协议失败和剩余完整验收。
-->
# 整卡来源复核

继续 /tmp/domain-knowledge-workbench / feat/five-stage-workbench，基线 a0c8f96f39291b0e831c1c14f0106002bb469de6；完整目标 active。原 wxc 脏树和旧 taste/4310/v0.2.0 保留。Node24、384MiB，重任务串行。磁盘一度仅141MiB，本次只清理可重新下载的 npm 缓存，可用恢复5.6GiB；没有删除任何知识库或验收证据。

新增 knowledge-source-verification-v1：独立 EVALUATE operation、应用接口、POST /api/v1/source-verifications、Console 整卡来源复核面板。成功的普通原生评测可启动，不要求行为失败。冻结全部卡片正文/版本、源码和配置，固定参考观察独立投影，逐张 Review 全部 H2，包括未修改卡片。Domain 严格校验完整覆盖和正文摘要，返回 SOURCE_MATCHED / SOURCE_MISMATCH / UNRESOLVED，不发布。材料先保存，复用阶段取消/恢复/检查点和下载；summary 保存来源、参考观察、准则及 Review 引用。普通评测查询和 UI 历史选择排除该新 operation。来源匹配不等于 VERIFIED。

验证日志 /tmp/WholeSource{Typecheck,Specs,Domain,Integration,Console}.log；可分享证据 whole-card-source-verification 目录。Domain/架构10通过；Console实际浏览器1通过（初次漏静态模块路由导致加载失败，补路由后通过，未放宽断言），保存桌面/窄屏截图和下载断言；类型与Spec通过。全量集成最终数量以Integration日志/Verification.json为准，交接写入时仍在末尾执行。新增关键实际gcc反例：错误卡片写差而生成代码正确求和，行为测试通过、没有行为修订候选，来源复核仍给出SOURCE_MISMATCH。已有回归断言保留。

最新真实 v5/pipeline-v9 流程 pipeline-26ff040eebfe5415bb550501454d55e5cee41daf860d699830b072279643e8d3，运行副本 /tmp/workbench-revision-acceptance-20260911。第1轮 revision stage-52dd35a89ac21329b528671fb741791737b3f6d7aa844affc31e8c09a89541b9 成功：真实 DocGen 修正 init 为pos0，新版kv_e6b4e5bc59fd9daeed63d586，通过参考观察分离后的真实源码Review并更新索引。坏parser卡kv_76d70f740868291e0a0849be仍未修改/未验证。第2轮 Code stage-15a33088c2339301ec85ca87fafe074a878ebccd1e9973d4a8d27ad5f1a573d5 返回不合法JSON，流程FAILED/DSH_AGENT_OUTPUT_NOT_JSON，PID2239016/session87493终止exit1。11阶段calls/418061reported tokens/reserved1731112；不代表所有调用都是新模型，旧GEN/Code/EVAL仍复用。

证据 real-knowledge-revision/source-subject-v5 已归档 Pipeline-attempt-1-code-protocol-failure.json、Run-attempt-1-code-protocol-failure.log、Code-attempt-1-invalid-response.txt、CodeProtocolFailure.json。真实SDK assistant回复11835bytes，SHA636618663b6b9a23b09a9eb424cde5710dc6010a8ee49b31549922aec3eb11e8，JSON结尾多一个右花括号；不是超时/截断的证据。没有手工修补/晋升该输出，没有放宽模型协议和请求上限。InitSourceReviewPassed.json记录成功修订及仍坏的parser卡。0521对0509错误超时归因的更正仍有效，不能再说旧次DocGen重试超时。

可在提交及回归通过后，用 /tmp/RunRevisionAcceptanceV5.ts 加上述pipelineId显式恢复原v9任务，沿用历史预算和成功结果；先确认进程及 ResumeLaunch，不能重复启动。交接写入时尚未恢复；实际状态以追加证据为准。新整卡操作没有改v9执行语义，原流程可以同契约恢复。

仍须完成：来源意见驱动的明确H2修订及再索引/重建/评测（不能伪造行为失败），整卡复核进入一键流程，固定/可信行为与来源一致性共同发布门禁和独立工作台事务；TS共同边界与markdownLite最终回归、构建参数/多项目旧快照缺项、双目标最终真实链路和浏览器部署验收。不得用虚构旧Run调用repository.publish。仅独立整卡复核不算这些剩余目标完成。
