# 缺依赖诊断与原计划验收对照

实际/tmp/domain-knowledge-workbench，feat/five-stage-workbench，实现da3addf与8567275ce76d10fc51c51f095f4f84ae22fdbacf。原工作区/旧站未改，目标active，Node24/384MiB、重任务串行。上一轮为代码与回归证据进展。

按原始用户计划校正范围：C/C++新增完整闭环；TypeScript只要求现有markdownLite回归及共用案例执行边界，不是任意TS仓库多卡片生成。Make/CMake要求自动识别配置、缺依赖提示和可编辑编译/模块参数；识别已有，不能将未实现的自动执行任意原仓库构建脚本作为额外强制交付，也不能声称识别等于运行CMake。继续原全部明确验收，不扩充账户/主动搜索/语言安装包。

实际缺口修复：NativeBuildDiagnostics提取Clang/GCC明确缺头文件与ld缺库（去重/20项/长度限），不猜包名；NativeToolchain把issues加原始cause，Generation失败事件传issues。新BuildDiagnostics.js在生成页面展示具体缺项及绑定task的诊断下载。发现原下载接口不接收interface-failed事件中的diagnosticRef导致404，已按host事件phase白名单接通（generated-interface-failed同样），不开放任意CAS。环境工具列表增加clang++。

3项缺项解析/模拟DOM/真实SQLite和HTTP测试通过，接口失败使用受控native错误，不是实际缺头文件编译；证明模型调用0、问题持久化、免登录下载200、未绑定工件404。26项卡片/索引/编译数据库/语言边界/材料关联/版本统计/仓库与诊断轻量回归通过；8架构、类型/Spec/diff通过。日志real-knowledge-revision/build-diagnostics。首次类型检查发现测试detail联合类型未收窄，修正后通过，不放宽断言。

Operations更新实际六步操作（五阶段含发布）、模块参数/历史选择/固定/来源/发布恢复；Status文末增加原计划逐项验收矩阵，区分实现、受控和真实待验收。不要拿旧v0.2.0回归数字替代当前全套。既有Spec发展历史仍保留，最新行为看实现及追加说明。

来源task stage-3ac5a7c55407b750e1205020b04657f09b5e4d4590903f6e5592bf3ab3967b48，PID2451866/session24433确认活跃；日志/tmp/RealWholeSourcePolicyV1-attempt2.log。最新RUNNING，41calls/976201tokens/reserved3511878。继续原task，勿并发模型/编译/浏览器。已完卡有UNRESOLVED/MISMATCH，尚不能发布；完整检查点见source-policy-v1/WholeSource.json。原attempt1失败和错误ID启动保留证据。

下一步优先完成真实任务结果处理及剩余验收。模型结束后串行运行WP_TEST_NATIVE_MODULE_BUILDS=1 node --test tests/integration/ModuleBuilds.test.ts（node24/384MiB），真实gcc/Clang测试尚未跑；然后当前Console全回归/桌面窄屏截图，修复历史选择新行为可能的浏览器问题。来源结束后有明确矛盾走SourceRevision，UNRESOLVED需真实证据处理，不能放宽PASS；新版本重新Code/可信/固定/source直到真实通过或明确停止条件。jsmn/TinyXML2最新完整一键+分步/最终发布、markdownLite和全类型/Spec/架构/单元集成Console当前全回归、最终报告截图编号和部署网站仍待完成。旧v0.2.0保持原样。
