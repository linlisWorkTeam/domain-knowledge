# 前台入口改造与最终PR条件

用户已明确追加最终条件：所有工作、真实验收、部署完成后，审视#50与#38差异；若#50完整包含#38，关闭#38并合入#50；否则解决冲突、保留双方改动并合入两个PR。尚未开始这一步，不提前关闭或合入。PR50仍草稿且与main冲突；后续继续同分支，不另开重复PR。

本轮实际前台产品改动8d9ae7c0bf383faa05b8762d74ed6829637a9f19已推送PR50：操作中心增加五阶段/产物路线；仓库输入前置、已保存输入后置；未保存项目的一键按钮禁用且解释前置条件；历史运行和健康信息独立次要标题；路线桌面5列/窄屏2列。文件web/{App,RepositoryAnalysis,WorkbenchPipeline}.js、Styles.css，UiuxDesign同步。没有新框架、没有改业务阶段或模型调用。完整前台仍需继续阶段操作/卡片/评测/关联细节，不把入口调整当全部完成。

先用/tmp/CaptureWorkbenchBefore.mjs只读截图已部署ec72，原始目录/root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/frontend-review；之后通过新增tests/e2e/WorkbenchEntry.spec.ts实际Console空库场景截图。四张图片已跟踪docs/reports/workbenchScreenshots，报告明确前后数据不同，只证明布局。新入口场景首次3.5秒通过，最终禁用样式后单独重跑28.5秒通过（总35.2秒），/tmp/WorkbenchEntryBrowserFinal.log。3项页面/版本计数测试/tmp/WorkbenchEntryChecks.log通过，typecheck/Spec通过。

原长Console场景+入口组合运行失败：前者初始治理入口点击超时且context清理超时，后者page.goto超时；日志/tmp/WorkbenchEntryFlowBrowser.log。同期可用内存217MiB，进程结束后690MiB；不把相关性宣称唯一根因，不改断言/时限、不杀其他用户进程。原长场景仍需验；旧未提交scope下载断言patch见0712。现在无本任务活跃模型/浏览器/测试进程。

src/tests501/501是在UI改动前，不能称其覆盖新UI；当前新UI只有上述定向验证。C++新Code6281可信bce1 37/37、固定5ad8 40/40仍终态；修订后新来源复核/补证、关联和一键分步发布未完。C source54a差异仍待修订。网站仍ec72，本轮前台未部署。后续应处理PR与main冲突、继续前台交互改造和完整回归，再恢复真实验收与部署。目标active，本轮progress，不标完成或blocked。
