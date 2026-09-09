<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接七角色 MVP 验证组实现、实际验证与集成边界。
-->
# MVP 验证组交接

目标为固定 ohMyWorkPanel 模块的可信测试、独立重建评测与定位修订。工作树 `/tmp/domain-knowledge-mvp-validation` 使用独立依赖，Node 24.13.0 的 bootstrap 检查为 READY；默认 shell 的 Node 22 不适合运行本仓库。

已交付 TestGen 声明式 module-cases-v1、案例说明和可执行复现脚本；模块策略强制正确 modulePath/exportName、suite 和 oracleRequired=true。旧候选命令只保留兼容读取。Code 拒绝非法输出白名单；Check 阻塞绑定生成文件及行号；Review 绑定评测与 Check 工件，复用 DocGen 的 Markdown 章节解析，排除代码块伪 H2 并拒绝越界纠正。

模块评测只读取固定提交的授权单文件。参考源码与公开接口分别存储内容工件，生成运行空间没有参考树或测试。严格 TypeScript 编译及公开接口检查后，仅挂载 JS 和固定执行器；bwrap 全命名空间隔离、Node permission、独立 JS 全局和宿主 JSON 深比较共同阻止源码访问、执行器污染与伪造测试计数。五次重复串行；失败不删案，未执行案例保留在总数。固定门禁冻结及候选参考晋升由主 Agent 的 Application 接线负责。

ECS 限制通过共享模型执行槽保证模型与评测重进程互斥。运行堆 64 MiB / 地址空间 1 GiB / 5 秒；编译单核、GOMEMLIMIT=128MiB / 地址空间 2 GiB / 30 秒。排队、读取 Git、运行案例均响应取消；超时与输出超限杀进程组。没有隔离工具时失败关闭。安装包必须保留 TypeScript 平台包完整 lib 目录以及 bwrap、prlimit。

实际验证：4 角色与 Linux 隔离集成共 36/36 通过，19.14 秒；typecheck 通过。覆盖错误参考预期、接口类型失败、序列化伪造、动态导入与路径越权、超时、输出上限、排队取消、运行取消后 ps 无残留、隔离工具缺失。证据 `/tmp/mvp-evidence/validation/RoleAndIsolation.tap`、`Typecheck.log`。所有运行串行，没有执行 DSH、真实模型、浏览器或完整回归。

核心提交 b432f27，角色提交 62c3cd5；最终补丁包含共享重进程槽、取消补全、模块策略 Schema 与负向测试。依赖主 Agent 已合入的共享契约及知识组 DocGenRevision。旧任意项目命令评测仍是兼容的可信项目模式，不能作为独立模块隔离验收证据。主 Agent 继续完整回归、真实飞轮、发布/浏览器及安装验收；本交接不宣称整个 MVP 或 Release 已验收。
