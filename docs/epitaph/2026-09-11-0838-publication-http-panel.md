# 发布HTTP与独立页面入口

/tmp/domain-knowledge-workbench，feat/five-stage-workbench；API基线7b6f67631b79c47b0425b9143b289b81a359b07a。原工作区/旧网站保留，未删知识，剩余磁盘约5.5GiB。Node24/384MiB，模型与构建/浏览器重任务串行；目标active，未完成。

WorkbenchPublications增加生命周期：跟踪准备和恢复Promise，关闭拒绝新请求并等已接受请求完成；Composition注入SQLite/files/evidence/index renderer并按顺序关闭。publishFromTasks从冻结fixed任务读取suiteRefs并assertArtifactRef。list/detail/artifact独立应用接口，只下载record.files清单，COMMITTED才publicationVerified，filesAvailable单独检查。

HTTP /api/v1/workbench-publications：GET列表projectId/versionId筛选，POST四个任务编号，GET详情、POST空对象resume、GET受限工件下载。与legacy publications独立，anonymousAccess沿用。新真实SQLite/FS HTTP测试通过匿名下载/不可上传suite/重复发布/不属于导出清单的CAS拒绝。14项回归含8架构，加类型/Spec通过。

新增web/WorkbenchPublication.js，KnowledgeReconstruction挂载发布面板，Server静态白名单已接。按当前Code显示可信/固定/source任务选择，source绑定所选可信任务，读取全部分页，显示完整版本集合的发布/恢复/下载。2项Node模拟DOM交互测试通过（任务选择、分页、切换后忽略旧响应），不是浏览器布局验收。类型/Spec通过，证据publication-http-panel。后续必须做真实桌面/窄屏浏览器验证和截图，不可声称页面已验收或已部署。

源码任务stage-3ac5a7c55407b750e1205020b04657f09b5e4d4590903f6e5592bf3ab3967b48：原attempt1终止DSH_AGENT_OUTPUT_NOT_JSON，33章节/4卡，29calls/667160tokens，最后响应约2.3秒且0可见内容，不是600秒超时。旧PID2411792已退出。保留source-policy-v1/WholeSource-attempt-1-failed.json和Run-attempt-1-failed.log。一次错误ID启动STAGE_NOT_FOUND无模型调用，日志/tmp/SourcePolicy-invalid-id-launch.log。随后正确恢复同task，当前PID2451866、session24433，日志/tmp/RealWholeSourcePolicyV1-attempt2.log；最新RUNNING，32calls/732087tokens，reserved2737519，累计用量保留。继续轮询当前进程，不再并发模型。没有完整SOURCE_MATCHED或真实发布。

下一步：WorkbenchPipelines接最终publishFromTasks和publicationId，contract从v14升v15（旧只读），detail真实投影，失败保留可恢复记录；无fixed流程仍明确未验证。完善Domain契约/fixtures/测试/前台v15标记，不能跳过发布准备。RunNativeWorkbench验收从PUBLICATION_PENDING更新为真实结果。完成真实来源修订→新Code/可信/固定/来源复测，两个目标新版一键及独立链路，Make/CMake模块构建参数、TS分析/历史选择、全回归/截图和网站部署。不要再拆碎重复已有准备校验。
