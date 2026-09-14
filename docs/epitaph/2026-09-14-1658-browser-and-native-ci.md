# 前台回归、C++ v11与CI委派

目标仍active，本轮progress。原用户树不动，独立worktree /tmp/domain-knowledge-workbench，分支feat/five-stage-workbench。PR50保持Draft，已推送a33ac0b/90b6872/26b0019，正文已更新。未部署、未关闭/合入PR38或50，网站仍ec72c43且health正常、无活跃Run/阶段任务。全部真实验收及部署完成后才比较两个PR。未删除知识、来源或证据，未改ECS系统权限、未调用subagent。

a33ac0b修浅色主题禁用按钮优先级、人工检查后更新原操作中心截图基线；原1%像素阈值/交互断言未改。真实C++启动发现NativeFingerprint.ts字符串清单仍引用domain/services目录，已改当前domain/evaluation和knowledge，实际指纹生成通过。此前直接npx playwright未加载大写Playwright.config.ts，导致主题/路径假失败；必须npm run test:ui -- ...。

90b6872把原长工作台浏览器测试拆为七个describe.serial阶段，同一context/page/冻结项目，失败跳过依赖步骤。所有原302处expect、3处poll、20处截图保留，每阶段仍30秒；7/7通过，/tmp/WorkbenchSplitSevenBrowser.log。全组合Console+Entry+Publication 30/31通过，/tmp/WorkbenchFinalConfiguredBrowser.log：原Sources场景30秒超时，其余包括七阶段/关联/发布/窄屏/新截图通过。失败trace保留；/tmp/WorkbenchSevenStageBrowserEvidence和/tmp/WorkbenchConfiguredBrowserEvidence保存阶段与先前证据。类型 /tmp/WorkbenchStageSplitTypes.log 通过。不能称全套Console全绿。

真实C++当前v11任务stage-e6d45b8c9d720b62500ca5841e9b22df594ad0a938afebea451afb35dee4f6db，仍绑定83b367来源修订后的9卡。当前PAUSED/WORKBENCH_RESOURCE_INSUFFICIENT，累计2calls、82552tokens、57257ms。初次生成后内存暂停；恢复复用Code并发现TINYXML2_LIB未定义编译错误，错误CAS36b8ee8919404b475defc75747fa971e0e96a17e6ad9a052a340ba42c33d9f68，非超时，可修复；随后同任务Code修复已保存，但两次构建前内存不足。不要反复缩堆/重启；没有新的内存证据时推进CI等独立工作。不要重置消耗、重新生成同一代码或跨版本恢复旧任务。

驱动/tmp/RunCppV11Reconstruction.ts，证据原real-knowledge-revision/cpp-v11-reconstruction/Reconstruction.json。日志/tmp/CppV11Reconstruction.log为旧指纹ENOENT，AfterPaths/Resume/Repair/RepairResume日志分别保存后续状态。所有本地exec会话已终态，包括58176。备好的/tmp/RunCppV11Evaluation.ts和/tmp/RunCppV11Fixed.ts尚未执行，二者绑定新e6d45任务；源复核新驱动尚未准备。原37可信/40固定未改，不属于v11成功证据。

CI首次34824671868在90b6872上601tests580pass21fail，/tmp/WorkbenchCi34824671868Failed.log。主要PROJECT_RESOURCE_ISOLATION_UNAVAILABLE：runner无可写委派cgroup。静态、Bubblewrap、类型、schema检查已通过；浏览器/acceptance跳过。26b0019新增scripts/RunIsolatedCi.sh包装现有runtime/Console/acceptance命令，无新job/trigger；systemd临时服务仅委派memory pids，按原UID/GID运行，先移自身到runner叶，再启用本组控制器，WP_EVALUATION_CGROUP_ROOT指向本组。这样进程只在同一委派树内迁移，不chown宿主祖先、不以root跑测试、不取消隔离。纯docs直接原命令。bash -n、非CI拒绝、YAML解析、Spec lint通过；没有在ECS执行systemd委派。

唯一当前外部活跃任务是新CI34825340484（26b0019），最后确认verify运行中，请poll该run，不重发仅因观察超时。若失败，gh run view --log-failed取确切原因，继续修配置而不放宽隔离。GitHub compare main22fe34fd...90b6872返回ahead179/behind0、mergebase=main，但PR仍CONFLICTING，属状态不一致，不能重复合并/强推当作修复。

下一步：核实新CI；修Sources超时或用CI实际结果确认；必要时继续审查前台与部署。资源允许时恢复e6d45同任务，之后真实可信/固定、来源必要修订、关联和发布；jsmn当前真实闭环也未完。旧测试报告和整图受控测试不可代替真实模型质量。新版网站未部署，线上/tmp/mvp-frontend-review/start.sh仍指向2026-09-14-workbench-ec72c43/app，数据/root/.local/share/domain-knowledge-mvp/data，现有tunnel不动。记录原1613已以26b0019固定链接归档，保留最新三篇。
