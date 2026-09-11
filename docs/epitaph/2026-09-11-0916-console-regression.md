# 全量回归与Console实际问题

实际/tmp/domain-knowledge-workbench，feat/five-stage-workbench。最新实现4b48c14789e970955afa1fdbc1d6bcfaa6428aad。目标active，旧站/原树保持，新站未部署。

全量npm test已退出0，480/480通过、无跳过，/tmp/WorkbenchFullRegressionCurrent.log，303436ms；保存到real-knowledge-revision/publication-browser-actual。原session58450已结束。

全套Console发现32项而不是此前grep计数37项。/tmp/WorkbenchConsoleFullCurrent.log，session14817已退出143，31项有结果（2失败），未跑到新的第32发布用例，不能宣称通过或默认为OOM（无证据）。进程查询确认已无浏览器worker。失败trace/screenshot/error-context与日志保存real-knowledge-revision/console-full-first。

失败1：新增历史输入区使操作中心截图发生预期布局变化，几何断言未失败。已人工查看actual/expected和新基线，使用--update-snapshots只更新ActionCenter1363x936LightLinux.png，容限/断言未改；此PNG尚未提交，等待正常比较通过。全suite先前测试修改持久数据（健康83 vs独立100、事项2vs1），若再次截图失败要区分该fixture依赖与布局，不可简单放宽容限。历史区在只读入口GET需token所以显示不可读；匿名发布浏览器已证明匿名可用。

失败2：RepositoryAnalysis新增history后仍用panel.querySelector首个role=status/button，分析失败写到历史notice，且把历史刷新按钮改成分析。4b48c14精确改为data-repository-notice和data-repository-form button。原完整仓库/重建/固定/评测/修订/一键/缺版本提示浏览器断言未改重跑1PASS，/tmp/RepositoryBrowserFixed.log。

当前正在正常比较运行Console.spec.ts全文件，session69772，/tmp/ConsoleRegressionFixed.log。必须继续poll，修复失败，不重复并行启动。完成后单独执行其余DirectEditing、ProductConsole、RunExecutionConsole、WorkbenchPublication四个spec，避免整套进程被外部终止丢失汇总。随后串行启动/tmp/RunSourceCorrectionAfterPolicy.ts（已准备但仍未启动），真实source task3ac5...UNRESOLVED详情见0908。最终C/C++双目标修订、重新Code/可信固定/source/发布、一键分步和部署仍待完成。不要启动新整卡source重复核验未修订正文；先用现有明确MISMATCH修订。全目标未完成。
