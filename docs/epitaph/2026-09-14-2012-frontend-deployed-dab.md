# 新前台已部署，完整目标仍 active

本轮 progress。独立树 /tmp/domain-knowledge-workbench；原用户树不动。dab50a5已推50且CI34841242834全部成功：代码619、Console41、验收25。网站已切同SHA，PID113062，local4310和原 https://contract-strict-warren-theories.trycloudflare.com/ 可访问。免登录可编辑；原8run/1card，未导入真实验收数据。PR50仍Draft，未合并或关闭38/50。

发行/root/projects/domain-knowledge-releases/2026-09-14-workbench-dab50a5/app，独立npm ci依赖（585包，约424MB）；git archive发行不是worktree，bootstrap报WORKTREE_GIT_ROOT_INVALID后使用锁文件npm ci，未伪造Git根。工作树bootstrap check READY。磁盘约2GiB剩余，内存约1.1GiB可用，无数据清理。

/tmp/DeployWorkbenchDab.py核对精确CI/SHA/PID、无活动run/pipeline/stage/batch，停止22186后以symlinks=True备份原runtime到新发行pre-deploy-backup，修改launcher并启动；新进程健康且路径吻合。脚本硬编码旧PID，不可再次直接用。/tmp/WorkbenchDabDeploy.log、CiPassed.log。tmux work/ljy/mvp-console-review/mvp-console-tunnel均保留。

部署后公网浏览器/tmp/VerifyDeployedWorkbenchDab.mjs，结果/tmp/WorkbenchDabBrowser2.log通过，发行browser/Result.json及before/browser截图，报告WorkbenchAcceptance。项目设置、旧知识、窄屏、默认折叠、悬停说明均检查，无真实模型写入。首轮公网脚本窄屏放大桌面发现aria-hidden旧状态导致导航无障碍树隐藏；分别重新加载两视口通过。源代码增加媒体查询change同步导航状态，WorkbenchEntry定向1/1通过，/tmp/ResponsiveNavFix.log；该修复尚未部署。下一次更新需新发布/CI，不直接改dab发行文件。

目标剩余：历史批次+衍生产物删除仅两个未跟踪草稿，需应用/SQL引用保护/文件清理/二次确认UI；独立阶段任务与模块批次统一归属/调度仍需核对；C来源修订3卡成功1卡未知（335refs审计，见2000），C/C++完整来源和发布门禁未完成，线上模型尚未验证。优先继续删除功能与真实证据处理，不要以CI25受控验收代替真实模型闭环。全部完成后再比较处理PR38/50。
