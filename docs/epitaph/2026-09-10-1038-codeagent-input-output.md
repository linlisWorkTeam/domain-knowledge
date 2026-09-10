<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接 CodeAgent 已确认的输入输出、项目配置及隔离设计。
-->
# CodeAgent 输入输出确认交接

用户保持原七个 Agent；知识生成、知识检索、知识飞轮、知识评测、知识关联是多 Agent 协作的业务阶段，不改成五个 Agent。当前工作属于四阶段开发计划中的 S2。用户要求逐条确认输入输出，本次授权把已接受的 CodeAgent 方案写入文档。

已确认 IO-03～06：主要业务输入是包含公开接口的知识卡片，目标语言 C/C++；依赖和构建说明不进入卡片，按业务项目管理版本化项目配置并由场景引用。CodeAgent 只获得编写所需的语言/依赖约束和输出路径；完整构建配置交执行器。每轮独立工作区，框架固定卡片/配置版本、实际读取白名单和输出位置，以工具权限及进程隔离防止读取原始实现、独立接口、参考测试和其他角色/运行材料。输出沿用 files 的 path/content，由框架校验后写临时目录，后续比较、编译、评测。

设计写入现有 Agents、Application、Workspace 和 AgentAdapters；需求 KF-SYS-003 同步读取边界，新增 KF-SYS-044/045 与 AC-CONFIG-001、AC-CODE-001/002，追踪保持 Planned。Status 将 S2-05.a 记为设计已确认、b～d 待开发，AgentDevelopment 明确旧样例与目标区别。ProjectProfile.json 是拟采用名称，未创建加载入口、Schema 或空配置。具体机器字段、存储位置和契约版本兼容在实现时确定。

基线 main 为 96d277b，沿用本会话原有未提交文档改动。本次未改业务代码、Schema、测试或样例，未运行角色、真实模型或业务回归。npm run validate:specs 已通过（schemas=17 commands=7 results=8 p0=52）；本轮交付同时进行文档链接、文件清单和 diff 静态核对。旧实现仍单独传 publicInterfaceRefs，以 scenarioRef 充当 buildContractRef，并有可关闭的进程隔离；C/C++ 评测链尚未实现，不能宣称目标已可运行。

未决：TestGen 的 IO-02 输入/测试预期依据继续确认中，不能因为 CodeAgent 已确认就替其选择源码或知识卡片。其用例复用规则、其余角色输入输出及五业务阶段接线继续逐条讨论。后续若进入 CodeAgent 实现，应从 S2-05.b 开始；本次请求仅写文档。

已先把 2026-09-08-1420 原交接汇入 HistoryEpitaph 并保留固定提交链接，移除旧文件后仍只留最新三篇。更早 1001 交接中“其他输入未确认/首个角色未指定”的快照由本篇更新，历史账号偏好不作跨会话规则。
