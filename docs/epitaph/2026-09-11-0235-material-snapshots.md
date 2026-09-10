<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接指定外部材料快照实现和剩余关联接线。
-->
# 指定外部材料快照

工作树 /tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线525690a。上一轮和本轮均有实际进展，完整goal保持active。原wxc、线上taste/4310、v0.2.0未改；无模型/native验收进程，未清理知识库。当前磁盘约264MiB，所有重验证串行。

新增Domain ExternalMaterial：external-material-v1，身份绑定来源ID、固定sha256修订、正文摘要、适用条件。WorkbenchMaterials通过reader/extractor/store端口读取并校验同次读取字节，保存raw/text CAS和SQLite不可变快照。SqliteExternalMaterials复用registry数据库，不单独close共享连接；重复捕获返回首次快照。Source读取复用SQLiteContentGovernance：FILE根目录限制和HTTPS允许主机/地址固定/禁止跳转不变，不主动搜索。读取前后检查来源记录修订，实际字节偏离固定版本即拒绝，不能用未确认变更捕获。HTML/文本转换在Infrastructure MaterialText；仅UTF-8文本/Markdown/HTML/JSON，2MiB上限，去脚本样式和标记，原文保留。FILE预先检查10MiB读取上限。

HTTP external-materials GET列表、POST{sourceId,applicability}捕获、GET/:id读取快照与正文，遵循现有免登录/同站边界。来源详情新增适用条件表单和捕获/查看正文，错误就地展示。材料本身不授予知识质量状态。目前外部材料尚未接入关联任务，也未接入一键输入，旧ASSOCIATE仍库内关系。这是下一步，不得把快照能力称为完整外部关联。原文CAS尚无专用下载端点，后续关联证据可以加入冻结原文引用及下载。

验证通过：typecheck、Spec、architecture8、integration202、Console31；截图发现材料长标识被CSP禁止的inline样式导致截断，改为Styles.css规则，新增抽屉内部scrollWidth检查并独立重跑来源浏览器通过。未修改视觉基线/降低断言。原来源名称全页查询因抽屉新增同名标题产生重复匹配，改为source-card内同名可见断言；原漂移/确认/scan失败断言保留。测试覆盖原文证据、重复/重启复用、漂移拒绝、UTF8/二进制/格式/容量拒绝、受控HTTPS只读登记地址一次；本轮无真实外部HTTP验收。证据 /root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/materials/ 包含报告、日志和桌面/390截图。所有测试已terminal。

下一步：WorkbenchAssociations.prepare新增显式materialIds选择，冻结材料修订/正文摘要。纯Domain根据外部正文明确符号提及生成证据关系，记录行/片段/来源/双方适用条件，不声称行为可替代。Application读取CAS，不重读当前URL、不搜索；无匹配返回真实空列表。UI关系页需区分卡片候选和外部引用。一键材料选择需冻结于新pipeline契约，不能中途拾取新增材料或改写v1输入。旧无材料v1关联保持可读和独立复用。后续仍缺规范化/结构代码差异、证据定位知识修订及迭代、固定发布门禁、TS边界/markdownLite、构建配置实际使用、统一多项目导航、最终双目标真实链路和部署。当前jsmn一键31/31及运行目录见0233交接；TinyXML2旧37/37仅旧指纹证据。
