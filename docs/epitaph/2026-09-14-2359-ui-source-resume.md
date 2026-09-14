# 来源 v5 前台同步、真实复核与待运行的参考诊断

全goal active，PR50 Draft，网站仍2c55117。最新CI34864023225代码725/725过，Console43/44；补充用例按钮缺失因前台硬编码v4。已改v5并拒绝旧契约遗留事件。6面板测试、完整7步浏览器组、Spec/diff过。单独grep最后一步缺串行前置，失败不作为产品结果；完整组SourcePanelV5BrowserSuite.log全过。提交后等待新head CI，不合并不自动宣称已部署。

真实v5任务stage-434571dde4545602e48f0c9fdc15e7ad1d473f93b1759819825c36f2f024abf7，第2尝试FAILED/DSH_AGENT_OUTPUT_NOT_JSON后PID286629退出，再同任务恢复。现PID288090，exec84240，日志/tmp/CppSourceV5Resume2.log，最后42调用2668531tokens仍RUNNING。运行目录/tmp/workbench-revision-acceptance-20260911，cpp-source-v5/Source.json持续快照。不要无参重起；先查进程和真实DB。已完成章节复用，原阻塞章节通过引用及格式校验，但仍UNRESOLVED。

新风险：accepted章节kv_9f334f987fe62c0760346c60#适用条件与不适用场景的CONFIRMED意见声称裸0x/0X应false。原review尝试449a50b08aeafc13cc09012721a3c50c7dd3bc0387fc54a73d922e9c27a118b2；主机libc sscanf("0x","%x")实际返回1并写0，0X/0xg相同。HexPrefixDiagnostic.json单独保存，不能当固定TinyXML2门禁。不要直接授权这条意见修订，也不要删除风险。

已准备/tmp/VerifyCppHexPrefix.ts，从原command58a6e39b...读checkReportRef，校验CAS、task/sourceRevision/sourceDigest，读冻结executionScopesRef原build；NativeToolchain隔离编译完整固定tinyxml2.cpp+h和6输入harness，输出cpp-source-v5/HexPrefixReference.json及HexPrefixHarness.cpp，不改测试注册表。/tmp/AfterCppSourceReference.py PID291697，exec91950，正在等PID288090退出后运行脚本；/tmp/CppHexPrefixReference.log为诊断日志，等候上限1小时仅停止诊断，不取消模型。不要另起重复编译；若内存预检失败，记录后安全重试，不降门槛。

后续核对CI、来源结果和参考诊断。混合章节独立纠正规则仍v1未改，真实C/C++修订/再门禁/发布、旧删除身份兼容、多发布根、保留评测目录和线上完整验收仍待完成。前台名字已公网页面验证。保留work/ljy/网站/tunnel，不删除用户数据。
