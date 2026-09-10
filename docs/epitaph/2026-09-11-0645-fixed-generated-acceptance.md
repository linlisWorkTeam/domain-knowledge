<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接固定生成代码验收通过和来源复核恢复。
-->
# 固定生成代码验收

/tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线39f766e9295986913df43d1b72fe0ae955c6a03a。完整目标active，原wxc和taste4310/v0.2.0保留。Node24/384MiB，重任务串行，未删知识。

RunNativeFixedCases.ts新增成对--runtime/--reconstruction-task，先校验成功FLYWHEEL任务的inputDigest、项目提交/源码/CAS/默认构建、模块/卡片版本/正文及Code工件，再执行原固定参考分支；参考全通过后仅用生成文件在独立目录验证公开接口和同一固定测试。复用Domain compareNativeInterfaces，允许不影响接口的参数名差异；不以原始AST对象完全相等增加门禁。native-fixed-generated-v1报告记录任务/inputDigest/源码/卡片正文/Code摘要、接口比较与逐案真实观察。失败不改预期/代码/知识，无模型调用。FIXED_GENERATED_VALIDATED仍非知识验证或发布；最终工作台发布事务尚未消费这些外部验收报告。

真实验收完成：jsmn重建stage-15a33088c2339301ec85ca87fafe074a878ebccd1e9973d4a8d27ad5f1a573d5，固定参考11/11、生成11/11。TinyXML2重建stage-fb5de0539cd320c6c3547e69e4af4b1137b7e99027e69141abb6b020af5a3c72，固定参考40/40、生成40/40。均读取operational clone /tmp/workbench-revision-acceptance-20260911的原真实模型输出。证据fixed-native-generated/{jsmn,tinyxml2}.json/log。错把TinyXML2任务交给jsmn入口时，WrongBinding.json为FIXED_RECONSTRUCTION_INPUT_MISMATCH、0观察，构建前拒绝；退出1为预期。类型/Spec通过。没有改动生产执行器或UI，不重复无关全部回归；此前39f766e的17集成/3单元/8架构通过。

source-v2第二次已终止1：stage-64103783a686e63184d2188e8101a3f0e078053fad82d622489381bb452ee086，原PID2330896/session97531。AGENT_STAGE_TIMEOUT，18calls/443363reported tokens/reserved1994834/956248ms。完成16章节（不是17）：11MATCHED、5MISMATCH，完整卡片只完成首卡，后续未完。超时发生于第二卡kv_49fb44b0a7ea00128a597c64的key 517af64ea637cbd52cf92310；每次中断请求的未报告用量为未知，不算0。whole-source-v2/WholeSource-attempt-2-timeout.json和Run-attempt-2-timeout.log保存。未执行真实来源修订，已知bad parser卡仍待修正。

固定生成验收队列/tmp/RunFixedGeneratedAfterSource.py PID2334869/session45169终止0；两目标分别退出0。错绑定检查进程也已终止。交接时没有模型/构建任务运行；提交后计划再次显式恢复同source-v2任务，先查新ResumeLaunch/进程，避免重复启动。恢复保留16章节及18calls累计预算，不跨契约。

剩余：完成全部来源复核→明确来源修订→新版本重建/可信及固定评测/再复核；新v10自动流程最终真实运行；固定/可信/来源联合发布门禁与独立工作台事务（不能伪造旧Run）；完整语言分析/公开接口边界、构建配置解析/模块参数、多项目旧快照；TinyXML2来源/修订最终链路，最终浏览器和网站部署。真实固定生成通过不能替代错误正文来源拒绝，完整目标未完成。
