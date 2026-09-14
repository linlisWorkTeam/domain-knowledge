# 新版本已部署，旧检查点身份阻挡删除

全goal active。实际工作区/tmp/domain-knowledge-workbench，PR50 Draft，未合并。部署2c55117；CI34858435148全部通过：713代码、44浏览器、25验收。修复仅让测试自己创建的CAS只读样例可故意损坏，nobody复验5/5，不改保护断言。

网站https://contract-strict-warren-theories.trycloudflare.com/，127.0.0.1:4310，无登录按用户要求。旧PID131134已停止；新Node PID237909、tmux pane shell237908，mvp-console-review有shell重定向日志，不能将pane PID误当Node PID。tunnel/work/ljy保留。发布/root/projects/domain-knowledge-releases/2026-09-14-workbench-2c55117/app；完整停止后备份在父目录pre-deploy-backup/data。私有新/旧启动配置在/root/.local/state/domain-knowledge-deploy，不能打印配置值或密钥。新版公私资源字节一致，8条运行和其余项目/阶段/流程/模块批次/知识统计API前后相同，未删除生产数据。

删除现场未通过：旧run8d3237f4-de25-423d-8ef4-b0c5228af2d9的generation key为该run:test_gen:stable-source:contract-v5，checkpoint.status RUNNING且checkpoint_owners无对应行。工作流执行视图FAILED但SqliteDeletionRunStates.inspect仍正确保守阻挡，RuntimeMaintenance.verifyIdle对全库拒绝所有预览/恢复列表，HTTP503 RUNTIME_OPERATIONS_ACTIVE。不是正在运行的模型进程已证实；只是旧身份不足。不要补造owner、改历史状态或删记录绕过验证。需要设计安全的旧身份兼容和更准确页面原因，同时考察是否应允许隔离无关目标的预览，而确认仍严格验证正在运行写入。未实现该修复，不能声称删除线上可用。

Browser.log与browser截图在release父目录；/tmp/VerifyDeployedWorkbench.cjs通过拦截禁止所有非GET且非preview请求，验证标题、发布折叠展开、旧数据拒绝删除、390px按钮可见和取消，无页面脚本错误。截图是拒绝路径，不能拿来证明删除成功。控制环境删除3项在CI全绿。Prepared.json状态DEPLOYED_WITH_KNOWN_DELETION_BLOCK，Ci.log保留精确提交日志。临时脚本可删除，不能删release证据或backup。

下一步修复旧检查点删除兼容；历史发布根授权、保留evaluationArtifactsDirectory仍需补齐。C/C++最新修订后来源质量、可信/固定门禁、关联最终发布和线上真实全链路仍未完成；恢复真实驱动必须重查PID/日志/同taskId，不重复启动或重置预算。原真实运行信息继续查WorkbenchAcceptance.md及原证据，不能拿旧卡片门禁证明新版本。
