<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接 v10 cJSON 真实验收失败、原始证据和终态未收敛问题。
-->
# cJSON v10 新完整验收已经结束

用户授权在 Check 修复合并后执行一次新的真实完整验收。已更新 Evaluation.md 原计划并实际调用模型，结果 FAIL；不要继续新建 Run 直到通过。完整结果在 docs/reports/AgentSpecRepairAndE2E.md 最新节。

独立工作树 /tmp/domain-knowledge-cjson-v10，分支 test/cjson-utils-v10-real-e2e，基线 origin/main 合并提交 22fe34fdf1ee9e37c08d0bd17a03b2c7e4103cf0，实际模型执行 HEAD 为仅含计划文档提交的 4f5c8cc7631cd6f0602a70927e0197a24adbabc7。生产源码与基线一致，契约 domain-agents-v10-check-evidence-guards / contract-v10，Node 24.13.0 READY。主工作区和其他工作树未改动。

Run cb4a4f5a-d24f-47a1-87ca-37aba9a35786，北京时间 12:04:28—12:15:08，639.622 秒，iteration 0 FAILED。真实 deepseek-v4-flash 经生产角色/DSH SDK/Bubblewrap，共三个会话。Orchestrator 成功；Worker analysisScope.files 错把两个参考头文件纳入只有 cJSON_Utils.c 的分配集合，DOCWORKER_COVERAGE_INVALID；TestGen 10 分钟超时，19168 字符中断 JSON 不完整。已知 usage 51773 tokens 只覆盖 Orchestrator 和 Worker，TestGen 无最终 usage。没有自动修订、测试冻结、Code、Check、重建评测、Review、Gate 或发布；候选知识数为零，Worker 5028 字符片段未提交。

固定对象仍为 cJSON v1.7.19 / c859b25da02955fef659d658b8f324b5cde87be3 完整1481行/14API。用户本次明确以固定版本实际行为为重建依据，RFC 符合性单列差异。229个受控源码文件摘要与旧材料一致；原实现独立测试18/18、三个上游程序全通过，转义Patch复现仍返回13。原源码、旧用例和模型输出没有手改。不要把旧48/49或v9独立Check结果倒填本批。

证据 /root/projects/domain-knowledge/.workpanel/acceptance/2026-09-14-cjson-v10-real/，含全新 Run.mjs、Attempt1、原始回答、TestGen中断文本、生产Worker校验器复现、节点事件、SDK会话、基线和23个摘要匹配的工作流CAS。runtime含加密提供方配置，不公开或上传。Run.mjs拒绝已有数据库，不能原样重跑；旧v8 checkpoint不兼容，不改版本强行恢复。

前台 https://attractive-feelings-relationships-catherine.trycloudflare.com/ → 127.0.0.1:4312，匹配本工作树与本批独立SQLite/CAS，tmux cjson-v10-console、cjson-v10-tunnel。公网HTTP与浏览器已核验只有本Run、只读、无脚本错误，空知识页已截图。顶部正确显示FAILED，但TestGen节点投影和checkpoint残留RUNNING，业务state也为GENERATING；模型进程已退出，不要被前台旧节点状态误导。未手改数据库。原4311历史服务保留。

下一步应讨论/处理Worker分配集合的Schema/Prompt表达及失败恢复、TestGen预算内输出和超时后节点终态持久化。Graph原生errorHandler与节点catch/入口close的具体竞态尚未独立验证，不能把推测当已确认根因。当前授权的一批已经结束；若需修复后再验收，明确新批次原因与预算，并核对进程后再启动。
