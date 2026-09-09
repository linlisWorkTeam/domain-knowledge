<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接产品界面受控验收用例与安装脚本审查修复。
-->
# MVP 产品视觉与打包审查交接

承接前份产品交接，在同一已 bootstrap 的独立 worktree 编写新增 Console 验收。`tests/e2e/ProductConsole.spec.ts` 提供五个受控用例：服务器目录与固定模块入口、真实批次投影及取消、发布设置默认关闭与脱敏保存、Git 认证/冲突保留知识、两张设置/正文阅读视觉基线。已补原本缺少的取消按钮，调用既有取消 API。旧通用场景非法路径与正常请求断言保留到 API 测试，页面只使用固定模块入口；既有 ActionCenter 截图不变。

按主 Agent 的 ECS 资源约束，未运行浏览器、安装构建或 DSH。TypeScript、Playwright 测试清单加载（5 个新增用例）、JS/shell 语法与 diff 检查通过。主 Agent 应先运行新增视觉用例并仅生成两个新基线，再审阅截图并正常回归；不能把测试定义当已通过视觉证据。现有 Provider 连接失败及知识修订对比用例继续复用。

打包审查修复：Git helper 原系统相对链接在 tools 布局下失效，改为重建包内链接并建立 Links.json/VerifyBundle.mjs；校验 TypeScript 7 Linux 原生编译器并记录摘要；加入 OpenSSH、prlimit 及动态依赖，系统 RPM 版本/许可证/source RPM 清单；gzip 使用无时间戳模式并修复完成事件监听竞态；安装仅限专属目录、数据权限 700、拒绝敏感配置符号链接、升级启动器原子替换、失败清理临时链接。停止脚本校验具体数据目录参数，避免陈旧 PID 影响另一安装实例。

待主 Agent 核对服务 SIGTERM 到活动工作流/DSH 的取消传播；不要仅依赖主进程退出。发布流程仍需集成、实际离线包、干净安装与真实模型验收。所有产品测试与视觉数据均是受控 fixture，不是模型验收结果。
