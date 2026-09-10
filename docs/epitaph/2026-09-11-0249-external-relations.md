<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接外部关系与v2一键选材及真实验收。
-->
# 外部关系与一键选材

工作树 /tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线192ba38。本轮实际进展，完整goal仍active。原wxc、线上taste/4310、v0.2.0未改；所有测试/浏览器/native验收进程已terminal，无模型新请求。磁盘约258MiB，未删除旧知识。保持Node24/384MiB、全部重验证串行，不能在真实原生验收时修改引擎文件。

新增Domain ExternalAssociations，经AssociationDomainService统一入口：只匹配选定材料正文的独立公开符号，保留负面语境，不从提及断言等价/替代。关系记录卡片版本/正文、材料/来源修订、行号、片段和双方适用条件；原始/转换正文都可下载。最多32材料、10000外部关系、正文累计8MiB。WorkbenchAssociations.prepare可带materialIds，带材料用card-associations-v2并绑定整个不可变记录摘要；无材料沿用v1身份。构建仅读CAS，源文件删除仍能构建；缺快照/工件损坏明确失败。候选分别返回relations和externalRelations，卡片或索引变化使对应关系失效。未命中不会伪造关系。

Pipeline升级knowledge-pipeline-v2，启动前验证并复制排序materialIds，纳入身份，关联阶段只使用冻结选材；前四阶段不因选材变化重跑。v1只读，不能恢复或取消，不被恢复扫描重写。Stage自身契约未变，v1关联仍可独立复用。Console分步关联及操作中心都可展开选择材料，来源页捕获快照；卡片详情显示外部引用及下载。前端下载白名单补external-materials，只下载快照绑定CAS，免登录规则不变。验收脚本--material-ids id1,id2支持分步或pipeline，不能与resume参数混用。

真实jsmn验收：从固定25647e692c7906b96ffd2b05ca54c097948e879c的README.md捕获本地材料，临时入站文件随后清理，固定快照不依赖其继续存在。material-7cc80c5aa9a0ab4bd43d84a98e679ae6126f41d08cc2fcfe06d7fa8a31ef4e14，原文sha256 adaa92e7dc619f9f12c76856d9bfe15d0ad27888f95c37e321bf1d856937b612。运行目录仍/tmp/workbench-native-acceptance-20260910。pipeline-01bbcb9e88f2f628f833b2e059091388800546ec834f077ce0a9b91a0958d60f成功，前四阶段taskId和usage完全复用前轮31/31结果；40库内+5README引用=45关系，无新增模型请求，累计15调用218936tokens是旧任务用量。没有发布。真实页面显示31/31和45关系，外部引用可读，免登录原文下载通过；390窄屏外部引用与按钮可见无内部溢出。截图External-reference-mobile.png准确聚焦引用；Relations-mobile.png只是卡片其他滚动位置，不应拿它当引用展示截图。

验证typecheck、Spec、architecture8、domain53、integration203、Console31通过，不改视觉基线或降低断言。新测试覆盖显式精确匹配/负面语境/空选材、源文件删除与重启保留、卡片变化失效、选材冻结与变更只重跑关联、旧pipeline只读、原文下载。证据 /root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/external-relations/，含真实报告、材料记录、验证JSON、完整日志和截图。未进行新TinyXML2或真实HTTPS材料验收，HTTPS仍沿用已测试的来源主机/地址策略。

下一步优先规范化代码/结构差异及有证据的知识修订。WorkbenchReconstruction当前result只有interfaceComparison，unresolved包含NORMALIZED_SOURCE_COMPARISON_REQUIRED；原生引擎指纹未受本轮影响。现有DocGenRevision.ts已经有H2定点修订约束、baseKnowledgeRef/corrections/evidenceRefs验证，可复用，不新增Agent。不要因新增诊断重复浪费Code模型请求：需要精确绑定知识/接口/构建/模型配置的缓存复用边界，不能让Code读取参考实现。修订循环要保留每次卡片版本/测试门禁/索引刷新/累计预算和无进展原因，不能覆盖v2已完成子任务输入。其他仍缺固定发布门禁、TS统一边界/markdownLite、构建参数实际应用、多项目导航与Stage评测血缘投影、最终双目标完整真实链路和网站更新。经典卡片详情的批次/评测血缘尚未投影工作台Stage记录，可能显示0，即使上方31/31；下方独立面板也仍全局最近任务，勿宣称导航已统一。TinyXML2旧37/37只在历史引擎下成立。
