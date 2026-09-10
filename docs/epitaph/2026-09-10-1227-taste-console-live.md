<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接 taste-skill 安装、前台视觉重构及当前浏览器入口。
-->
# taste 前台重构与本地只读部署

用户要求安装 taste-skill，基于现有前台重构 UI/UX，并继续通过网站查看真实结果。使用 skill-installer 从 Leonxlnx/taste-skill 的 skills/taste-skill 安装到 /root/.codex/skills/taste-skill；SKILL.md SHA256 aa194351b246b8b4799099d4ed7b033d29eab6e6e3d58d8d2172978be7b3ec89。该技能明确不负责数据控制台，因此仅采用 redesign audit 方法，不套用营销页布局或增加框架。

代码位于独立工作树 /tmp/domain-knowledge-taste，分支 feat/taste-console，基线 55661e0，bootstrap READY。原 /root/projects/domain-knowledge-wxc 的在途工作未动，只追加本交接。保留七个导航、主题和权限；统一绿色与中性色、辅助字号和间距；知识及本地发布正文安全排版，支持目录、原文、复制和可展开证据；待办分类真正筛选，刷新保持筛选焦点；移除虚构比例与阶段状态。设计写入现有 UiuxDesign.md。

浏览器24/24通过，另有最终文案定向截图复验；类型、Spec、架构8/8通过。全量343项中340通过，三个问题已经定向18/18复验：Status.md历史失效链接修正、保留无ETA文案、开发Node24含Corepack替代不含包管理器的安装包Node。没有重复跑整套343项，也不把此前执行工具被SIGTERM中断的半份报告计为完整通过。旧断言及截图1%阈值未放宽；仅更新经审阅的视觉基线和设计变更对应的布局/真实进度断言。无真实模型调用；不重新打包、改写已发布v0.2.0或合并main。

当前 https://contract-strict-warren-theories.trycloudflare.com 仍指向127.0.0.1:4310，tmux mvp-console-review 已切换为上述工作树的源码服务；运行数据仍为 /root/.local/share/domain-knowledge-mvp/data。公网首页、App.js、新阅读模块、runs、knowledge、capabilities均200，writeEnabled=false，目录接口503。最终run da8de66a-cce3-4922-a5f5-0b3e62eadcaf及kv_452f056dce70cb05d252658c存在，账本和已发布正文摘要未变化。真实页面双主题、桌面及390px窄屏经过截图审阅，无页面横向溢出；正文排版文本7523字符，原文仍保留。公网使用HTTP校验，浏览器在本机访问同一服务，不冒称公网浏览器链路已验证。

证据 /root/projects/domain-knowledge-releases/2026-09-10-taste-ui，包含前后截图、受控快照、报告和逐次测试日志。ECS无swap，重测试串行、Node384MiB；预览4311和回归tmux会话已结束，只保留服务与隧道。服务脚本 /tmp/mvp-frontend-review/start.sh；原安装版只读脚本备份 StartReleased.sh。安装器knowledge status不跟踪此独立进程；不要同时启动标准服务占用4310。回退时停止 mvp-console-review，用备份脚本重新启动该会话，保持隧道。停止查看时关闭 mvp-console-tunnel 和 mvp-console-review，不删除用户数据。临时URL和/tmp工作树不是永久生产部署，保留至用户验收；后续需讨论正式集成及新版打包。
