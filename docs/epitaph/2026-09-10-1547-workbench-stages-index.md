<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接可恢复阶段任务与独立索引的真实实现，保持完整工作台目标。
-->
# 五阶段任务基础与独立索引；完整目标仍在进行

## 位置与授权

继续在 `/tmp/domain-knowledge-workbench`、`feat/five-stage-workbench` 工作，上一提交26e3b48。原 wxc 在途代码不覆盖，只向其墓志铭目录复制交接指针。Node24.13.0，独立依赖已 READY，所有重测试串行、NODE_OPTIONS=--max-old-space-size=384。线上 `/tmp/domain-knowledge-taste`、4310及原隧道未改动，未重打 v0.2.0。

用户“继续”指原五阶段完整计划，不是仅索引；goal 保持 active，未标记完成。上一轮提交是有效进展。用户已授权空间不足时删除旧知识库，本轮未删除；磁盘仍约800MiB，内存波动但本轮测试可执行。gcc/g++/Clang/Make/bwrap 存在，CMake此前未找到。不要以旧知识目录4KiB的删除解决几百MiB的空间问题。

## 新增真实能力

- Domain `services/workbench/StageTask.ts` 定义 knowledge-workbench-v1、固定五阶段身份、冻结输入、累计预算与恢复条件。无默认固定三轮上限。
- `WorkbenchStages` + `SqliteStageTasks` 实现 SQLite 单执行租约、持久化状态/事件/检查点/幂等用量；取消传播后等待 handler 清理完成才释放槽。Linux owner 使用 bootId/PID/startTime，不基于超时抢占。旧契约只读，旧死进程仅回收技术租约，不改写旧执行快照。
- 同输入成功任务复用，失败/暂停/取消显式同 inputDigest 恢复，不重置 attempt 或用量。调用前预留和实际 tokens 分开。外部副作用仍必须使用提供的幂等键，不能宣称模型恰好执行一次。
- 实际接通 INDEX handler。`KnowledgeIndexService`、`SqliteKnowledgeIndex` 生成 YAML + 原正文 Markdown，CAS 与 SQLite 记录可恢复工件。仅变化卡片更新，未变更复用；部分失败保留卡片与已完成检查点，修复后同任务恢复。bodyDigest 与元数据摘要分开。失效项排除检索并报告 stale/missing。
- 知识页“知识索引与试检索”支持构建、统计、取消/恢复、失败卡片入口、实际命中原因及 YAML 预览。查询不读正文，打开命中才读；进入页面不自动构建，无主动搜索或模型调用。免登录及跨站限制复用现有边界。
- API：POST index-builds；GET knowledge-index 与 knowledge-index/:cardId；GET stage-tasks 与详情；POST stage-tasks/:id/resume 或 cancel。没有暴露让用户填原始 StageInput JSON 的通用启动入口。
- Specs/Operations 已更新，新增实际有代码的 Workbench 设计。按新工作树 AGENTS 规则将1141/1227历史归入HistoryEpitaph并保留固定Git对象链接，原 wxc 历史文件未删。

## 验证

- 类型、Spec验证通过；完整 contract 29/29（含架构8项）。
- 完整 integration 170/170，日志 `/tmp/workbench-stages-integration.log`。
- Console 全量28/28，日志 `/tmp/workbench-index-ui.log`；最后的 UI 观察竞态与状态/中文命中词调整后，2项受影响回归通过，日志 `/tmp/workbench-stages-ui-targeted.log`。
- 新增7项集成验证真实 SQLite、真实退出子进程、跨连接取消保持槽位、用量不重置、旧契约只读、索引首建/单卡更新/检索不读正文/重复恢复文件/部分失败恢复。
- 390px截图已审阅，无页面横向溢出；本轮截图为受控浏览器数据，不是 C/C++ 真实模型证据。截图在 `/root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/index-desktop.png` 与 index-mobile.png；定向 UI 输出中有更新版，提交前可复制替换。
- 前一轮45项单元、19项既有 acceptance 已通过；本轮尚未重跑 acceptance，不将旧结果标为本轮运行。

## 下一步，保留完整原目标

接通代码仓分析、固定提交、模块/公开接口提取、环境/资源检查及前台参数，然后实现 GENERATE 的实际七角色调用与多卡片提交。仍缺 FLYWHEEL/EVALUATE/ASSOCIATE handler、一键顺序链路、C/C++ 工具链、测试缓存/晋升/修订、外部材料关系、真实 jsmn/TinyXML2 运行与最终网站部署。

现有 `AgentExampleService` 每次新建Run，仅供开发，不可直接拿来冒充可恢复生产阶段。生产 `RoleExecutionService` 和 Domain AgentExecutionService 可复用，但需给阶段绑定稳定 Run/生成键及冻结模型配置。Code 的材料隔离必须保留：单头文件 jsmn.h 同时含实现，不能把整个文件当公开接口交给 Code；应提取单独声明材料。现有 ModelExecutionFactory 会拒绝 Code 的 readablePaths 与 sourcePaths 重叠。

C/C++ 执行应先检查现有 ModuleCaseExecutor 的 captureIsolated：有 namespace/网络隔离、进程组取消、时间/输出/地址空间限制，但尚无新的 C/C++ 测试协议或进程数限制。旧 TS 评测需通过同一语言边界保留回归。不要把实现复制到 Code 可见目录或修改可信测试预期。

一键流程在 FLYWHEEL/EVALUATE 产生新卡片后，先提交阶段并刷新索引再推进；不要在持有全局阶段租约的 handler 内启动并等待另一个阶段，否则会死锁。可复用索引应用用例，但需保留统一阶段审计。资源预检查/进程数限制/无进展暂停尚待接入实际模型编译 handler，不能把现有单租约测试当作完整资源验收。
