<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：更正真实超时阶段判断，交接参考观察分离和后续真实验收。
-->
# 参考观察分离与交接更正

继续 /tmp/domain-knowledge-workbench，feat/five-stage-workbench；基线 e3b09c1fd26e94f54a9cdc9e6f57075abe4b8ea9。完整目标active，未完成。原wxc脏树及taste/4310/v0.2.0未改，仅原树加指针。Node24/384MiB，重任务串行，磁盘约160MiB，未删旧知识。

重要更正：0509交接以及当时部分commentary误把第一次超时说成DocGen两次尝试。完整日志/检查点证明 DocGen 一次成功，耗时65656ms；随后独立源码Review 179991ms后超时。原pipeline-2fa905c1ace72c9beb46d18f47c58ad3c6ba04c3eb0d8ba9833e0a3e98d9d7c1的role:doc-gen:kv_d285bb9b21f81f726735d804成功检查点在第一次失败时已经存在。5次阶段调用=受控首Code1+初始Review2+DocGen1+源码Review1，不是DocGen重试。没有被拒绝DocGen原输出的证据。已向用户更正；原交接不改写，HistoryEpitaph和Attempt1StageCorrection.json记录更正。

e3b09c1新增的角色失败尝试审计仍有效、已测试，但实际恢复调用的是源码Review，复用了DocGen。恢复进程2230705/会话1763累计从5calls/165234reported tokens继续；源码Review返回ITERATE/UNRESOLVED，以旧生成实现pos=1的执行结果为由拒绝已写明pos=0的草稿。草稿sha ee9ce7a937d2a0775fdc761a542e680ffd5b6bbb9bca195ca0430e13a228e972，与固定jsmn_init源码pos=0一致。我们把整个旧生成评测报告提供给了“源码一致性”Review，导致观察对象混淆。不是用手工PASS覆盖风险，而是修正材料类型。后续另一卡片Review运行时主动取消，进程已退出1，最终CANCELLED，7阶段calls/203043reported tokens；取消请求未报告用量不能算0。没有新版本提交/新Code。

source-review-v4目录保留Pipeline-attempt-1-timeout.json、ProviderAudit-attempt-1.json、Pipeline-attempt-2-cancelled.json、Run-attempt-2-cancelled.log、Attempt1StageCorrection.json、SourceReviewSubjectMixing.json。UnchangedCardTruthGap仍成立：坏parse卡片kv_76d70f740868291e0a0849be被初始归因Review错误PASS/UNCHANGED，仍待最终来源一致性检查，不能发布。

本次修改 revision-v5 / pipeline-v9。Domain sourceReviewObservations先用真实suite/oracle重算全部参考观察通过，拒绝错误或缺少观察，再只投影本次授权H2的caseIds。报告native-source-review-evidence-v1明确observedImplementation=PINNED_REFERENCE，保留实际参考观察、原始suite/oracle引用与源码快照；不从expected合成actual。源码Review不再接收旧生成实现的失败报告。旧报告仍在原EVAL及归因/DocGen证据里，不删除、不改可信预期、不过滤模型风险。调用前revision-source-materials检查点保存最终草稿/源码/准则/参考观察，超时或取消仍可下载确切输入。旧v4/v8只读；这次材料契约改变不能跨版本恢复。180秒Review与240秒DocGen限制未改。

验证：typecheck、Spec、架构8通过；相关Domain/修订/协调14项、Console2项通过。最后材料检查点改动后补验类型、Spec与Domain/实际gcc修订6项通过。断言固定参考sum=7被提供，旧生成sum=-1不进入源码Review；参考观察冒充PASSED但值错误仍拒绝，未知caseId也拒绝。验证模型调用前输入已经持久化。此次没有运行全208集成，最近全208基线为e3b09c1；不要将定向测试说成新版本完整回归。

下一真实执行已准备 /tmp/RunRevisionAcceptanceV5.ts，目录 real-knowledge-revision/source-subject-v5。复制原v4 Stimulus，保留同7张卡片/同人工init故障和原Code/EVAL缓存；prepare保留旧acceptanceStimulus字符串以复用GEN交接，契约v9创建新流程。PreviousExecution.json保存老流程及历史7calls/203043tokens，provider累计预算仍在同runtime。这是新契约验证，不是跨版本resume。交接写入时尚未启动；提交后计划启动，是否已启动以新目录RunLaunch及现有进程为准，不能重复启动。

后续必须补齐所有冻结卡片的最终来源复核与固定/可信行为发布门禁，包括未修改卡片；当前只检查修改后的H2。不能把源文错误伪造为行为失败以套旧入口；需要明确来源意见驱动的定点修订和再评测。旧repository.publish会更新旧runs，需独立工作台凭据/事务再复用本地发布端口。TS共同边界/markdownLite最终回归、构建参数缺项、多项目旧快照范围、双目标最终真实运行、浏览器及网站部署仍未完成。保持完整goal active。
