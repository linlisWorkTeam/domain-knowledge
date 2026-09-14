# 新版部署与原生验收续接

目标active，本轮progress；PR50草稿，PR38/50未关闭或合入。原用户树不动。当前工作树/tmp/domain-knowledge-workbench，f543c59已推送。791a740共享无业务状态契约校验器及Server测试等待shutdown，daed7f4状态API脱敏原始错误，f543c59修受控AgentRevisionFlow的旧READY探针为当前GENERATION_READY双检查，本地完整流程1/1。CI34827215087 verify通过（含Console），acceptance24/25，失败已由f543修；新CI34828092897仍运行，继续poll，不重复dispatch。

C++v11重建e6d45成功，2calls82552tokens，9工件审计。可信03dc1c087c74a95bd631009a12b2e6ce16d842d24aab141f93df95959bc807a5成功37/37、复用37、新增0，81工件审计，publicationVerified=false。固定stage-79e38c35042c352024afa7b29593269a728deede2ab676b7e384380c3a37d1b5仍PAUSED/WORKBENCH_RESOURCE_INSUFFICIENT，14参考用例检查点，累计54311ms0calls；两次无新检查点控制器已终止，不无条件重启。驱动/tmp/RunCppV11Fixed.ts，控制器/tmp/ContinueCppV11Fixed.py，/tmp/CppV11FixedContinuation.log及CheckpointResume1/2.log。所有fixed执行会话终态。

当前活跃真实来源任务stage-86fde3b43f3d752129f83426ac106b5c899b9fac1b973c66c038eb836d1cda61，绑定03dc；PID4118695，exec33871，/tmp/RunCppV11Source.ts，/tmp/CppV11Source.log，证据cpp-v11-source/Source.json。最后6calls329774tokens仍RUNNING；先poll进程/会话，不能凭日志不增长重启。Node24 old384/semi8，保持模型/编译/浏览器串行。旧来源结果和旧固定40/40不算当前成功；未编辑指纹引擎文件，不跨版本恢复。jsmn新闭环仍未完成。

网站实际已部署f543c59，/root/projects/domain-knowledge-releases/2026-09-14-workbench-f543c59/app，新Console PID4120697、tmux mvp-console-review。原tunnel mvp-console-tunnel不动，https://contract-strict-warren-theories.trycloudflare.com/health与127.0.0.1:4310/health均200。启动/tmp/mvp-frontend-review/start.sh仅换app路径；不改免登录、绑定、密钥或隔离参数。原8runs/1card保留、stage-tasks0；runtime仍/root/.local/share/domain-knowledge-mvp/data。pre-deploy-backup保存原启动脚本和数据（保留symlinks），Deployment.json记录部署。第一次备份跟随依赖链接已终止并清除仅本次不完整副本，原数据不动。v0.2.0和旧ec72c43发行保留。部署后的浏览器检查尚未做，等来源任务终态后执行，不能与模型争资源。

验收runtime仍/tmp/workbench-revision-acceptance-20260911，真实任务未导入网站。不得用临时库证明线上展示，也不要全量替换线上数据。下一步来源终态后审计并必要修订，资源有新条件再续固定；完成C/jsmn新链、关联发布、真实页面/一键分步和测试复用验收。最终全部验收/部署完成才对比PR38/50并按用户条件处理。证据根仍/root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/real-knowledge-revision。没有新增永久CI任务或变更ECS系统权限，未调用subagent。
