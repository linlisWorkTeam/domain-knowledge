<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：结束 cJSON 验收修复会话，交接已合并代码、真实失败及后续边界。
-->
# cJSON 验收修复已合并，真实知识飞轮仍未通过

用户最后授权“提个pr，然后你自己合并，然后就用墓志铭结束这个会话”。修复与验收报告已由 [PR #51](https://github.com/linlisWorkTeam/domain-knowledge/pull/51) 合并至 main，合并提交 d590ee9325ee82aeea0effca37f8c5621c6c3470；实际被审查的分支 HEAD 为 6fd7379a5bc373a66a36de4956a77247298a9fff。GitHub CI verify（2分35秒）和 acceptance（46秒）通过后，于北京时间 15:53:05 合并，未绕过检查。本次收尾没有新增真实模型调用。

涉及 Agent 的改动包括：DocWorker 的 analysisScope.files 由框架从分配输入生成，模型只负责分析内容；TestGen 改为完整计划、每批最多四项、逐批 CAS/checkpoint 保存、全部组装后统一参考验收。原有十分钟角色预算不扩大。另修复节点取消向执行器传递及清理等待，增加真实 HTTP thinking 配置与响应推理审计。没有改 Code、Check、Review 的角色业务职责，也没有修改发布 Gate。协议为 domain-agents-v12-testgen-batches / contract-v12；旧 checkpoint 不能通过改版本号恢复。

修复的定向回归、类型检查、Spec 和 PR CI 通过，说明相应契约与执行链路通过回归，不等于真实 cJSON 质量验收通过。详细回归分组与历史结果保留在 [验收报告](../reports/AgentSpecRepairAndE2E.md)；本篇中的合并事实更新了旧报告/墓志铭在验收时记录的“修复尚未合并”，不改写当时的执行 SHA。

最后一次真实 Run 为 41b1eec9-7ead-400c-9254-f028fa48c33f，执行 SHA 00214c6845a2b792452113e28373a2a453ef84a7，真实 deepseek-v4-flash，2026-09-14 北京时间 15:17:12—15:29:29，737.113 秒，FAILED。目标仍为固定 cJSON v1.7.19 / c859b25da02955fef659d658b8f324b5cde87be3 的完整 Utils；以固定版本行为为测试依据，RFC 差异单列。原实现独立基线 18/18，三个上游测试程序均通过，源码摘要未改。

Worker 与 DocGen 成功，候选 kv_96737cb66de045c71ce42cff 保持 CANDIDATE，未发布。TestGen 计划 43 项，前六批共 24 个用例槽位保存；第七批在本地 DSH sdk-minimal 初始化 30 秒超时，没有发出模型请求。这些保存的用例尚未完成参考编译/行为验收，不能写成 24 项通过；真实跨进程续跑未演练。Code 的实际 HTTP 已包含 thinking=disabled，但收到 133511 字符推理、零正文，耗尽 600 秒预算。未产生重建代码，未到 Check、重建评测、Review、Gate，也未发生自动知识修订。

12 次 SDK 调用中有 11 次实际 HTTP 请求；10 个完整响应的已知用量 input=343568、output=23121、total=366689 tokens。Code 没有最终 usage，不能把该小计当完整费用。此次 Run 已结束，不能恢复后重置旧预算；下一次完整验收需明确原因和新批次预算，不循环调用到通过。

尚未解决的问题：配置的上游如何处理长任务 thinking 参数；DSH 初始化在资源压力下的稳定性（已有低内存相关证据，但未证明唯一根因）；业务聚合 GENERATING 与工作流/节点 FAILED 的前台展示冲突。分批重复源码还带来每批约四万输入 tokens 的成本。下一会话先讨论和定位这些问题，不从“Check 已修复”推定完整飞轮已通过，不手改模型代码或固定测试预期。

原始证据位于 /root/projects/domain-knowledge/.workpanel/acceptance/2026-09-14-cjson-v12-real/，含 Run 入口、独立 runtime、失败原始会话、ModelAudit、分批 checkpoint、CAS 摘要、知识正文、基线及截图；回归证据位于同级 2026-09-14-testgen-batches-regression/。runtime 含加密提供方配置，不提交、不公开上传。历史运行和旧工作树全部保留。

前台 https://silicon-sisters-geek-circuit.trycloudflare.com 对应 127.0.0.1:4313，使用 /tmp/domain-knowledge-cjson-v12 匹配代码及本次独立 SQLite/CAS；运行与终态浏览器验证已完成，本次收尾再次确认公网 HTTP 200。tmux cjson-v12-console / cjson-v12-tunnel 仍保留，地址随隧道或主机结束失效。页面可读候选正文并提示未通过/不可发布；上述聚合状态展示问题仍在，未手改数据库。

主工作区 /root/projects/domain-knowledge 的本地 main 仍可能停留旧版本，不能拿它代表新合并结果。下一会话先读最新墓志铭，检查 Git、远端与进程，再 fetch origin/main 并使用独立 worktree；依赖执行使用 Node 24.13.0 且 bootstrap:worktree:check 必须 READY。文档收尾工作树为 /tmp/domain-knowledge-cjson-handoff，验收前台继续使用原 v12 工作树。
