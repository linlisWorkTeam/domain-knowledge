<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：旧 OKF 候选迁移设计。
-->
# 旧 OKF 候选迁移设计

代码位置：[src/domain/services/migration/LegacyOkf.ts](../../../../../src/domain/services/migration/LegacyOkf.ts)、[fw.mjs](../../../../../fw.mjs)。


migrateLegacyOkf 读取旧知识根的 concepts、drafts 两个目录，按文件名顺序处理 Markdown，解析 YAML 元数据和正文，规范化来源、标题、说明、分类和标签。没有来源时补入原卡片路径，标明未固定来源。

迁移仅调用 LegacyMigrationTarget.ingestCandidate。legacyStatus、legacyVerified、legacyVersion、migratedFrom 和 requiresBehavioralVerification 作为历史元数据保留；旧 verified 不转换为新发布权威。每张卡单独收集异常，结果区分 imported、replayed、rejected 和 errors。

兼容 fw.mjs 将保留的旧命令映射到新 CLI，不维护第二套状态或评分；退休命令明确失败。迁移不搬 checkpoint、不复制秘密，也不自动发布知识。操作方法合入 Operations，历史仓库拆分经过见 historyEpitaph。


文档关系：[设计目录](../../../README.md)负责代码与设计定位；[开发指南](../../../../Development.md)说明修改和交付步骤。
