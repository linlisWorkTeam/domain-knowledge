<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接第四次真实飞轮的最终失败、修复和不可重置的预算。
-->
# 第四次真实飞轮已走完三轮，知识风险阻止发布

主树 /tmp/domain-knowledge-mvp、feat/seven-role-mvp；原 /root/projects/domain-knowledge-wxc 保留在途工作，只附加本交接。用户 2026-09-10 明确同意一次额外真实启动及先做一次 64 token 实际生成探针；探针成功。加密配置中已有 OpenCode Go / deepseek-v4-flash 凭据，禁止输出、重新索要或混入交付。

真实编号 731a6a13-0226-4f21-aedb-71251d3d1222，第四次也是当前最后一次授权。账本 mvp-real-attempts-v2 绑定旧账本 SHA edb718884a9c879ecf4c0e1a645c93aa1da5a64dacacf70a679a443cd4fb751b，原三条深比较不变；共 4/4 次，无第五次。开始 2026-09-10T01:51:02.410Z，固定截止 02:21:02.410Z，02:15:39.539Z 已 STOPPED。两次恢复属于同一 run，不增加轮数或时间。三轮已用尽，不能再次恢复来规避轮数。

初始 TestGen 长 SSE 命中累计 2 MiB 传输限制。修复 4a8fffc 保留流式背压，将默认累计传输改为 16 MiB，待解析单帧缓冲仍 2 Mi 字符，最小探针 64 KiB 不变。原失败工件不改写。第一次恢复 TestGen 与参考验证通过，生成实现段落空行失败；Review 定位到 H3 被拒绝。修复 51c2972 显式列出当前合法 H2，校验没有放宽。

第二次恢复完成七角色和三轮：首轮 4/140，段落间多出 br；第二轮修订重建后 315/315，但知识仍称该行为当前失败；第三轮再修订后 315/315、稳定性 1、Check blocking=false、Review PASS。最终门禁仅 CHECK_BLOCKING，来源是知识中三条 DocWorker 原始 unresolvedRisks；该字段每轮照搬，包含未运行测试、未提供集成、类型外输入。没有风险 ID/范围处置/绑定评测证据的复核流程，Review 不能消除它们。不得直接删字符串或手改旧结果让通过。下一步需设计并实现 Domain 风险生命周期和独立知识风险原因，保留真正阻塞项；持久化语义变化需版本化。当前无本地发布，不能发布已验收 MVP。

初始应用代码同 854ac9c、入口548a7c2；第一次恢复4a8fffc，第二次51c2972。不得称为单提交整段验收。51c2972 的 CI 34428524075 已通过 type/spec、324测试、21Console。新增授权8、传输/探针相关29、Review9定向通过。一批本地回归误用Node22已中止，不算证据。ECS有其他任务运行，不杀无关进程，不重叠重回归。3.6GiB无swap，Node24.13.0/堆384MiB、GOMAXPROCS1、GOMEMLIMIT256MiB继续适用。

持久证据 /root/projects/domain-knowledge-releases/2026-09-10-additional-acceptance/Acceptance.json，旁边保留初始失败和两次恢复JSON、调用摘要、CI日志；运行原数据在 /root/.local/share/domain-knowledge-mvp/data。原临时报告路径 /tmp/mvp-additional-acceptance 也保留，交付另有副本；不改账本旧报告。原ohMyWorkPanel提交1bf4c5894b3f196d2e2aba1d8db3aac77aef7095干净只读。

现有安装器仍是854ac9c历史候选，目录v0.2.0-stage-repair-candidate，不含本次传输及Review修复；本轮没有重新打包或安装视觉验收，不得沿用旧证据宣称新包通过。预览服务保持停止。PR #38草稿，不打标签、不创建正式Release。后续若要真实重验，需要明确新增授权，保留全部四次历史与账本，不换目录规避。
