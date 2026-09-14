# 五阶段工作台验收记录

截至2026-09-14，完整验收尚未完成。当前代码基线为 `e66ec50`；下列结果只证明各自明确列出的版本、任务和范围，不代表全部知识已验证发布。

## 固定目标与当前真实结果

| 目标 | 固定提交 | 当前卡片数 | 可信用例 | 固定用例 | 来源及发布 |
| --- | --- | --- | --- | --- | --- |
| jsmn（C） | `25647e692c7906b96ffd2b05ca54c097948e879c` | 7 | 当前重建31/31，复用31、新增0 | 同一重建11/11，参考实现也通过 | 来源复核结束，5个差异与5个未解决段落；未发布 |
| TinyXML2 XMLUtil 类型转换（C++） | `8224e427b655b83dae5e2298f1e6919523a78737` | 9 | 修订前重建37/37，复用37、新增0 | 修订前同一重建40/40，参考也通过 | 来源复核结束，8个差异与5个未解决段落；未发布 |

TinyXML2不以整个XML库重建为验收范围。两份C++生成工件经CAS读取比较不相同，不能将较新重建的可信报告与旧重建的固定报告组合为一轮通过。所有参考工件均保留原用例输入与预期，不改写已发布v0.2.0。

### jsmn 任务绑定

- 来源修订：`stage-21cf1a45462b40c13dafa4f46d678a57c60a3ef05392e86bf8cf101fc20bd885`。两卡各修改一个获准H2，标题结构不变，索引刷新；整体仍为UNRESOLVED。
- 当前重建：`stage-d86fa85941ce094a10818b2de79f1899d64e6c007be31d14d21bf315e5a1820e`。
- 可信评测：`stage-685ee22fb6d82b6f2d61fac01d303a39f76becbb8fb46d95dac59812a9e6bb1b`。31/31，公开接口兼容；CAS审计确认31个完整输入和预期与前一轮一致。
- 固定评测：`stage-4112f9724cd4943be7e7d4897f17fca02a7ec2d7449f3eb69689ed2cfb23f501`。11/11，绑定上述重建。
- 当前来源复核：`stage-54a2931f73371a18fc102c4cc723adbe65c75a66f4842f80351af3bc46061de5`，SUCCEEDED/UNRESOLVED；53段中43匹配、5差异、5未解决，172份引用工件CAS校验通过。不能据此发布。

旧补证任务 `stage-f1c54a34c6606ae85d8bae92409c563fd8457887229125c4fab321c839608281` 的29个候选有2个参考失败，且未命中指定的6个段落，整批未晋升。后续代码已增加目标检查、恢复反馈和实际构建范围证据，但这些新能力不能反向改变旧任务的冻结策略或消耗记录。

### TinyXML2 任务绑定

- 当前配置重建：`stage-17d6c7f60c1267ae1605903c7fcf430dbc66149387e9038dd20986cedf541e8c`，SUCCEEDED，同9卡，接口兼容，1调用42951 tokens。
- 当前可信评测：`stage-9ea26f4d44ef2010c9853cd148e48e8f1fedc26c45bdee13d9588a321fb895a3`，SUCCEEDED，37/37，复用37、新增0、重新验证。CAS审计整套用例与旧537782完全一致。

- 较新重建：`stage-6c90426ab4e9411531f90f05cf0e2b7f96426de30af1c4e03a212b73b1f82687`，源码比较契约为 `native-source-comparison-v1`。
- 对应可信评测：`stage-5377823175a28a2f7caa81d377387cb4eab75569b734f32c2f26d6e43d38019f`，37/37。
- 当前固定评测：`stage-4db04d343b050a929aaf224665e30280d5e3e1f40014fd45da3632aca4a2002e`，40/40、参考通过，绑定当前17d6重建。
- 当前来源复核：`stage-5089612faaa3ef67a2d36d24f4cc188e9f7408133e825775be1f872840d1fee6`，SUCCEEDED/UNRESOLVED；63段中50匹配、8差异、5未解决，335份引用工件CAS校验通过。冻结g++/c++17/x64单构建及可信集，不代表其他平台和宏配置已验证。
- 旧固定评测：`stage-0c88144a957f43afb72226de55d7bd034a40f2e0183023ca214e374e4f1f752f`，40/40，但绑定 `stage-fb5de0539cd320c6c3547e69e4af4b1137b7e99027e69141abb6b020af5a3c72`。

另已校验C++与当前C任务冻结配置：角色执行版本、契约和基础提示词一致，但供应商parametersSha256不同，不能直接跨配置继续来源复核。当前已用新配置重建同一组9张卡片，已通过原37个可信用例，已通过原40个固定用例，来源复核已结束，已通过来源修订任务 `stage-83b367fb2ab4c6a9d6c4d24b439ef61a0f922ae807b27ec7a3ac5101227ed918` 处理四张卡片各一个明确差异，SUCCEEDED/UNRESOLVED，索引已刷新；累计10调用1454683tokens。CAS前后正文审计确认仅获准H2改变，前三张在恢复中复用。修订后重建任务 `stage-6281e9051e3291bf624e9cb84a7a5d4e1dc26a14b9097472d56594ff423b0590` 首次因生成头文件缺失 INT_MAX/isspace 声明而编译失败，诊断确认非超时/资源失败；现同任务恢复 Code 修复，保留首轮40245tokens。修订前37+40的报告不能证明这些新版本。首次执行在保存三张候选版本后因 `DOC_GEN_SECTION_HEADING_INVALID` 停止；实证为来源尾注前空行隔开的 `---` 被误判为 Setext 标题。校验器现区分该分隔线，18项相关测试及类型/Spec检查通过，原始失败输出保留。随后仍须完成新版本的重建评测、必要补证、关联和发布。排队或脚本已准备不算执行通过。

## 回归证据及限制

| 检查 | 已取得的证据 | 尚不能据此证明 |
| --- | --- | --- |
| 完整Node回归 | `3b83ac6`基线494/494，`/tmp/WorkbenchV17FullRegression.log` | 此后新增补证目标、构建范围及下载检查点的完整回归 |
| 构建范围交接与发布 | 26项领域、准备、发布、架构检查通过，`/tmp/SourceScopeContractTests.log` | 完整当前Node/Console回归 |
| 来源历史与原生应用 | 原队列1/3暴露scope任务提前复用缺陷；0ae56fe修复后6/6，`/tmp/SourceScopeHistoryFixTests.log` | 全套当前回归 |
| 运行中下载与页面 | 5项HTTP/页面检查通过，`/tmp/SourceScopeDownloadTests.log` | 最新完整浏览器及窄屏验收 |
| 浏览器补证流程 | 早期独立重跑1/1通过，`/tmp/WorkbenchTargetBrowserSerial.log` | 后续构建范围展示和下载修改已在真实浏览器检查 |
| TypeScript markdownLite | 属于必须保留的回归范围 | 当前代码全套回归尚待完成，不用旧基线代替 |

早期原生应用测试出现过暂停/缺少结果，后续重跑通过；早期浏览器出现过30秒总时限超时，串行重跑通过。失败日志保留，不将重跑通过描述成已查明并修复所有偶发原因。

## 最终交付仍需补齐

两个目标都须在明确绑定的当前版本上完成多卡片、增量索引、重建与必要修订、固定及可信评测、来源复核、关联查看与发布，并给出一键和分步的真实证据。当前报告未证明这一完整链路。

还需完成当前代码的全套Node、Console、markdownLite及浏览器检查，补齐取消、重启、恢复、质量拒绝、额度与材料不可用等验收证据的清单，并在通过后更新网站。网站已于2026-09-14部署`ec72c43`，首页/health/关键API和变化JS真实HTTP验证通过，保留原数据与备份；0ae56fe历史修复尚未部署，最新浏览器检查待补。

## 原始证据位置

服务器证据目录：`/root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/real-knowledge-revision/`。

- `source-correction-after-target-policy/RevisionAudit.json`：两张卡片的CAS正文差异审计。
- `evaluation-after-target-policy/ImmutableGateAudit.json`：31个可信输入与预期未变。
- `fixed-after-target-policy/Fixed.json`：当前C固定评测。
- `source-after-target-policy/Source.json`：已结束来源任务及检查点；`FinalCheckpointAudit.json`保存53段及172份工件审计。
- `cpp-source-current-provider/FinalCheckpointAudit.json`：与SQLite终态一致，63段结果及335份工件摘要/长度核验。
- `cpp-current-binding-audit/BindingAudit.json`：C++新旧重建及报告绑定审计，CAS读取校验通过。
- `supplement-after-selection-v1/CandidateRejectionAudit.json`：旧补证候选拒绝及未命中审计。

具体页面操作见[操作说明](../Operations.md)。
