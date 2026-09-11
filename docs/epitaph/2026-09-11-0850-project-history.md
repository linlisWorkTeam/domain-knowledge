# 历史项目选择与模块执行证据

实际 /tmp/domain-knowledge-workbench，feat/five-stage-workbench，实现6648f40和d442a10a0140bddf8af6e58e68592cd89e851ff6。原工作区/旧站保留，目标active，Node24/384MiB重任务串行。上一轮是代码/测试进展。

ModuleBuilds.test增加完整固定评测应用执行：两个C模块不同宏/标准，接口投影和reference/generated runner各收到正确配置，案例均FIXED_PASSED，重复start不重跑。默认runner/接口为受控替身。增加显式原生验收模式 WP_TEST_NATIVE_MODULE_BUILDS=1，会用NativeToolchain/NativeCaseExecutor真实gcc隔离执行（指纹snapshot仍为受控，不能称真实工具链摘要验证）。该native模式尚未运行，等当前模型任务结束再运行：Node24/384MiB node --test tests/integration/ModuleBuilds.test.ts 配上述env。源码已改为return VALUE，两个期望分别1/2。不要只跑默认再宣称实际编译。

ProjectHistory.js在操作中心选择已保存仓库/commit/snapshot，GET列表与固定snapshot详情，失败保留当前项目；修改参数需重新分析。切换project重置生成及重建/一键面板本地状态/epoch/轮询，不取消后台任务。StageHistory.js完整分页读snapshot+stage历史，HTTP先过滤再分页，重建额外匹配完整cardVersionIds。新静态资源白名单已接。当前项目为空时生成仍可读历史，重建需有生成选择；显式pipeline事件仍可查看指定Code。此行为变更应做Console全回归，尚未真实浏览器验证。

3项历史HTTP/选择/模块执行测试通过；14项面板状态/分页/发布面板/架构回归通过；类型/Spec/diff通过。测试有重叠，模拟DOM非浏览器布局。证据real-knowledge-revision/project-history。轻量验证不证明Make/CMake或TS完整能力。

真实来源task stage-3ac5a7c55407b750e1205020b04657f09b5e4d4590903f6e5592bf3ab3967b48，PID2451866/session24433确认活跃；/tmp/RealWholeSourcePolicyV1-attempt2.log。最新40calls/938333tokens/reserved3430526，仍RUNNING。已有卡UNRESOLVED/MISMATCH，不能发布。继续同任务，勿并发模型/编译/浏览器。来源结果WholeSource.json在real-knowledge-revision/source-policy-v1，按当前状态判断后续，不用旧墓志铭计数推断结束。

后续优先补实际模块native模式和浏览器桌面/窄屏（待当前模型任务结束），真实来源结束走修订/未解决项处理。SourceRevision.prepare允许存在MISMATCH卡并保存其他UNRESOLVED，不能把unknown当PASS。需要真实新Code/可信固定/source复测及两目标v15一键/独立发布；Make/CMake动态配置和依赖提示、TS完整分析/接口依然欠缺；全回归markdownLite、最终报告/截图/runIDs和部署未做。旧v0.2.0不改写。不要重复已完成发布准备小检查。
