<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：记录五阶段工作台尚未完成的实现及验证边界。
-->
# 五阶段工作台：部分基础实现，原任务未完成

## 工作位置与目标

工作树 `/tmp/domain-knowledge-workbench`，分支 `feat/five-stage-workbench`，基线 `da69cb9`，来自线上源码 `/tmp/domain-knowledge-taste`。已使用 Node 24.13.0 完成 bootstrap READY，依赖为本工作树独立安装。原 `/root/projects/domain-knowledge-wxc` 的旧版在途修改未参与集成；不能将这次改动直接套用到该旧版树。没有改动线上服务、发布包或 v0.2.0。

用户要求完整五阶段工作台和 C/C++ 真实闭环，包含阶段任务、生成、增量索引、重建修订、可信测试及关联，并进行真实模型、浏览器和部署验收。这里仅完成下列部分，不能声称整个第一阶段或整份计划交付。

## 已实现

- Domain `KnowledgeCards.ts`：显式 metadata.cardId 优先；repositoryId+moduleId 确定稳定身份；无仓库身份的旧版本只按确切血缘归组，不推测不同仓库的同名模块相同。标题/来源提交不影响身份，同毫秒父子选择叶版本，循环血缘失败。
- Application QueryService 和 `GET /api/v1/cards`：只读 SQLite 已有元数据、返回当前版本和历史摘要，按当前状态筛选、摘要匹配及命中词；versionId 可反查所属卡片。不读正文，不改写旧记录、门禁或来源。尚无新的卡片写入生命周期/持久化表。
- 知识页使用卡片目录，历史放到详情；保留正文、血缘、差异及反向导航。旧全文搜索 API 保留，前台摘要搜索明确标注范围。
- 匿名 directEditing 下下载不再要求前台令牌；请求有令牌时才发送 Bearer。工作流使用 executionStatus，缺事实显示未知，不算未开始。
- Node 24 下三个测试脚本改用明确的 *.test.ts 匹配；此前直接传目录导致 MODULE_NOT_FOUND，未删除或放宽断言。
- 现有 Knowledge、HttpApi、UiuxDesign Spec 同步，待实现部分明确标注目标。

## 验证

Node 堆上限 384 MiB；安装、集成与浏览器测试串行。

- typecheck 通过；validate:specs 通过（17 schemas / 7 commands / 8 results / 51 p0）；architecture 8/8。
- test:domain 45/45，含新增5项稳定身份/历史/摘要读取测试。
- test:integration 163/163，日志 `/tmp/workbench-integration.log`。
- test:acceptance 19/19，日志 `/tmp/workbench-acceptance.log`。这是既有测试/受控 Provider 验收，不是本次 jsmn/TinyXML2 真实模型运行。
- Console 全量27/27；最后的卡片历史反查与命中词显示调整后，重新执行4项受影响的浏览器回归。
- git diff --check 通过。

## 未完成与下一步

尚未实现统一阶段任务及 SQLite 审计/恢复、仓库分析与模块选择、自动多卡片生成、YAML/增量索引、语言工具链接口及 C/C++ 执行、可信测试缓存与修订、外部材料关系索引及回退、一键执行。没有 jsmn/TinyXML2 固定提交或真实运行编号；没有本任务前后截图交付和网站更新。不能以这些回归代替完整产品验收。

优先实现版本化阶段契约和持久化，冻结输入、配置与累计预算，再把生成/索引接到同一用例。继续复用 Domain 七角色和 Infrastructure 隔离适配；不要将 AgentExampleService 的开发样例入口直接充当可恢复生产阶段，因为它每次新建 Run。旧执行只读，不跨契约恢复；Code 禁止读参考实现/隐藏测试，候选测试先参考验证，固定及可信测试不改预期；无主动搜索，无新增登录系统，不恢复固定三轮总上限。

## 资源与授权

检查时根盘60G，剩约796MiB；内存约3.6GiB，无Swap，可用内存随现有服务波动。gcc/g++/clang/make/bwrap 存在，cmake 未找到。已发布知识正文目录只有4KiB，运行数据约25MiB，主要磁盘占用包括旧工作树依赖；不能把删除知识正文误当成足够空间。

用户明确授权空间不足时可以删除以前生成的知识库；本次没有执行删除。这项授权不自动扩展到删除活跃工作树、源码、配置或其他会话证据。保持线上免登录部署；模型/编译串行，资源不足明确暂停，不降低隔离。
