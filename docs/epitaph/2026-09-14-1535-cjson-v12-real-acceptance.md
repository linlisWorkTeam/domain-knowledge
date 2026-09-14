<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接 v12 cJSON 真实验收、分批持久产物、上游推理差异和未通过状态。
-->
# v12 cJSON 验收已结束，仍未通过

用户在修复 TestGen 分批保存与 reasoning 审计后要求“重新跑完cJSON验收”。本次仅一个新 Run：41b1eec9-7ead-400c-9254-f028fa48c33f，北京时间 2026-09-14 15:17:12—15:29:29，737.113 秒，iteration 0 FAILED。完整结果见 docs/reports/AgentSpecRepairAndE2E.md 最新节；计划沿用 Evaluation.md。当前授权的一批已结束，不重置预算继续调用模型。

工作树 /tmp/domain-knowledge-cjson-v12，分支 test/cjson-utils-v12-real-e2e。实际执行 HEAD 00214c6845a2b792452113e28373a2a453ef84a7，仅比修复提交 099ce794e92202dc006af5df2b631bba9233c720 多计划文档。包含 origin/main 22fe34f 和 Worker 161057e；两项修复尚未合并。契约 domain-agents-v12-testgen-batches / contract-v12，Node 24.13.0 READY，主工作区/旧 worktree 未改。

固定 cJSON v1.7.19 / c859b25da02955fef659d658b8f324b5cde87be3，完整1481行/14API、229个源码摘要匹配。以固定版本行为为依据，RFC差异单列，未改旧用例。原实现独立18/18、三个上游程序均通过；转义Patch返回13。Code命令仅有知识/编写配置等授权字段。

真实 deepseek-v4-flash 经配置的 OpenCode HTTPS、生产角色、DSH SDK/Bubblewrap。Orchestrator、Worker、DocGen成功；候选 kv_96737cb66de045c71ce42cff，17333字符，质量91，CANDIDATE，未发布。TestGen计划43项，前6批共24个用例槽位持久保存；这些未经参考执行，不能称24项测试通过。第7批初始化sdk-minimal 30秒超时，审计requests=[]，没有发出模型请求；同期低内存和浏览器活动有证据，但未独立证明唯一根因。

Code耗尽600秒节点预算，SDK审计AGENT_CANCELLED。实际HTTP thinking=disabled、未记录启用的reasoning_effort，却收到133511字符reasoning_content、0字符正文，disabledButReasoningObserved=true。请求SHA c2bacc24d0cbd1c0e6b3b2315135681b8cfc16874fec3a89f940ed20edf35aba，会话wp-38aed5084aa64d8281dd5ab45f3e858e。证明本地没有漏传disabled；上游协议/路由如何解释仍未知，不能直接归咎DeepSeek官方服务。Code没有可编译产物，未到Check、重建评测、Review、Gate或修订。

曾拟同Run恢复TestGen第7批，但并行Code随后耗尽十分钟角色预算，因此未resume、未另开Run。不得把下一次恢复当成预算全新开始。保留前6批CAS，但真实跨进程模型续跑尚未演练。共12次SDK调用、11次HTTP请求，10完整回答usage input343568/output23121/total366689；Code无最终usage，总费用未知。

证据 /root/projects/domain-knowledge/.workpanel/acceptance/2026-09-14-cjson-v12-real/，包含Run.mjs、Attempt1、ModelAudit、SDK会话、失败CAS、分批checkpoint、readable知识、原实现基线、输入边界、FinalSummary和浏览器截图；46个CAS校验匹配。runtime包含加密配置，不上传。Run入口拒绝已有数据库，不能原样重跑。

前台 https://silicon-sisters-geek-circuit.trycloudflare.com → 127.0.0.1:4313，tmux cjson-v12-console / cjson-v12-tunnel，匹配v12及本Run独立SQLite/CAS，只读。公网HTTP及运行/终态浏览器验证通过，只见本Run，知识可读且“尚未通过，不可发布”。TestGen/Code投影FAILED，无RUNNING残留；业务聚合仍GENERATING，主徽标/阶段栏与失败横幅并存，展示一致性未完全通过，未手改数据库。旧4311/4312服务保留。

下一步需要解决长任务真实上游对thinking参数的处理、本地DSH初始化在内存压力下的稳定性、业务聚合终态展示；分批重复完整源码也带来每批约4万输入tokens的成本。修复与新完整验收应分开记录，新批次重新明确预算，不能把本次未到达阶段写成成功。
