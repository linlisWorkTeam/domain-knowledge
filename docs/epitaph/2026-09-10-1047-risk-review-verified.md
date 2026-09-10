<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接风险复核修复、远端目录重构整合与受控验证边界。
-->
# 风险复核修复完成，真实验收仍待新授权

用户同意风险修复建议。本次未调用真实模型、不改真实运行数据库或账本；4/4次启动不变，账本SHA f52cc9087ceee9638cb90e62bc05403b8bd85dac9febbaf19e04ddb183c76081。第四次731a6a13-0226-4f21-aedb-71251d3d1222已三轮STOPPED，不能重开。原凭据仍在已安装data/secrets加密配置，禁止输出或重复索要。

代码55a3d06实现Domain风险复核。推送遇到远端合入PR39的e1c470e，随后整合为9e35adfe5523c156dcbd8d0e1dc1a0fe490d4358；没有覆盖远端工作。当前Domain agents/services平级，规则位于src/domain/services/knowledge/KnowledgeRisks.ts，对应既有agents和services/evaluation Spec。原/root/projects/domain-knowledge-wxc在途工作未动，只追加本交接；主树/tmp/domain-knowledge-mvp，feat/seven-role-mvp。

knowledge-risk-v1以来源工件、种类和声明生成稳定ID；普通unresolvedRisks保持OPEN。verificationNeeds仅允许固定案例待验收、系统集成限制、公开类型外限制三个编号，声明由程序生成，不接受任意“已解决”文本。冻结moduleContract限定验收范围；本轮固定与晋升案例完整通过、非空安全整数计数、无基础设施失败、稳定性1，才验证案例待办；仅证明这些案例。两类范围限制标为OUT_OF_SCOPE并保留，非模块场景保持OPEN。普通源码缺失、未知行为和安全问题不能用预定义编号替换，需要补材料后重新提取；本版没有模型自由清除任意风险的能力。

每轮knowledge-risk-assessment-v1绑定run/version/iteration及来源、范围、评测证据，存CAS并成为门禁evidenceRefs；正文待澄清等剩余风险也形成可追踪记录。原风险不删除，上一版本通过不沿用。knowledgeRiskBlocking单独持久化、参加回放碰撞检查；门禁使用KNOWLEDGE_RISK_UNRESOLVED，Console中文展示与Check分开。执行版本seven-role-mvp-v4；缺失版本与v3只读不可恢复，历史记录不改判。

验证：整合前本地330/330、Console22/22、风险/模块/版本定向19/19；最终计数防护与旧版本12/12、整合后架构/风险18/18通过。整合提交CI34430538172通过type/spec、331/331、Console22/22（远端新增一条架构测试）。新风险原因受控截图已审阅，没有遮挡溢出。原“测试全过但缺证据仍阻止发布”断言保留并细分原因；新隔离飞轮证明首轮失败后修订成功、自动本地发布且两轮风险审计保留。所有模型均为受控数据，不是deepseek-v4-flash实测。

证据/root/projects/domain-knowledge-releases/2026-09-10-risk-repair/Acceptance.json、CI.log、各本地日志、KnowledgeRisk.png。第一次错误CI34430446304在远端尚未整合的e1c470e上触发，已取消，不计证据。ECS3.6GiB无swap，重任务串行，Node24.13.0/堆384MiB、GOMAXPROCS1、GOMEMLIMIT256MiB。ohMyWorkPanel固定源仍干净只读。

没有重打安装包或更新已安装应用，历史854ac9c候选不含v4；没有正式Release。PR38保持草稿，后续需明确新增真实预算后在固定提交验证，再从同一提交构建并完成安装验收。当前已完成的是代码修复与受控验收，不能声称MVP正式通过。
