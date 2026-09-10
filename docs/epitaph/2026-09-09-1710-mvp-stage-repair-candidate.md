<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接真实失败后的阶段修复、最终安装验收和未追加的真实预算。
-->
# 阶段修复候选已完成受控与安装验证

用户“同意”授权按失败分析修复；本轮没有新的真实模型预算，也没有发外网模型请求。主工作树 /tmp/domain-knowledge-mvp、feat/seven-role-mvp，原 /root/projects/domain-knowledge-wxc 在途修改保持原样。已有并行工作树分别 bootstrap READY 后实现，主树完成集成。PR #38 保持草稿，未打标签或发布正式 Release。

最终应用及安装器来自 854ac9cef2472f244c57687760a36526da18456d，177934846 字节，SHA-256 01bc12000ab4bbc01e6886dc942c88505b7ed8a2589c31d5dae1066b5a61753e。主要修复：DocWorker 选择编号行后由程序提取原文；DocGen 固定章节编号/程序组装/局部字节保持；stage journal 保留原始尝试和共同截止时间，语义最多修正一次，恢复不能重置。extract 180s/8192 token，outline 90s/2048，body/revision 240s/12288；提供方与原生 DSH 均取配置/请求 token 上限最小值。错误原文不传 Code，越权路径/章节不进入修正循环。

Linux 检查点记录 boot/PID/startTime，确认原 owner 已退出才提前接管；迁移 7 增加 checkpoint_owners。执行信封 seven-role-mvp-v3；旧 v2 只读不恢复。SIGKILL、PID 身份、retry fence、阶段次数/截止时间、超时取消和并发排队均有回归。

连接验证改为列表加一次生产隔离 DSH 的 64 token 最小生成，30 秒涵盖排队/网络；不重试、不追加工具请求，客户端断连传递取消。原列表-only 验证在读视图为 UNVERIFIED，保存/读取不调用模型，必须用户手动重验。用户此前的 deepseek-v4-flash 地址和密钥仍加密保存在现有 data/secrets，不要重复索要或输出。

Console 按执行事实显示 FAILED/CANCELLED/活动数，保留业务阶段和历史节点；超时、耗尽次数/总预算、版本不兼容都禁用恢复，窄屏保留状态文字。实际原数据库的两次失败、一取消、0 活动均通过浏览器检查。旧 TestGen oracle 预期、DocGen 层级、DocWorker 引用失败仍保留，未修改它们让结果通过。

验证：本地 321/321、Console 21/21、类型/Spec 通过；受测应用 CI 34332802538 同样全通过。最终包断网无预装开发工具安装，参考 140/140、受控飞轮 6/6、原生隔离 1/1、探针/阶段恢复 21/21，重启/模拟升级/卸载保留通过。实际用户升级只增加新表及迁移行，其余表/配置/凭据/账本保留。真实历史只读浏览器及桌面/640px 截图通过；截图和源文件/解包证据密钥检查通过。

交付 /root/projects/domain-knowledge-releases/v0.2.0-stage-repair-candidate；详见该目录 evidence/Acceptance.json、docs/Status.md、docs/LinuxInstall.md。intermediate 保留初次浏览器启动会话结束、过早点击及窄屏未修复的过程记录，只有最终 evidence 指向的产物是通过候选。干净安装共享宿主内核，不声称独立 VM。已安装 /root/.local/share/domain-knowledge-mvp 为最终候选并 STOPPED；旧 1867025 目录及 UserData-before-stage-repair.tar.gz 私有备份留在安装目录，不随交付分发。

真实验收仍为历史 3/3 次启动、0 次完整通过、0 次 Markdown 发布。本轮调用 0，MvpAcceptanceLedger.json SHA-256 edb718884a9c879ecf4c0e1a645c93aa1da5a64dacacf70a679a443cd4fb751b 不变。后续需要明确追加真实预算，保留原账本并记录新授权，不删记录或换 runtime 绕过。先做一次新的最小生成验证，再在授权内运行完整飞轮；单次仍最多 3 轮/30 分钟。未通过真实固定门禁不得发布已验收 MVP。

ECS 3.6 GiB、无 swap，所有重任务串行，Node24.13.0 堆384MiB、GOMAXPROCS=1、GOMEMLIMIT=256MiB。ohMyWorkPanel 固定提交 1bf4c5894b3f196d2e2aba1d8db3aac77aef7095 仍只读且干净。后续最终文档提交的 CI 状态以 GitHub / Acceptance.json 为准，不把交接文字当作运行事实。
