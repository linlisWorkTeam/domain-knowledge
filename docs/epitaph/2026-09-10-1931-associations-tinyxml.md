<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接关联阶段、TinyXML2真实运行与生成代码修复缺口。
-->
# 库内关联可操作，TinyXML2新工具链重建需修复

前序bdc8b1d，工作树 /tmp/domain-knowledge-workbench，分支feat/five-stage-workbench。goal继续active，有实现与真实证据进展，不是阻塞。所有本轮RunNativeWorkbench进程均已terminal，无实时模型/构建。线上taste/4310、v0.2.0与原wxc工作区未改；磁盘约213MiB，未删旧知识库。Node24/384MiB堆；编译、模型、浏览器重测试务必串行，浏览器会让原生576MiB可用内存预检暂停，不能降低门槛。

新增Domain CardAssociations经已有AssociationDomainService入口，按同仓库同源码版本正文的精确公开符号引用建关系，保留引用行/片段、双向版本/正文摘要、适用条件。只有提及事实，replacementVerified=false。Application WorkbenchAssociations注册ASSOCIATE，冻结当前卡片/索引，SQLite StageTask记录与CAS JSON关系索引可恢复；只失效受版本/索引变化影响的关系，保留同任务其他有效关系，跨任务按稳定ID去重。限制总正文8MiB、关系10000、卡片1000，无外部材料scope INTERNAL_ONLY。

POST /api/v1/associations {versionIds}与GET /api/v1/associations/:cardId，共用匿名授权、阶段取消/恢复及工件下载。知识页索引完成后可建立关联，显示状态和下载；卡片详情「当前卡片不适用」读已有关系、引用证据与关联版本，空结果和失效真实表达。外部材料读取/关系仍未实现；操作中心一键仍未实现。GettingStarted/HTTP/UI/Domain/流程图已更新，不能把引用关系宣传为替代实现。

真实jsmn关联 stage-efb20cc4a9458fe75a9be8af92722c2237657d21406945172ff383f5dd1d9a96 SUCCEEDED，7卡片40关系，首卡11候选。证据 releases/2026-09-10-workbench-progress/associations/JsmnAssociations.json。此前jsmn16/16行为通过仍是旧工具链历史证据；本轮引擎改变后最终发布前必须重新验证，不冒充当前工具链通过。

TinyXML2真实：runtime /tmp/workbench-native-acceptance-20260910；报告 releases/2026-09-10-workbench-progress/native-live/Tinyxml2Attempt{1,2,3,4}.json/log。
GENERATE stage-f7d15252d0e19737bf1da5b528f2f0596f9349fd7f2dad48d7d0985406aa28f9：Attempt1第12次模型输出ToInt64正文带未转义tab失败；原任务恢复后9卡片成功，累计19调用/1132300tokens/293372ms。INDEX stage-6cb7b213e4ce4361f6a3ef8feceed676f7b17c3a9833e487efbedafa0fe629dd 成功。
旧FLYWHEEL stage-c30834a8e3ae63f1f5e2c56d7a58f2e54e4f16da7f2ed1d5ca25533301c67699 首Code输出整个Tiny库105929字符后截断；Code原生动态提示补「路径白名单只限位置，declarations限定功能，不扩整库」。恢复后7KB代码接口compatible=true ratio1，累计2调用/108238tokens/145372ms。codeRef 9dde4789cc737419ba37c77c7a9c4dcefd2a0a7121db15aa201d01dd6010d7e5。
旧EVAL stage-37ca5f085bac69f8f8485e575cf8bbf5f8fa0aaf2fa47af07ad1e099e83442c6 参考baseline失败，0模型调用：sanitizer编译汇编临时文件超过原1MiB fsize，非模型问题。

修复IsolatedCommand受信fileSizeBytes选项，最多16MiB且超过1MiB须buildOutput+processLimit；NativeToolchain只编译用16MiB，运行保留1MiB，其余cgroup内存/CPU/网络隔离/超时不变。真实固定TinyXML2 reference在新上限成功编译运行，sanitizer开启，见Tinyxml2Baseline16MiB.json。NativeFingerprint自动改变，旧任务不可跨摘要恢复；新摘要须创建新重建任务。

Attempt4新FLYWHEEL stage-fb5de0539cd320c6c3547e69e4af4b1137b7e99027e69141abb6b020af5a3c72 FAILED NATIVE_INTERFACE_COMPILE_FAILED，1调用39213tokens/17046ms。模型漏定义TINYXML2_LIB，tinyxml2.h:60 class TINYXML2_LIB XMLUtil 被视作不完整类。诊断CAS a34a572698fafd24c24c85170dfff4012aae131a358958ba6f02c6e2c4e6effe，由wb_stage_events phase generated-interface-failed引用；目前只有progress引用，UI下载还未接该诊断。

下一步明确修复：WorkbenchReconstruction的成功Code子步骤key=moduleId会在编译失败后永远复用失败代码。必须保存生成代码拒绝检查点/诊断，按拒绝序号增加Code候选key，在同task/input/budget恢复时将仅生成实现的编译诊断与旧生成文件交Code修复。资源中断不能被判代码错误，仍复用旧代码；参考源码、隐藏测试绝不能给Code。处理现有Attempt4的旧progress诊断迁移/可恢复读取，不能靠重置任务预算或手改CAS生成代码来通过。补真实编译失败→恢复新Code→成功测试，同时保留现有资源中断→复用测试。接口不兼容目前阶段可SUCCEEDED且compatible=false，也需要后续明确修订/门禁规则。

验证：typecheck、Spec通过，领域48/48、architecture8/8、完整integration193/193、Console30/30（显式--config Playwright.config.ts，基线未改）。关联定向浏览器桌面/窄屏通过并人工查看，截图/Domain.log/Integration.log在releases/.../associations。曾误用npx playwright test未指定配置加载额外node测试，已明确SIGINT终止exit130后按正确配置完整重跑成功；另一次与浏览器并发的原生回归资源预检失败，浏览器结束后串行回归成功。不要把这些终止/资源暂停算质量拒绝。

完整目标仍缺：规范化与结构代码差异、可解释知识修订/迭代总预算、Code失败修复、指定外部材料、持久化一键串联、固定测试/可信行为与质量发布门禁、TypeScript新边界和构建配置实际应用、统一批次/工作流/评测导航、双目标当前工具链真实完整验收及部署网站。当前关系只库内可运行。无需重新审批，不创建固定三轮总上限，不主动搜索，不删除可信期望。
