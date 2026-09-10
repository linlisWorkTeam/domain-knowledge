<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接 v4 自动迭代协调、真实产物重放和剩余验收。
-->
# 自动迭代协调

继续 /tmp/domain-knowledge-workbench、feat/five-stage-workbench；本轮基线 73848161ea22574a1c194369db508ab75628201b。完整 goal「继续」仍 active，未完成。原 wxc 脏树、taste/4310 及 v0.2.0 未改；只向原树增加指针。Node24/384MiB，重验证全部串行，本轮任务均已 terminal。磁盘约200MiB，未删旧知识。本轮没有新增真实模型调用。

knowledge-pipeline-v4 保存 iterations：每轮 versionIds、reconstruction/evaluation/revision 冻结任务和 progress。children 仅是当前阶段别名，activeTaskId 指向实际任务（含修订）。详情和累计用量按全部唯一任务去重。GEN/INDEX 一次；行为失败→Review/DocGen 共享独立用例→质量/索引成功→新 Code/EVAL；通过后关联。质量拒绝、未解决证据、资源或额度失败停止；成功阶段不算发布。旧 v3 及更早只读，不跨契约恢复。

Domain pipelineStagnant 用历史最佳失败集合：严格子集才重置计数，连续三次不改善暂停 PIPELINE_NO_BEHAVIOR_PROGRESS。退步后回到旧水平不算新进展。没有三轮总上限；控制测试六轮成功。WorkbenchEvaluation.progress 重新比较实际观察，失败身份只绑定模块、变量、调用、观察和预期，忽略 caseId/description/sections。只改正文或相似度不会绕过暂停；原流程恢复不清历史。

重建可选 retryEvaluationTaskId，冻结 native-reconstruction-retry-v1 与原评测输入/结果摘要。同项目/源码/配置/稳定卡片集合、原评测成功完成且行为失败才允许；版本可以修订。参数进入代码复用键，防止上一轮坏行为代码被缓存复用。Code 仍只看知识/接口/构建，不收到重试标识或隐藏报告。HTTP 冲突409。Review PASS 返回 NO_REVISION 时无需修改卡片，也可新 Code 尝试；独立面板新增「重新生成代码」。

取消传播至 activeTaskId，不再误取消已完成的 FLY 代码别名。轮次子任务先持久化再执行，进程重启后同输入恢复。Console 按 children 显示当前摘要，单列历史轮次，通过「查看第 N 轮评测」联动重建/EVAL/修订面板；旧契约缺 children 的历史摘要仍可读取。UI/HTTP/Domain Spec、GettingStarted 和集中 Mermaid 已更新。

验证：typecheck、Spec、架构8、Domain64、integration206、Console30全通过，原断言未放宽。新增协调集成：六轮进展成功、四次评测无改善暂停且恢复不耗新用量、修订中取消后重启续跑。实际 gcc 集成在原有修订/索引恢复测试中增加受控生成交接：正确卡片→受控错误 Code→真实可信失败→Review PASS不改卡片→第二次 Code调用→原可信用例通过→关联；DocGen未调用，旧预期不变，同重试幂等，成功评测不能作为失败重试依据。此为受控模型测试，不是实际 provider 修订验收。初次受控 Review 样例漏 correction:null 被协议正确拒绝，补齐样例后通过。

真实 runtime /tmp/workbench-native-acceptance-20260910 用 v4 重放已完成真实阶段：
- jsmn pipeline-aa5a9b779b8b2bb7ec89a863f0c0229da8e870c0d78d0d644cce0a181f782fed，31/31，45关系（保留README材料）；
- Tiny pipeline-72d4d3258a92ddac16aa3a5e5933a6ed8cd15bd28314c371161921fa93e34b4a，37/37，0关系（无外部材料）。
两者 tasks 集合与 source-comparison 原报告完全相同，新增模型调用0；不是新模型重建或知识修订。均 BEHAVIOR_PASSED_PUBLICATION_PENDING。原生引擎文件未改。固定源码仍在 /tmp/workbench-reference-inputs，Targets.json 摘要未改。

证据 /root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/automatic-iterations：Verification.json、全部日志、两目标报告、Controlled-*截图、Live-iterations桌面/窄屏截图。/tmp/AutomaticIterationBrowser.ts 在真实匿名服务读取两目标v4详情，展开Tiny轮次并选择37/37评测，页面错误0/横向溢出false/任务列表完全不变。真实修订仍需另外验收。

下一步优先完成真实 provider 修订验收，再处理最终发布门禁。可按0346交接在独立runtime副本做明确故障注入，保留jsmn/Tiny固定提交及原可信套件，Review/DocGen/后续Code走真实provider；不要把人工故障称为模型自然错误，不删改可信预期。现有目标全通过，直接startRevision只会409；新一键流程若复用旧生成卡片而当前头已手动修订，会在INDEX_VERSION_NOT_CURRENT停止，当前版本选择仍需明确接通，不能强行回写旧头。

尚欠固定发布门禁、最终Review与来源尾注确定性装配绑定（0346详述）、TS共同边界/markdownLite最终验收、构建参数实际应用缺项、多项目范围和评测血缘、完整双目标含真实修订及网站更新。保持完整goal active继续，不把本轮里程碑标为完整交付。不增加账户/主动搜索/全语言安装包。
