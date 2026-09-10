<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接原生评测阶段、失败用例界面和剩余闭环任务。
-->
# 可信评测阶段接通，完整目标仍继续

工作树 /tmp/domain-knowledge-workbench，feat/five-stage-workbench，前序89cb273bc87db3f0d035efad88010f198b8bcd14。原wxc只追加指针，线上taste/4310与v0.2.0未改。Node24、384MiB堆、重测试串行；磁盘约269MiB，未删旧知识库。goal仍active，本轮实际进展，无真正阻塞。

WorkbenchEvaluation已注册EVALUATE，POST /api/v1/native-evaluations {reconstructionTaskId}。冻结成功FLYWHEEL的结果摘要、原配置/工具链/卡片版本，拒绝错误前序阶段。参考源码只交Native runner，TestGen只得知识/公开接口/源码快照元数据和native-test-policy-v1。policyDigest包含七角色执行/契约、TestGen提示词及provider身份。复用WorkbenchRoleExecution，成功候选与案例可恢复。入口路径为.c/.cpp时不重复把该文件与include harness同时编译。

参考baseline先用受信空main独立编译/启动（含sanitizer），依赖或启动失败不调用TestGen。失败证据有独立attempt检查点，失败不缓存为完成baseline，恢复会真实重试。候选在参考上失败时记录candidate-rejection报告并以TEST_CANDIDATE_REJECTED失败，不能评测生成代码或据此判知识错误。恢复按已记录拒绝次数增候选键，重新生成已证明错误的候选，累计同任务用量不重置；仅资源中断的候选仍复用。TestGen原生分支校验章节属于政策给定知识sections，避免错误章节输出被成功角色检查点锁住。

可信用例交NativeSuiteEvaluation.evaluate；BEHAVIOR_PASSED/FAILED与阶段SUCCEEDED分别记录。模块完成报告做检查点，后续失败不丢前序产物；恢复跳过已完成模块，仍校验工具链。大用例和原始编译运行报告只存CAS，任务/模块摘要保留引用与计数，避免触发Stage canonicalJson的256KiB限制。publicationVerified始终false，尚未接固定验收门禁、质量审查和发布。修订知识后仍保留可信输入/预期，参考重验并绑定新章节版本。

Console重建完成后有「执行评测」；显示新增/复用、通过数、用例调用、预期/实际表格、卡片章节版本链接和下载报告。候选参考拒绝可重新生成，失败baseline可下载；取消/恢复/刷新共用stage-tasks。报告通过任务授权工件地址单独加载，缓存按摘要；代码生成/重建文字不再错误宣称后续评测一直未执行。规范化源码差异与知识修订未接通的说明仍保留。

验证：typecheck和Spec通过；领域48/48（Domain.log已保存）、架构8/8、完整integration189/189、Console29/29通过且原截图基线未变。最后baseline失败重试补丁后类型、领域48和原生阶段定向integration再次通过。真实C编译/执行覆盖错误候选→同任务重新生成→可信用例资源暂停→重启复用→正文修订后保留预期并发现生成错误→新源码缺依赖停止TestGen→真实重试失败baseline。浏览器使用受控接口/执行观察，验证生成→重建→评测、失败表格和章节链接、下载、刷新及窄屏。没有真实模型请求或C/C++新真实运行编号。

证据 /root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/evaluation：前后桌面/窄屏图、Domain.log和Verification.json。实现依旧是部分闭环，不应标记完整goal完成。

下一步优先推进真实锁定jsmn/TinyXML2输入和模型链路，暴露C++实际问题，同时补规范化/结构源码差异和可解释知识修订。修订依据必须区分知识错误、Code未遵循知识、候选无效和等价实现差异；不能为相似度反复改等价代码或改可信测试预期。已有失败章节版本/报告可给Check/Review/DocGen，但Code仍不可读隐藏测试和参考正文。修订后刷新受影响索引，再重新重建/评测；必须设计不重置累计预算的迭代身份，当前相同成功FLYWHEEL输入会复用旧代码，不能简单重复start冒充新尝试。

关联/指定本地或URL材料/关联回退、持久化一键顺序、固定及可信行为门禁、质量审查/发布仍未做。新阶段尚主要显示在操作中心，飞轮批次/图和独立评测导航还需接统一阶段事实。TypeScript新边界、实际编译数据库/Make配置应用也需继续按原计划审计，不能仅用文件识别算完整构建能力。最终jsmn/TinyXML2真实多卡片→索引→重建修订→评测→关联、markdownLite回归、完整截图/报告/真实编号和当前网站更新均未完成。禁止主动搜索/账户/固定三轮总上限；无需求重新审批。
