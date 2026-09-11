# 发布浏览器验收准备与下载名修复

实际/tmp/domain-knowledge-workbench，feat/five-stage-workbench，实现4fd7aab105c2427e557c5cc7de87056decb9472d。原工作区/旧站保留，目标active，Node24/384MiB。上一轮代码/新测试定义和静态验证有进展，不是仅状态重述。

新增tests/e2e/WorkbenchPublication.spec.ts，完整Console+真实HTTP/SQLite/files+PublicationPreparationFixture受控证据，载入保存的project，选择可信/固定/source任务，发布、匿名下载、桌面390px截图、刷新历史仍已发布。f.contents拷贝到composition CAS以支持其他面板读报告，发布Evidence仍用完整共享夹具；不是实际模型验收。浏览器尚未启动：类型通过、Playwright --list发现1项，只能称发现成功，不能称浏览器测试通过。

检查App发现发布卡片文件被统一改名evaluation-evidence。publicationDownloadName只保留清单中的安全card.md/manifest.json/evidence.json名，App对workbench-publications采用响应Content-Disposition，其他阶段旧名保持。3项面板/文件名模拟DOM测试通过；Spec和diff通过。历史项目/参数范围select加width/min-width/max-width适配窄屏，实际布局仍待浏览器截图验证。

现场资源检查约995MiB available，无swap；模型driver RSS约160MiB且两个DSH子进程，其他用户服务占用不可随意停止。当前真实来源任务PID2451866/session24433持续活跃，/tmp/RealWholeSourcePolicyV1-attempt2.log最新42calls/1004939tokens/reserved3593230，RUNNING。继续原task，不因慢请求重启；运行到第6张卡，前5张已有未解决/矛盾，不可发布。完整进度以source-policy-v1/WholeSource.json为准。

模型结束后先顺序运行：WP_TEST_NATIVE_MODULE_BUILDS=1 node --test tests/integration/ModuleBuilds.test.ts（真实gcc/Clang，但指纹snapshot是受控）；随后 node node_modules/@playwright/test/cli.js test --config Playwright.config.ts tests/e2e/WorkbenchPublication.spec.ts，再Console全回归。统一Node24/384MiB，保留logs/test-results截图，不把--list算执行。浏览器新fixture未实际运行，可能暴露页面/夹具问题，应修复并保留门禁。Publication浏览器默认匿名无需输入令牌。

原scope以Status最新矩阵和0855为准：C/C++完整真实闭环、markdownLite回归、构建配置识别/模块参数/缺项；不扩充任意TS仓库多卡片或强制任意Make/CMake动态执行。还需真实来源修订后新Code/可信固定/source复核、双目标一键/分步最终发布、当前全回归/前后截图/报告编号与网站部署。旧v0.2.0不改写。证据real-knowledge-revision/publication-browser-preparation仅准备及轻量验证。
