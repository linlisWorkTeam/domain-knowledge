<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：知识实体与正文差异设计。
-->
# 知识实体与正文差异设计

代码位置：[src/domain/Domain.ts](../../../../../src/domain/Domain.ts)、[src/domain/services/knowledge/MarkdownDiff.ts](../../../../../src/domain/services/knowledge/MarkdownDiff.ts)。


## 实体与不变量

ArtifactRef 以 sha256、大小和媒体类型描述正文。KnowledgeVersion 保存版本身份、moduleId、父版本、正文引用、来源与状态；同模块同正文可去重，修订创建新版本。Run 保存业务状态和当前轮次；非法状态迁移由 Domain 拒绝。

CANDIDATE 是未发布版本；质量评分 ACCEPTED 只表示可进入后续生成和评测。VERIFIED 必须关联有效 Gate 与唯一发布回执；被后继发布替代的版本保留 SUPERSEDED 历史。LOW_CONFIDENCE 保留停止证据。回滚状态仅为迁移兼容，当前不自动选择历史最优并回滚。

生命周期规则归属 [workflow](../workflow/Workflow.md)，Gate 判定归属 [evaluation](../evaluation/Evaluation.md)，事实提取和关联校验归属 [association](../association/Association.md)。

## 查询与差异

MarkdownDiff 对正文做结构化行差异，给出段落与范围校验信息；Application QueryService 与内容治理服务提供血缘、关系、评测、来源和反馈投影。查询不改变发布状态。HTTP 管理目录可读取多个状态，消费端若只接受已发布知识必须明确过滤和验证正文。

## 持久化交接

Domain 产生状态、事件、工件描述和 Gate 判定；Application 协调写入，SQLite 实现事务、幂等和约束。领域代码不直接更新数据库。内容评分的现有实现位于 Application QualityPolicy，所属设计在 Application 文档中说明。


文档关系：[设计目录](../../../README.md)负责代码与设计定位；[开发指南](../../../../Development.md)说明修改和交付步骤。

## 稳定卡片目录（已实现）

`KnowledgeCards.ts` 将不可变 KnowledgeVersion 投影为当前卡片与历史。优先读取持久化 metadata.cardId；否则以 metadata.repositoryId 与 moduleId 的摘要确定身份。标题、来源提交、正文不参与身份计算。旧记录没有仓库身份时，只按明确父子血缘合并；不能以同名模块猜测同仓库。循环血缘显式失败。父子版本同毫秒落盘时选择叶版本；分叉叶版本按时间和版本号确定可重复顺序。

目录读取只访问 SQLite 已有版本元数据；正文、原始门禁和来源不改写。`GET /api/v1/cards` 返回当前版本和精简历史；摘要匹配返回命中词。旧全文检索继续保留在版本 API。当前目录只负责读取；YAML 工件与增量索引由下面的独立阶段负责。

## 独立索引阶段（已实现）

`KnowledgeIndexService` 冻结当前卡片版本与元数据摘要，经 WorkbenchStages 执行 INDEX。索引摘要绑定正文引用、标题/用途/关键词、来源、适用条件和状态；bodyDigest 独立保留，不将纯元数据变化解释为正文变化。每张卡片独立检查点，未变更项复用，仅变化项读取正文并更新索引。一项失败不撤销卡片及其他索引，阶段报告 INDEX_BUILD_PARTIAL，修复后同任务恢复。

YAML 包含 cardId、versionId、name、purpose、applicability、language、module、keywords、sourceVersions、summary。缺适用条件明确标注，语言无法确定时写 unknown。渲染使用 YAML 序列化器；本地 Markdown 包含 YAML 头和原正文，正文 CAS 不改写。文件仅由稳定 cardId 编码命名，过长身份使用摘要文件名，标题/版本变更不改路径。SQLite 保存卡片索引、CAS 引用和独立正文摘要。文件删除或内容不符时从既有 CAS 恢复，不重复创建版本或发布。

检索只读取索引摘要与 SQLite 元数据，返回实际命中词、字段和确定性加权分数；用户打开命中后通过既有版本 API 获取正文。卡片版本或元数据改变后，旧项计入 stale 并排除命中；missing 明确报告未建索引数量。YAML 预览只读取 YAML 工件，不读取正文。这不是向量检索或主动联网搜索。

## 五阶段能力与剩余目标

版本化阶段调度、C/C++多卡片生成、INDEX、代码重建、可信行为评测和库内关联已接通，一键执行调用相同单阶段用例。测试缓存绑定正文/参考/策略/工具链，继承历史可信门禁；库内关系按两端版本及索引摘要失效。自动知识修订和最终发布仍待实现，修订后必须先刷新索引再推进，不能把阶段成功当成发布资格。

外部材料仅来自用户指定文档或链接，禁止主动搜索；无材料仅建立库内关系，无适用关系如实返回。

C/C++ 与 TypeScript 共用语言工具链边界。C/C++ 使用服务器已有工具，源码与候选分别隔离构建；Code 只获得知识、公开接口和构建约束。候选测试先在参考实现验证，失败不得晋升，可信测试不可因修订失败删除或改预期。缓存绑定知识正文、源码和接口、测试策略与工具链摘要。确定性接口、结构与规范化差异须报告口径，不能覆盖编译或关键行为失败。通过可信行为门禁后才允许验证和发布。

资源要求：生成和构建全局串行，模型串行，单进程编译；Node 堆上限 384 MiB，编译测试限制内存、进程和超时，取消杀死整个进程树。启动检查资源，不足时暂停；不降级隔离。不恢复固定三轮限制；取消、供应商额度耗尽或持续无进展时暂停，恢复保留累计用量，额度查询失败不视为无限额度。

实际验收目标是固定提交的 jsmn、多卡片 C 链路，以及 TinyXML2 XMLUtil 类型转换模块的 C++ 链路，保留 markdownLite 回归；卡片目录和受控回归不能证明真实链路质量。每次执行器契约变化都需重新取得对应真实证据；当前部署仍待完整验收。
