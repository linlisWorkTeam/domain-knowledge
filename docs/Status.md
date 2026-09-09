<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：记录七角色 MVP 的实现范围、实际验收证据与发行阻塞。
-->
# 七角色 MVP 实施与验收记录

目标版本为 `0.2.0`，环境限定 OpenCloudOS 9.4 x86_64，代表模块为 ohMyWorkPanel 的 `src/chat/markdownLite.ts`。当前已实现闭环和 Linux 安装候选；真实模型验收尚未执行，不能视为已验收 MVP，也未创建正式 GitHub Release。历史单角色 live 记录不能替代本次七角色验收。

操作见[Linux 安装指南](LinuxInstall.md)，工作流约定见[Workflow](specs/domainFunction/workflow/Workflow.md)、[LangGraph](specs/infrastructure/langgraph/LangGraph.md)，七角色设计见[Agents](specs/domainFunction/agents/Agents.md)。历史交接见[HistoryEpitaph](HistoryEpitaph.md)。

## 实现与取舍

| 范围 | 本版实现 | 保留限制 |
| --- | --- | --- |
| Orchestrator | 授权路径、完整角色任务与依赖校验 | 固定拓扑；不调度全仓库依赖图 |
| DocWorker | 接口、行为、边界事实绑定源码文件、行号和原文 | 证据不足记录风险并阻止发布 |
| DocGen | 概要后正文；依据 Correction 修订指定 H2，未涉及章节字节不变 | 不支持更细段落范围 |
| TestGen | 声明式可执行行为案例、说明和复现工件；参考实现验证通过后晋升 | 不做覆盖率驱动搜索或混合变异 |
| Code | 只接收知识、公开签名和允许输出路径；独立会话/目录 | 仅验独立 TypeScript 模块，不验整个 Tauri 项目 |
| Check / Review | 约束检查、定位问题、评测/Check 证据绑定、H2 Correction 与未解决风险 | 复杂归因排序与停滞回退延期 |
| 评测与预算 | 固定门禁先冻结；参考/生成空间分离；内核隔离、严格编译、宿主比较、每案例 5 次重复 | 最多 3 轮、30 分钟；恢复不重置预算；缺少隔离能力拒绝任务 |
| 发布与 Git | SQLite 与工件审计、可恢复文件发布、幂等；手动 Git 默认关闭、冲突与认证失败可重试 | 使用独立知识目录；不强制覆盖远端 |
| Console | 模型配置、服务器目录、固定任务、取消、角色进度、失败证据、知识阅读、Diff 与 Git | 远程访问需要令牌和受保护的传输 |
| 安装 | 应用与数据分离，携带 Node/Git/DSH/隔离工具/编译器/依赖/许可证，升级卸载保留数据 | 仅指定 Linux；浏览器和基础系统工具由使用环境提供 |

[Issue #20](https://github.com/linlisWorkTeam/domain-knowledge/issues/20) 本版落实测试可信性、固定门禁、五次重复和预算；覆盖率优化、SBST、复杂信用分配/back-off 延期。[#33](https://github.com/linlisWorkTeam/domain-knowledge/issues/33) 落实来源、风险、两阶段生成和定点修订，全仓库依赖调度延期。[#34](https://github.com/linlisWorkTeam/domain-knowledge/issues/34) 落实受限上下文和接口/路径约束，通用检索和分层渐进生成延期。[#35](https://github.com/linlisWorkTeam/domain-knowledge/issues/35) 落实证据绑定和 H2 精度，历史薄弱点排序/复杂停滞升级延期。四个 Issue 保持开放，未声称全部完成。

## 固定基线与隔离

源码提交 `1bf4c5894b3f196d2e2aba1d8db3aac77aef7095`；源码 SHA-256 `8783c8e83822a97dd25a79e35860b6fe5dc8cf5ae663935db33f266edf645e4e`；参考测试 `0f4db3eda161b93aebb462331deed18c7d3a0d81f96c32a72b68231bf4f8217b`；依赖锁 `6d490bc60496109e58b0c0f9222e1c15fc94f9189d9fbafa93c73c3f3881cf4c`。入口核对固定 Git 对象，原仓库只读。28 个固定行为案例在模型生成前冻结。

执行信封版本为 `seven-role-mvp-v2`；旧记录可读，不跨版本恢复。TestGen 看不到生成知识/实现，Code 看不到参考源码/测试/隐藏门禁；源材料、公开签名与模型可见场景分开存储。沙箱不挂载原仓库，禁止路径穿越、动态导入和通过输出篡改执行器计数。发布要求构建、固定案例、已晋升候选案例、稳定性、Check、Review 及来源证据共同通过。

ECS 约 3.6 GiB 内存、无 swap。模型与模块评测共享一个进程槽，编译器单核，Node 小堆；回归、浏览器与打包按顺序执行。预算涵盖排队和重试，取消/超时杀死子进程组。

## 验收证据

受控角色输出用于确定性回归，原生 DSH 协议使用受控模型端点；它们不计入真实模型验收次数。视觉使用固定数据，新增截图已审阅目录、状态、阅读内容和窄屏溢出。

| 验收 | 实际状态 | 证据 |
| --- | --- | --- |
| 固定参考模块 | 28 案 × 5 次，140/140 通过 | 参考评测报告，摘要 `6da15dda45a39e98644764116d8327e27db508c75a25a873ef86e6e2dbb26477` |
| 完整模块飞轮 | 5/5，通过首次发布、定点修订、错误 oracle 拒绝、轮数停止、风险拒绝 | `tests/acceptance/ModuleFlywheel.test.ts`，实际隔离编译与执行 |
| 原生 DSH | 12/12 受控协议测试通过 | 原生工具、配置、工作流及 DocGen 示例测试 |
| Console | 19/19 通过，已有视觉断言保留 | `tests/e2e/Console.spec.ts`、`ProductConsole.spec.ts` 及 snapshots |
| 实际安装浏览器 | 配置空态、治理认证、目录浏览、Git 默认关闭、固定入口和 640px 窄屏通过 | 无 API 模拟；截图前隐藏认证框及临时提示；启动表单字号修正为 14px |
| 最终自动化回归 | 279/279；类型检查通过；规范检查通过（17 Schema / 7 Command / 8 Result / 51 P0） | 包含架构、契约、角色、恢复、取消、反越权、Git 和发布 |
| 离线安装 | 通过；包内参考门禁 140/140，完整飞轮 5/5，原生 DSH 隔离 1/1 | 断网最小系统目录，启动/重启/升级/卸载及数据摘要核对 |
| 真实模型 | 0/3 次；找到既有 API 地址，但缺少本次可用运行凭据 | 不提供虚构运行 ID、模型门禁或本地发布路径 |
| GitHub Release | 未发布 | 真实完整飞轮至少 1 次通过后才可发布已验收 MVP |

发行物必须来自同一受测提交，包含安装包、SHA-256、工具依赖清单与第三方许可证；安装及模块构建不下载依赖。真实模型和 Git 同步仍需联网。版本标签检查时 `v0.2.0` 未被占用，正式发布前再次核查。Windows、任意项目工具链、多语言及复杂回退均不在本版验收范围。

## 安装候选与证据边界

首次完整安装验收使用提交 `8874368a97db828ae0280593d11d5123001dbf18`，随后修正启动表单字号并重验 Console。最终候选的提交、大小与 SHA-256 以同目录 `Manifest.json`、`.sha256` 和证据包 `Acceptance.json` 为准，避免在被打包的文档中自引用安装包摘要。应用回归通过后，安装实测修复了 node-pty 的延迟动态库遗漏、glibc/musl 插件区分及显式安装目录对 HOME 的多余依赖；没有修改门禁预期或削弱隔离。

干净环境使用当前 OpenCloudOS 9.4 主机上的最小系统目录，外网关闭，只保留系统 shell、基础文件工具及其运行库，预检确认没有 Node、npm、Git、bwrap、prlimit、编译器或 DSH。受控 HTTP 模型端点仅在隔离回环地址上运行。外层验收环境保留宿主 proc 以支持内层创建用户命名空间；角色与评测仍使用产品自身的完整隔离。这是同内核的干净文件系统验收，未声称在另一台全新虚拟机上验收。

首版没有历史安装包，升级测试把已安装版本移至模拟旧版本目录，再安装同一候选，核对配置和 SQLite 摘要保持不变；重启后 HTTP 检查通过。卸载后再次核对这两类数据保留。修复前的失败证据保留在证据包中，不能用作当前候选的通过记录。

安装候选、工具清单、许可证清单与独立证据包保存在交付目录 `domain-knowledge-releases/v0.2.0-candidate/`。`Acceptance.json` 区分受控回归、安装验收和真实模型；不包含 API Key、访问令牌、数据库或模型响应原文。后续须提供本机凭据配置位置，在浏览器验证连接后执行 [真实验收入口](LinuxInstall.md#真实模型验收入口)，至少一次完整通过才可发布正式 Release。
