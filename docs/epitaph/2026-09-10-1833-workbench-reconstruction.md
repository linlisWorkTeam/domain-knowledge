<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接可操作重建、接口比较和下一步评测阶段。
-->
# 重建与接口比较可操作，完整目标继续

隔离工作树 /tmp/domain-knowledge-workbench，feat/five-stage-workbench，前序b290752057f1a841f090887f1e8a1df0bc757d47。原wxc仅追加指针、已有改动保留；线上taste/4310和v0.2.0未更新。当前goal仍active，本轮有实际进展，没有真正阻塞。Node24、384MiB堆、重测试串行。磁盘约276MiB，未删除旧知识库。

WorkbenchReconstruction现已注册FLYWHEEL handler：start(snapshotId,versionIds)验证固定项目/明确卡片版本，拒绝同卡多版本及不匹配模块/语言；selectionDigest冻结正文、接口和身份材料，配置及每语言实际工具链指纹CAS进入输入。执行只给Code正文、native-interface-v1、白名单路径和声明式build，不传源码/测试/诊断或真实文件路径。WorkbenchRoleExecution复用Domain executeAgent和RoleArtifacts，成功Code结果子检查点持久化；中断恢复不重复已完成模型调用，实际重试会话带task.attempt，累计用量不清零；调用前commandRef写阶段事件。

生成代码独立提取公开接口并调用Domain NativeInterfaceComparison：忽略参数名，保留类型/布局，ratio明确是参考声明匹配比例，不是行为或代码相似度。生成接口失败保留代码检查点和诊断事件；成功结果含代码/角色/接口比较引用，behaviorVerified=false及规范化源码比较/行为评测未解决项。当前未执行源码结构/规范化差异，也未修订知识，不把这一部分当作完整飞轮成功。

HTTP POST /api/v1/reconstructions 接入公共阶段状态/取消/恢复。GET /api/v1/stage-tasks/:taskId/artifacts/:sha256仅允许任务结果/成功检查点直接引用工件，拒绝任意CAS摘要；诊断事件ref尚未提供直接下载入口。Console生成完成后显示「执行代码重建」、输入版本/任务编号、接口结果、代码/比较下载和取消/恢复，刷新保留任务；页面明确未接行为评测/源码差异修订。下载复用App逻辑，新增操作中心事件代理和严格stage路径白名单。首次浏览器发现原下载监听仅在drawer，修复后实际下载通过。空输入不增加面板内容，截图基线未更新。

验证：typecheck、Spec通过；领域48/48、架构8/8、完整integration188/188。Console四文件29个独立用例全部通过，随后最终重建定向integration和Console生成→重建→下载→刷新→窄屏用例通过。C接口使用真实隔离编译，模型为受控输出；UI用固定接口避免浏览器与编译资源争用。接口中断/重启仍仅一次模型调用、工具链变动创建新任务、无关CAS拒绝下载已测。没有新真实模型调用或真实运行编号。

截图与Verification.json位于 /root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/reconstruction。最新操作说明与Application/Workbench/HTTP/UI/Evaluation Spec已更新，未将部分接口比较标为完整验证。

下一步优先接通EVALUATE handler与按钮：从成功FLYWHEEL结果取模块codeRef、interfaceRef、明确卡片版本和projectSnapshotId。复用WorkbenchRoleExecution执行TestGen native-cases-v1，再交NativeSuiteEvaluation.prepare/evaluate；TestGen仅正文/接口/策略和源快照元数据，源码只能给reference runner。保存可信测试集及完整失败用例/章节报告，模型/工具链与原重建冻结输入兼容，不读当前HEAD。先做参考baseline独立构建以区分缺依赖与错误候选；候选未过参考不得修订知识或评测生成实现。案例checkpoint和取消已有应用服务支持，需集成验证。不能用native report publicationVerified=false绕过原门禁。

随后实现可解释源码/结构差异、失败章节修订与受影响索引刷新，再推进固定及可信行为门禁/质量检查/发布；关联/指定材料/回退和持久化一键串联仍缺。没有主动搜索、账户或固定三轮总上限。C++目前只是共用重建实现，尚未真实模型验收。jsmn/TinyXML2固定源与摘要见Targets.json、/tmp/workbench-reference-inputs和/tmp/workbench-native-acceptance-20260910；完整真实多卡片链路、markdownLite最终验收、网站更新仍待完成。
