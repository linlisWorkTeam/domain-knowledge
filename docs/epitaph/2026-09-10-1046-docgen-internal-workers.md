<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接 DocGen 内部 Worker 重构、验证证据与后续边界。
-->
# DocWorker 已作为 DocGen 内部 subAgent

用户确认将 DocWorker 与 DocGen 放入同一业务目录，并让 DocGen 调用 Worker。本次在 /tmp/domain-knowledge-agent-guide、feat/knowledge-generation-agent、基线 96d277b 实现；改动留在工作区，未提交或推送。原 domain-knowledge 与 domain-knowledge-wxc 在途内容未动。按用户要求新增记录，保留旧墓志铭。

DocWorker 已迁入 src/domain/agents/docGenAgent/subAgents/docWorkerAgent。外层注册表和 LangGraph 不再调度 DocWorker，Orchestrator 计划只包含五种下游外层角色。七种执行身份仍保留，内部 Worker 标注 parentAgentId=doc-gen，允许独立开发。DocGen 按路径列表去重、均分非空任务，默认一个、最多五个；workerCount=0 保留直接汇总。全部片段成功后才调用汇总模型。

DocWorkerExecutionService 绑定冻结 Worker 提示词与白名单材料，通过 RoleExecutionService 保存命令、输出、片段；ConcurrentTasks 默认最多三个并发，失败取消同批任务并等待在途调用结束。内部投影为 doc_gen/doc_worker:worker-N。提交键绑定 Run、任务身份、输入摘要和冻结提示词，正文修订与同版本恢复可复用已提交片段。DocGen 结果通过 workerResultRefs 追溯子任务。ROLE_EXECUTION_VERSION 升为 domain-agents-v2-docgen-subagents，拒绝旧版本 Run 恢复。

Node 24.13.0 bootstrap 与 check 为 READY。typecheck、validate:specs（17 schemas / 7 commands / 8 results / 51 p0）和 diff 检查通过；35 项定向测试通过。全量 npm test：229 项，227 通过，2 项 Site 基线失败。详细日志 /tmp/docgen-focused-tests.log、/tmp/docgen-full-tests.log、/tmp/docgen-specs.log、/tmp/docgen-typecheck.log。

已从 git archive 96d277b 创建独立源码快照 /tmp/docgen-baseline-site-yx4tdt1h，使用独立离线安装依赖复现完全相同的两项失败，日志 /tmp/docgen-baseline-site.log。第一项 Site.test.ts:147 的小写资源名正则拒绝 site/ConsoleDev007Dev008.gif；第二项 Site.test.ts:310 报 UiuxDesign.md 缺 #080b10。没有放宽测试或修改无关站点文件。

CLI 组合样例 DocGenWithWorkersSample.json 通过。Run 18b75663-0bda-462d-8aab-369137b75adf，结果 /tmp/docgen-subagent-acceptance/doc-gen-gcxBhF/result.json，审计同目录 audit.json；fixture、SUCCEEDED、两个 workerResultRefs、NOT_EVALUATED。没有真实 LLM 调用、没有新发布或浏览器验收。

后续可在 DocGen 目录内细化源码语义拆分、提取契约和汇总质量。当前拆分仍是固定文件列表，冲突与证据核对仅通过汇总提示词提出要求，不宣称已有确定性语义验证。TestGen oracle 晋升、Review findings 接入及风险生命周期仍未在此任务中实现。
