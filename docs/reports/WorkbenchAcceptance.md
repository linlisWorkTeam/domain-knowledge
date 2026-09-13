# 五阶段工作台验收记录

截至2026-09-14，完整验收尚未完成。当前代码基线为 `b5d05aa5e77073b9b1f8f1869c03a5c8b0bf4aee`；下列结果只证明各自明确列出的版本、任务和范围，不代表全部知识已验证发布。

## 固定目标与当前真实结果

| 目标 | 固定提交 | 当前卡片数 | 可信用例 | 固定用例 | 来源及发布 |
| --- | --- | --- | --- | --- | --- |
| jsmn（C） | `25647e692c7906b96ffd2b05ca54c097948e879c` | 7 | 当前重建31/31，复用31、新增0 | 同一重建11/11，参考实现也通过 | 当前来源复核运行中；未发布 |
| TinyXML2 XMLUtil 类型转换（C++） | `8224e427b655b83dae5e2298f1e6919523a78737` | 9 | 较新重建37/37 | 旧重建40/40；较新重建尚需固定评测 | 当前运行库无来源复核任务；未发布 |

TinyXML2不以整个XML库重建为验收范围。两份C++生成工件经CAS读取比较不相同，不能将较新重建的可信报告与旧重建的固定报告组合为一轮通过。所有参考工件均保留原用例输入与预期，不改写已发布v0.2.0。

### jsmn 任务绑定

- 来源修订：`stage-21cf1a45462b40c13dafa4f46d678a57c60a3ef05392e86bf8cf101fc20bd885`。两卡各修改一个获准H2，标题结构不变，索引刷新；整体仍为UNRESOLVED。
- 当前重建：`stage-d86fa85941ce094a10818b2de79f1899d64e6c007be31d14d21bf315e5a1820e`。
- 可信评测：`stage-685ee22fb6d82b6f2d61fac01d303a39f76becbb8fb46d95dac59812a9e6bb1b`。31/31，公开接口兼容；CAS审计确认31个完整输入和预期与前一轮一致。
- 固定评测：`stage-4112f9724cd4943be7e7d4897f17fca02a7ec2d7449f3eb69689ed2cfb23f501`。11/11，绑定上述重建。
- 当前来源复核：`stage-54a2931f73371a18fc102c4cc723adbe65c75a66f4842f80351af3bc46061de5`，尚未结束；运行中的部分章节结论不能证明整卡通过。

旧补证任务 `stage-f1c54a34c6606ae85d8bae92409c563fd8457887229125c4fab321c839608281` 的29个候选有2个参考失败，且未命中指定的6个段落，整批未晋升。后续代码已增加目标检查、恢复反馈和实际构建范围证据，但这些新能力不能反向改变旧任务的冻结策略或消耗记录。

### TinyXML2 任务绑定

- 较新重建：`stage-6c90426ab4e9411531f90f05cf0e2b7f96426de30af1c4e03a212b73b1f82687`，源码比较契约为 `native-source-comparison-v1`。
- 对应可信评测：`stage-5377823175a28a2f7caa81d377387cb4eab75569b734f32c2f26d6e43d38019f`，37/37。
- 旧固定评测：`stage-0c88144a957f43afb72226de55d7bd034a40f2e0183023ca214e374e4f1f752f`，40/40，但绑定 `stage-fb5de0539cd320c6c3547e69e4af4b1137b7e99027e69141abb6b020af5a3c72`。

另已校验C++与当前C任务冻结配置：角色执行版本、契约和基础提示词一致，但供应商parametersSha256不同，不能直接跨配置继续来源复核。下一步用当前配置重建同一组9张卡片，再复用原可信与固定用例评测，随后完成整卡来源、必要修订/补证、关联和发布。排队或脚本已准备不算执行通过。

## 回归证据及限制

| 检查 | 已取得的证据 | 尚不能据此证明 |
| --- | --- | --- |
| 完整Node回归 | `3b83ac6`基线494/494，`/tmp/WorkbenchV17FullRegression.log` | 此后新增补证目标、构建范围及下载检查点的完整回归 |
| 构建范围交接与发布 | 26项领域、准备、发布、架构检查通过，`/tmp/SourceScopeContractTests.log` | 当前完整原生应用链路已回归；该项正在排队 |
| 运行中下载与页面 | 5项HTTP/页面检查通过，`/tmp/SourceScopeDownloadTests.log` | 最新完整浏览器及窄屏验收 |
| 浏览器补证流程 | 早期独立重跑1/1通过，`/tmp/WorkbenchTargetBrowserSerial.log` | 后续构建范围展示和下载修改已在真实浏览器检查 |
| TypeScript markdownLite | 属于必须保留的回归范围 | 当前代码全套回归尚待完成，不用旧基线代替 |

早期原生应用测试出现过暂停/缺少结果，后续重跑通过；早期浏览器出现过30秒总时限超时，串行重跑通过。失败日志保留，不将重跑通过描述成已查明并修复所有偶发原因。

## 最终交付仍需补齐

两个目标都须在明确绑定的当前版本上完成多卡片、增量索引、重建与必要修订、固定及可信评测、来源复核、关联查看与发布，并给出一键和分步的真实证据。当前报告未证明这一完整链路。

还需完成当前代码的全套Node、Console、markdownLite及浏览器检查，补齐取消、重启、恢复、质量拒绝、额度与材料不可用等验收证据的清单，并在通过后更新网站。网站已于2026-09-11部署`dc3dbf8`，后续改动尚未部署；不以旧网站检查代替当前版本验收。

## 原始证据位置

服务器证据目录：`/root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/real-knowledge-revision/`。

- `source-correction-after-target-policy/RevisionAudit.json`：两张卡片的CAS正文差异审计。
- `evaluation-after-target-policy/ImmutableGateAudit.json`：31个可信输入与预期未变。
- `fixed-after-target-policy/Fixed.json`：当前C固定评测。
- `source-after-target-policy/Source.json`：当前来源任务及检查点，运行中持续更新。
- `cpp-current-binding-audit/BindingAudit.json`：C++新旧重建及报告绑定审计，CAS读取校验通过。
- `supplement-after-selection-v1/CandidateRejectionAudit.json`：旧补证候选拒绝及未命中审计。

具体页面操作见[操作说明](../Operations.md)。
