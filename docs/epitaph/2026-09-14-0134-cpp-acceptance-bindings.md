# C++验收绑定审计与串行后续队列

工作树/tmp/domain-knowledge-workbench，基线b5d05aa，前读0126并确认干净；上轮下载修复/测试为progress。本轮没有改产品代码，读取SQLite及CAS审计TinyXML2当前任务，发现之前摘要只记fb5/e173不完整：较新Code为stage-6c90426ab4e9411531f90f05cf0e2b7f96426de30af1c4e03a212b73b1f82687（native-source-comparison-v1），对应可信stage-5377823175a28a2f7caa81d377387cb4eab75569b734f32c2f26d6e43d38019f 37/37；40/40固定0c881仍绑定旧fb5，两个生成CAS内容不相同，不能组合通过。9卡版本相同，库中无C++来源复核。cpp-current-binding-audit/BindingAudit.json已保存CAS校验审计。

随后比较C++与当前C冻结configurationRef：roleExecutionVersion均seven-role-mvp-v5、contracts/basePrompts一致，但provider.parametersSha256不同（未输出任何密钥）。RunConfiguration.assertStageCompatible明确拒绝不同provider，因此旧Code即使补固定也不能直接继续当前来源复核。后续应以当前配置重建相同9卡，再保留旧37可信与40固定原输入/期望评测，随后新来源自动冻结scope。

先前创建的Cpp固定等待队列session18205/PID3613803尚未启动原生任务，核对源与前序测试队列仍live后已终止这个本任务等待进程，无源码任务被取消，旧driver /tmp/RunCppFixedCurrent.ts保留但不要运行以冒充完整当前轮。改为新队列session19124/PID3615972，/tmp/RunCppReconstructionAfterScopeTests.py：监测已有App测试队列PID3605442 start=1641870355结束，且/tmp/SourceScopeApplicationTests.log明确pass3/fail0，才启动/tmp/RunCppReconstructionCurrent.ts，log/tmp/CppReconstructionCurrent.log，输出cpp-reconstruction-current-provider/Reconstruction.json。driver读取旧6c904的同9卡/snapshot并通过现有Reconstruction.start捕获当前配置；同stage resume保持累积用量。node --check通过；排队不等于执行通过。

当前首个真实重任务仍C source54a293，session69756/PID3596179，/tmp/SourceAfterTargets.log（末次ps Sl/live28分36秒，约20calls393382tokens，后续读日志为准）；应用测试队列session20697/PID3605442仍等待该PID start=1641798545结束后跑WorkbenchEvaluation.test.ts。顺序：当前C来源→应用回归→新C++重建。三个handle都保留，不重启/并行抢占。新C++队列本轮末ps Ss/live35秒。若应用失败，Cpp队列明确skip，先修复，不当阻塞目标。不要等待已终止的18205。

新增docs/reports/WorkbenchAcceptance.md和docs/README入口，记录实际C/C++提交、任务绑定、已过/缺失的验证及原始证据位置，明确全验收未完成。报告中旧部署、旧494回归和旧浏览器不能代替当前验证。Spec/diff检查通过，报告最后调整后diff通过。本轮无新模型启动或部署。

下一轮先poll源69756、App队列20697、Cpp队列19124，读取终态与原生结果；C来源有未解决风险仍需保留处理，C++完成重建后复用37/40并做scope来源。再完成完整Node/Console/MarkdownLite/真实浏览器、新版本部署、双目标分步/一键/关联/发布。goal继续，报告是部分验收清单，不是完成声明。
