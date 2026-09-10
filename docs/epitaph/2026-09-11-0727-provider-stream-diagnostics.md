# Provider 流式诊断

/tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线0889101d1c9d2468f5e20e48b1dc75c9da2c0fc7。完整目标active未完成，原wxc和taste:4310/v0.2.0不变，未删知识。Node24/384MiB，重任务串行。

ConfiguredDshProvider审计metadata.streamDiagnostics增加JSON编码的provider-stream-diagnostics-v1，仅累计单provider.run的请求数、首头/首包/末包毫秒、响应字节、帧数、content/reasoning字段UTF16字符数。不保存内容或凭据，不将字符换算tokens，不改变请求材料、输出契约、截止时间/重试政策。角色Review仍180000ms，适配器总运行默认600000ms；目前没有证据把真实超时归因到持续推理或网络停顿，新诊断用于区分。

8项单元/官方DSH受控集成通过，包含中断流诊断保留而未报告tokens仍null；架构8、类型、Spec通过。证据provider-stream-diagnostics。不涉及UI，无新浏览器检查，不宣称全回归/最终部署。

source-v3第一次已FAILED：task stage-d82a2b70db7a696fb189fa4fbc370d3cb9ab8116325b8e952f75812f9f72c2cc，2calls/17852reported tokens/reserved152121/247371ms，仅首章节SOURCE_MATCHED；第二“字段语义：type、start、end、size”超时。旧请求没有streamDiagnostics，不能回填推测数据。详情0724交接，证据whole-source-v3/WholeSource-attempt-1-timeout.json。

提交后计划使用同taskId显式恢复一次，保留成功章节与累计消耗；驱动 /tmp/RunWholeSourceVerificationV3.ts TASK_ID，runtime /tmp/workbench-revision-acceptance-20260911。先查whole-source-v3/ResumeAttempt2.json、WholeSource.json和实际进程，禁止重复启动。新审计位于 runtime/workbench-audit/model.jsonl，可按 metadata.runId 过滤，streamDiagnostics为JSON字符串；不要输出凭据或模型响应正文。

后续按真实流量证据决定下一步，不无限盲重试或把超时算通过。完整待办：真实来源修订与再重建/评测/核验，固定/可信/来源联合门禁和独立发布，一键固定用例接入，Make/CMake/模块参数/完整语言边界/历史快照，双目标最终真实链路、全回归与网站更新。固定C11/11、C++40/40已通过，但知识尚未最终VERIFIED。
