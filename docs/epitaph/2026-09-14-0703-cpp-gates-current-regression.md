# C++ 新版本门禁通过与当前回归

前轮为progress；本轮取得新重建及可信/固定评测终态，并启动全套当前Node回归，属于progress。完整五阶段/C/C++/真实验收/部署目标保持active，不能因单组门禁通过宣称完成。

Code stage-6281e9051e3291bf624e9cb84a7a5d4e1dc26a14b9097472d56594ff423b0590已同任务编译修复成功，2调用95807tokens/262465ms，interfaceCompatible=true。cpp-reconstruction-after-source-correction/ReconstructionAudit.json：SQLite终态一致，14引用CAS通过；CodeRef651b74d49ad8111bbc762994f4cfbb49bf99e3ecbfaa27cc46bb30ef5f1cc069（7160bytes）。修订后9版本见0654。

可信stage-bce1d95d011232c6af352e4e11a55053962ff4229e499e5a68cfe06c77f0db49 SUCCEEDED，37/37，复用37/新增0/revalidated=true，0调用119576ms。testSet native-tests-dfd738e477a46ff7635f2671347bf956acfd4b1144ccc8a3eef73202b3db1c73；完整suite CAS与前版613ba1相同，ImmutableGateAudit.json保留输入/预期未改证据。reportRef dac714a5e4faae08b21cd579c08f8fada015b9e8f0f650511b44cae55c6b6652。

固定stage-5ad835cf13309b4a68f7072d4f035ea1e3e7fd4d7de8d53e989710ed1bd3e68a SUCCEEDED，40/40/参考通过，绑定同Code6281，0调用112255ms。reportRef d73b9ecce573071a93235deaee886b9db71272b3425783f0b3700ee2704fa5c3。两驱动/tmp/RunCppEvaluationAfterCorrection.ts与/tmp/RunCppFixedAfterCorrection.ts及同名日志均终态，不重启。

正在全套Node回归：session44868，Python父PID3929134，Node主PID3929141（comm MainThread），日志/tmp/WorkbenchCurrentFullRegression.log。启动前SQLite无active任务；rg列出src/tests下全部125个.test.ts/.mjs/.js，node --test --test-concurrency=1。/tmp/WorkbenchCurrentFullRegressionManifest.json固定文件清单/命令/基线1157cd2；产品代码等同e66ec50，期间只有报告修改。Node24/384MiB。下一轮先poll该进程或session，检查最终统计与失败，禁止同时新起模型/构建/浏览器。尚未取得当前全套通过结论。

回归后补Console/实际浏览器（尤其scope下载与窄屏）再部署含0ae56fe/e66ec50的网站，当前网站仍ec72；保留运行数据/回滚。C source54a仍5差异/5未知待修订。C++新卡仍须新的来源复核及必要修订/补证，不用旧source508给新版本发布；关联/一键分步/发布全链路也未齐。runtime/tmp/workbench-revision-acceptance-20260911，证据根/root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/real-knowledge-revision，cpp-*-after-source-correction目录。
