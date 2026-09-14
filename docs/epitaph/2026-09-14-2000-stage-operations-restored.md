# 分步入口恢复与完整浏览器回归

目标 active，本轮 progress。独立树 /tmp/domain-knowledge-workbench，原用户树不动。上一提交9117c44已推PR50，仍Draft。网站未更新，仍以1954交接中的5c72fa5为最近核实版本。本轮没有改运行站点或启动真实模型。

飞轮批次新增“阶段操作”进入独立子页，使用当前左上角项目的冻结模块范围，挂载原KnowledgeGeneration及重建/评测/修订/一键流程控件。项目设置页不重加执行面板。此处独立任务不冒充批次轮次；后续仍需审视独立任务与模块批次的统一调度/归属，不能声称所有产品要求已满足。刷新后治理令牌模式曾因boot未授权读取项目而丢失选择，现授权后重试同snapshot，保留原项目范围且不猜测其他项目。

原Console串行7阶段回归已迁移到新入口，目录冻结断言改为实际WORKTREE快照，保留构建参数、候选拒绝、代码隔离输入、固定/可信失败、下载、重载恢复、修订版本和可信用例保留断言。首轮3过后因项目授权恢复失败，其余未跑；修复后7/7通过，/tmp/StageOperationsBrowser2.log。类型/Spec通过，/tmp/StageOperationsTypes.log、Specs.log。全量浏览器/tmp/StageOperationsFullUi.log，exec2705，启动41项；交接时必须检查终态，不将专项7/7当全量。UI未部署，CI仍需新提交检查。

真实C修订stage-05ccb3e4944ad031679afc287e6dea5e45bab418a84d72a2efdbdc61df9217c7的335个工件引用（包含嵌套JSON）摘要/大小审计通过，证据c-source-assessment-v1-revision/ArtifactAudit.json。4卡中3张REVISED、1张UNRESOLVED，无发布。新版本kv_37e33d96080e0d43438e784c、kv_c621aab746db414420add389、kv_69a4f79d9f3deeecc5b9e744。未解决卡kv_786d7b345821f53f2893ab4d的模型复核声称stddef.h不提供C++ NULL，需实际编译证据核查，不能无证据清除风险或修改可信期望。旧可信/固定门禁只适用旧版本。没有活跃C驱动，完整C/C++来源与发布验收仍待完成。

下一步：检查完整UI终态并修复实际回归，提交推50；更新网站前核对活动运行/PID/发行依赖和备份（symlinks=True），保留用户数据和tunnel；历史批次及衍生产物删除仍仅两个未跟踪领域草稿，没有删除API或二次确认UI。继续完成安全删除及真实C/C++闭环，最终再依用户授权比较处理38/50。禁止主动搜索、放宽门禁或泄露配置。

最终验证补记：全量41项中39通过，2个旧入口测试失败（一键汇总、免登录发布）；迁移到阶段子页后定向2/2通过，/tmp/StageOperationsFinalPaths.log。保留发布单条幂等、下载、重载与窄屏断言。类型再次通过Types2.log。不能表述为一次全量41/41；生产改动在全量运行后未再修改。最新CI随提交触发，未部署。
