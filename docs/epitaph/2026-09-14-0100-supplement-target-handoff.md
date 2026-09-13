# 补证策略冻结、反馈和页面交接

工作树/tmp/domain-knowledge-workbench，基线ce81da2，上一轮是已提交实现的progress，本轮继续目标。读0052交接；未调用模型或重部署。线上仍dc3dbf8/v17，未声称新检查已上线。

WorkbenchEvaluation.prepare为新补证输入冻结supplementTargets（native-supplement-targets-v1），在evaluate与原来源需求完整比对并按模块交给NativeSuiteEvaluation。原同输入legacy任务存在时保留原身份/策略，不重新创建任务重置预算；未提供跨策略预算迁移。拒绝报告targetCoverage持久化，恢复给TestGen完整缺口反馈；成功模块与缓存读取保存目标定位报告。旧策略prompt保持原字串，新策略增加不把元数据/来源用行为测试伪证明的要求。页面显示引用命中/未命中与零命中不执行，semanticCoverageProven永不自动true。

测试更新：原WorkbenchEvaluation三场景保留原断言，混合风险新增零命中拒绝、报告缺口、同任务start不换身份、close/recreate后恢复、累计modelCalls+1/tokens+5、成功复用1+新增1。新增页面测试展示旧31保留/候选不执行/缺口与恢复入口。当前最终/tmp/WorkbenchTargetRecoveryRetry.log 3/3（37346ms）；最初两轮/tmp/WorkbenchTargetApplication.log和WorkbenchTargetRecovery.log各2/3，失败发生在旧链路重建PAUSED或lucky.result空，未记录reason；新增断言输出reason后重跑全通过，没有放宽原断言。尚不能把初次问题归因资源或宣布修复。

/tmp/WorkbenchTargetContracts.log架构8+一键来源7+页面1共16/16通过，typecheck、Spec、diff check通过。浏览器首次/tmp/WorkbenchTargetBrowser.log在已有30秒总时限末尾的supplement poll超时，错误页面实际已显示评测完成与新目标提示；当时同时执行轻量契约测试。未放宽超时，随后单独重跑/tmp/WorkbenchTargetBrowserSerial.log，需记录终态。全Console和本轮完整Node回归仍未跑；494通过只对应3b83基线。

后续：确认浏览器最终结果；旧真实f1补证不可静默升级新策略。可先依据真实source51992明确SOURCE_MISMATCH继续授权章节修订，产生实际变更的输入后执行新版重建/可信/固定/来源/目标补证；保留原31可信期望，source未知不能伪清除，旧f1反例保持未晋升。若确需旧任务跨策略重试，先设计明确迁移及累计预算转移，不能新建同输入绕预算。继续TinyXML2当前XMLUtil真实闭环、v17一键与分步、所有回归/报告/最终部署。无模型重任务在跑，网站原服务/tunnel保留。

浏览器串行重跑终态：/tmp/WorkbenchTargetBrowserSerial.log 1/1通过，测试22.7s/总30.4s，保持原30秒单测试上限。截图在test-results既有补证desktop/mobile路径；无需再次等待58207。当前无测试运行。
