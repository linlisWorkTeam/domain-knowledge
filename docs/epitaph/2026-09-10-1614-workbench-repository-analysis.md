<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接固定源码分析入口，保留完整工作台目标与未完成范围。
-->
# 固定源码分析已接入；完整五阶段目标继续

## 工作位置

在 `/tmp/domain-knowledge-workbench`、`feat/five-stage-workbench`，前序提交0265f60。Node24.13.0、独立依赖READY、堆384MiB，重测试串行。原wxc在途代码不覆盖，线上taste/4310和既有隧道未更新，v0.2.0不重打。goal继续active，不应把仓库分析当作完整交付。磁盘约808MiB；用户允许不足时删旧生成知识，但旧知识很小，本轮没有删除。

## 本轮实现

Domain RepositoryAnalysis定义语言、文件和模块候选；同名源码/声明分组，测试、示例不进入默认生成范围。不支持语言、大文件、混合具体语言明确标识。它只是候选启发式，还没有AST/公开接口提取。

GitRepositoryAnalyzer校验真实目录允许根、Git顶层及固定提交，只读ls-tree对象/大小，不混入脏工作区、不读测试正文、不跟随符号链接、不展开子模块。命令无shell，时间/输出受限，取消杀整个进程组；Git设置禁止惰性抓取，本机Git2.43.7二进制确认含GIT_NO_LAZY_FETCH支持。工具探针串行，环境不足失败关闭；工具存在不代表构建或隔离验收。

Application将稳定源码manifest存CAS，实时工具/资源观测不影响manifest身份。HTTP POST repository-analyses和操作中心目录/版本表单接通，显示模块、工具及构建配置存在性。新请求清除旧结果，失败不显示上次提交。没有假生成按钮，明确生成尚未开放。

## 已验证

类型、Spec、架构8项通过，完整integration172/172；完整Console29/29。首页新增入口导致截图基线改变，已审阅更新，原几何断言和1%阈值保留。最终新增失败清除状态的定向浏览器1/1通过，结果见 `/tmp/workbench-repository-ui-targeted.log`。证据保存于 `/root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/repository-analysis/`，是受控Git及浏览器证据，不是C/C++真实模型闭环。

## 下一步

继续项目持久化、冻结模块选择/构建参数、公开接口与固定源码材料提取，然后生产GENERATE多卡片。不要借用每次创建新Run的AgentExample冒充可恢复执行。复用RoleExecutionService、Domain AgentExecutionService，阶段绑定稳定Run/生成键及冻结模型配置。现有ingestCandidate按moduleId+body去重、按moduleId串版本；新多卡片必须明确稳定cardId和存储模块身份，防止不同卡片错误串历史。模块候选路径可含斜杠，不能直接传给要求slug的ingestCandidate。

后续还需C/C++工具链与统一TS边界、FLYWHEEL/EVALUATE/ASSOCIATE、可信测试缓存/晋升/失败修订、指定外部材料关系和一键顺序链路。Code不可读取参考实现，jsmn单头文件必须提取独立公开声明。不能持全局阶段租约再启动并等待INDEX；修订后释放阶段并刷新索引再推进。真实jsmn/TinyXML2 XMLUtil固定提交和模型验收、markdownLite回归、最终网站部署均未完成。
