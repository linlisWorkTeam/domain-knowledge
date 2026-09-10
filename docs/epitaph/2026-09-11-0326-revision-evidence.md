<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接可信失败的修订依据查询与后续自动修订入口约束。
-->
# 可信失败的修订依据

继续在/tmp/domain-knowledge-workbench，feat/five-stage-workbench；本轮基线a46a2d7b7bf30edd53d588034f8c077fb7569b52。完整目标active，未完成。原wxc、线上taste/4310及v0.2.0未改；Node24/384MiB，测试/浏览器串行。本轮无真实模型请求、无真实目标重新编译。所有测试和浏览器进程已terminal。磁盘约237MiB，未删除旧知识。上一轮真实双目标编号见0316交接，仍保持jsmn31/31、Tiny37/37；不冒充已通过最终发布门禁。

新增Domain NativeRevisionEvidence.ts，native-revision-evidence-v1：TRUSTED状态仍需原始suite+oracle重新计算通过；评测case输入必须与原suite完全一致，防止替换预期。按稳定cardId绑定正文sha及精确H2，只有FAILED+NATIVE_BEHAVIOR_MISMATCH+非空actual且重算观察差异确实非空，才产生Review候选。编译/运行故障、矛盾状态、旧版章节、重名/删除的H2保留unresolved。候选带cardId/versionId/bodyDigest/sections{text,heading,sectionId,caseIds}，knowledgeErrorProven=false、revisionAuthorized=false；不会直接改正文。全通过为NO_BEHAVIOR_REVISION_REQUIRED。元数据版本变化但正文未变不要求重新生成测试，不过旧sectionBindings不授权修订新版本。

WorkbenchEvaluation.revisionEvidence(taskId)仅读取SUCCEEDED EVALUATE，验证上游重建结果摘要、测试集项目/源码版本、CAS及正文；返回每模块参考/suite/报告引用和上述候选。新增GET /api/v1/native-evaluations/:taskId/revision-evidence，只读，无CAS写入、任务改写或模型执行。未完成评测、参考不可信或绑定失配409。Console「查看修订依据」按需调用，显示章节/用例、历史定位问题、编译问题和全通过空结果，支持打开绑定版本。没有改变执行契约、pipeline-v3或NativeFingerprint任何引擎文件。

验证：typecheck/Spec通过，architecture8/domain60/integration203/Console30全过，不改视觉基线/原断言。定向测试4过（其中真实gcc+受控模型的生成减法错误定位到正确版本，不能宣称知识错）；错误候选、参考冲突、旧章节、重复/删除标题、正文篡改均覆盖。Console验证失败章节显示；真实已有jsmn和Tiny运行GET均返回0候选，调用前后整个stage列表逐字相等，无新增模型请求；匿名访问、桌面、390窄屏通过。证据/root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/revision-evidence/含Verification.json、全部日志、真实空结果截图及Controlled-*失败页面截图。临时复现脚本/tmp/RevisionEvidenceBrowser.ts，server.close自动关闭composition，勿再次close。

下一步必须真正接通Review/DocGen定点修订，当前只是输入证据基础，不要把查询误称自动修订。使用已有WorkbenchRoleExecution/ReviewAgentContract/DocGenRevision。Review只能对候选现有H2提出correction，不能因为可信失败就假定知识错误；本轮受控例子知识已准确描述加法，实际是Code生成减法，所以应允许Review不修订知识并保留代码问题。禁止把隐藏测试或参考实现给Code。若需要再次重建同知识，应显式版本化的新尝试，避免成功接口检查的坏行为代码被缓存永远复用；预算和历史仍保留。

建议实际修订执行独立冻结evaluationTaskId/evidence摘要/卡片版本/配置，以同阶段操作参数明确区分重建与知识修订，不能让现有全局latest FLY面板误选修订任务。DocGen corrections携带可信evidenceRefs+baseKnowledgeRef，沿用现有无损H2装配；新卡片保留cardId，ingestCandidate相同正文幂等，原正文和可信预期不改。修订后先刷新对应索引，再重建；可以抽取KnowledgeIndexService共享buildInput边界，别伪造context.task来绕过阶段校验，也别持有单执行槽等待另一个阶段造成死锁。新多轮pipeline需版本化迭代历史，不能覆盖v3固定children；统计每轮真实用量，避免把继承用量与原任务重复求和。不恢复固定三轮总上限，连续无有效进展、额度耗尽、取消等显式暂停。

仍欠最终发布门禁、TS统一边界/markdownLite最终回归、构建参数落地、项目范围面板/Stage评测血缘、真正含修订的双目标闭环及网站更新。经典卡片详情缺Stage投影、下方独立面板全局latest等已知问题尚在。保持完整目标active，继续实现而不是等待用户再次确认已授权范围。
