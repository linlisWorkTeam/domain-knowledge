# 五阶段工作台验收记录

截至2026-09-14，完整验收尚未完成。真实目标证据的历史代码基线为 `e66ec50`；下列结果只证明各自明确列出的版本、任务和范围，不代表全部知识已验证发布。

## main集成后的回归（2026-09-14）

集成基线 `84c98b3` 完整非浏览器回归共 600 项，577 通过、23 失败，未跳过；该结果不是全绿。原生内存预检、旧样例未选择工作台契约、修订校验函数改名，以及重建修复诊断格式不匹配均保留失败证据。

后续修复将发布/阶段恢复样例绑定显式工作台协议，探针区分 opencode.ai 与其他主机。Code 修复仅接收自身生成代码及精简编译诊断，不补造时长或输出、不传测试答案。契约/发布复验 48/49 后修正最后一项首次生成轮次；阶段恢复、Code输入及真实编译修复组合 13/13 通过。完整类型检查通过。

原生定向组 13 项中 8 通过、5 项仍因 WORKBENCH_RESOURCE_INSUFFICIENT 失败，包括持久化可信缓存、三个知识评测场景及一项固定门禁场景。192 MiB 测试堆和随后 96 MiB 缓存单测均未解除预检；编译内存和隔离要求未降低。600项基线日志 `/tmp/WorkbenchMergedFullRegression.log`，manifest `/tmp/WorkbenchMergedRegressionManifest.json`；复验日志 `/tmp/WorkbenchMergedContractRetest.log`、`/tmp/WorkbenchMergedRepairRetest.log`、`/tmp/WorkbenchMergedNativeResourceRetest.log`。这些日志属于当前服务器验证记录，不作为真实模型质量证据。

浏览器、真实C/C++新契约链路、来源质量、关联/联合发布及新版部署仍待完成。PR #50 保持草稿，未处理 PR #38 的关闭或合入。

## 当前前台复验（2026-09-14，fd811d9 后样式修复）

免登录入口的一键执行按钮修复了浅色主题优先级：无项目输入时保持禁用外观。人工对照新旧操作中心截图后更新原截图基线，原布局、交互断言和1%像素阈值未变。

先前直接调用 `playwright test` 漏传仓库的 `Playwright.config.ts`，导致基线路径和初始主题不符；该轮21/23不作为正式配置结果。正式命令为 `npm run test:ui -- tests/e2e/Console.spec.ts tests/e2e/WorkbenchEntry.spec.ts tests/e2e/WorkbenchPublication.spec.ts --workers=1`，测试进程堆192MiB，产品限制不变。

正式组合25项中23通过、2失败，日志 `/tmp/WorkbenchConfiguredBrowser.log`：移动导航、主题持久化、200%缩放、七页、来源、索引、关联、入口和受控免登录发布/下载通过。失败为旧入口截图基线及长流程30秒超时。更新已人工检查的截图后，原截图断言独立复验通过（4.2秒）；长流程再度超时，在来源下载完成后切换窄屏处，未放宽时限或删减断言。日志 `/tmp/WorkbenchConfiguredBrowserRetest.log`，原组合截图和trace保存在 `/tmp/WorkbenchConfiguredBrowserEvidence/`。尚需拆分长流程，当前不能宣称Console全绿。浏览器结果仅证明受控数据的页面与接口操作，不证明真实模型、最终知识质量或部署。

长流程随后按原顺序拆为七个串行验收阶段，共享同一浏览器上下文、页面和冻结项目；任一失败停止依赖阶段。每阶段仍为30秒，保留原文件302处expect、3处轮询和20处截图调用。七阶段复验7/7通过（1.7分钟），日志 `/tmp/WorkbenchSplitSevenBrowser.log`，覆盖固定/可信失败证据、来源下载、一键拒绝及重载、知识与来源修订、绑定新版本重建和补充可信用例；随后完整Console+入口+发布组合30/31通过（3.6分钟）；七阶段、截图、免登录入口和发布均通过，原Sources场景触发30秒超时，trace保留。日志 `/tmp/WorkbenchFinalConfiguredBrowser.log`；类型检查通过。

C++ v11重建首次启动在冻结工具链时触发ENOENT：指纹引擎清单仍引用重构前的 `domain/services/evaluation` 和 `domain/services/knowledge`。现已改为当前领域文件路径，真实工具链摘要生成通过，新重建任务 `stage-e6d45b8c9d720b62500ca5841e9b22df594ad0a938afebea451afb35dee4f6db` 已生成代码后因WORKBENCH_RESOURCE_INSUFFICIENT暂停；恢复复用了Code检查点并发现缺失TINYXML2_LIB宏的真实编译错误；同任务生成修复后累计2调用82,552 tokens，再因内存不足暂停，原诊断和修复检查点保留，尚不记录为成功。首次失败发生于建任务/模型调用之前，日志 `/tmp/CppV11Reconstruction.log`；修正后 `/tmp/CppV11ReconstructionAfterPaths.log`，证据目录 `cpp-v11-reconstruction/`。旧来源、可信与固定报告保留，不跨执行契约恢复旧任务。

现有CI已手动触发于 `90b6872`：[运行34824671868](https://github.com/linlisWorkTeam/domain-knowledge/actions/runs/34824671868)，静态/Bubblewrap/类型检查通过，但完整回归601项580通过、21失败，原生用例缺少可写委派cgroup而触发PROJECT_RESOURCE_ISOLATION_UNAVAILABLE，浏览器和acceptance未运行。日志 `/tmp/WorkbenchCi34824671868Failed.log`。26b0019补齐临时runner的委派环境，不降低生产隔离要求；[复验34825340484](https://github.com/linlisWorkTeam/domain-knowledge/actions/runs/34825340484)已结束，完整代码回归601项600通过、1失败；21项原生隔离失败已消失。唯一失败是Server测试异步再生成尚未排空就删除目录造成ENOTEMPTY，浏览器及acceptance仍未运行。GitHub比较接口确认分支相对main领先、落后0，merge base为22fe34fd；PR仍报告CONFLICTING，未重复合并或强推。

## 固定目标与当前真实结果

| 目标 | 固定提交 | 当前卡片数 | 可信用例 | 固定用例 | 来源及发布 |
| --- | --- | --- | --- | --- | --- |
| jsmn（C） | `25647e692c7906b96ffd2b05ca54c097948e879c` | 7 | 当前重建31/31，复用31、新增0 | 同一重建11/11，参考实现也通过 | 来源复核结束，5个差异与5个未解决段落；未发布 |
| TinyXML2 XMLUtil 类型转换（C++） | `8224e427b655b83dae5e2298f1e6919523a78737` | 9 | 修订后重建37/37，复用37、新增0 | 修订后同一重建40/40，参考也通过 | 来源复核结束，8个差异与5个未解决段落；未发布 |

TinyXML2不以整个XML库重建为验收范围。两份C++生成工件经CAS读取比较不相同，不能将较新重建的可信报告与旧重建的固定报告组合为一轮通过。所有参考工件均保留原用例输入与预期，不改写已发布v0.2.0。

### jsmn 任务绑定

- 来源修订：`stage-21cf1a45462b40c13dafa4f46d678a57c60a3ef05392e86bf8cf101fc20bd885`。两卡各修改一个获准H2，标题结构不变，索引刷新；整体仍为UNRESOLVED。
- 当前重建：`stage-d86fa85941ce094a10818b2de79f1899d64e6c007be31d14d21bf315e5a1820e`。
- 可信评测：`stage-685ee22fb6d82b6f2d61fac01d303a39f76becbb8fb46d95dac59812a9e6bb1b`。31/31，公开接口兼容；CAS审计确认31个完整输入和预期与前一轮一致。
- 固定评测：`stage-4112f9724cd4943be7e7d4897f17fca02a7ec2d7449f3eb69689ed2cfb23f501`。11/11，绑定上述重建。
- 当前来源复核：`stage-54a2931f73371a18fc102c4cc723adbe65c75a66f4842f80351af3bc46061de5`，SUCCEEDED/UNRESOLVED；53段中43匹配、5差异、5未解决，172份引用工件CAS校验通过。不能据此发布。

旧补证任务 `stage-f1c54a34c6606ae85d8bae92409c563fd8457887229125c4fab321c839608281` 的29个候选有2个参考失败，且未命中指定的6个段落，整批未晋升。后续代码已增加目标检查、恢复反馈和实际构建范围证据，但这些新能力不能反向改变旧任务的冻结策略或消耗记录。

### TinyXML2 任务绑定

- 四卡修订后的重建：`stage-6281e9051e3291bf624e9cb84a7a5d4e1dc26a14b9097472d56594ff423b0590`，已从编译失败同任务修复，SUCCEEDED，接口兼容，累计2调用95807tokens；14份引用工件CAS校验通过。
- 修订后可信评测：`stage-bce1d95d011232c6af352e4e11a55053962ff4229e499e5a68cfe06c77f0db49`，37/37，复用37、新增0、重新验证；完整suite与前版一致，输入/预期未改。
- 修订后固定评测：`stage-5ad835cf13309b4a68f7072d4f035ea1e3e7fd4d7de8d53e989710ed1bd3e68a`，40/40、参考通过，绑定6281重建。

- 当前配置重建：`stage-17d6c7f60c1267ae1605903c7fcf430dbc66149387e9038dd20986cedf541e8c`，SUCCEEDED，同9卡，接口兼容，1调用42951 tokens。
- 当前可信评测：`stage-9ea26f4d44ef2010c9853cd148e48e8f1fedc26c45bdee13d9588a321fb895a3`，SUCCEEDED，37/37，复用37、新增0、重新验证。CAS审计整套用例与旧537782完全一致。

- 较新重建：`stage-6c90426ab4e9411531f90f05cf0e2b7f96426de30af1c4e03a212b73b1f82687`，源码比较契约为 `native-source-comparison-v1`。
- 对应可信评测：`stage-5377823175a28a2f7caa81d377387cb4eab75569b734f32c2f26d6e43d38019f`，37/37。
- 当前固定评测：`stage-4db04d343b050a929aaf224665e30280d5e3e1f40014fd45da3632aca4a2002e`，40/40、参考通过，绑定当前17d6重建。
- 当前来源复核：`stage-5089612faaa3ef67a2d36d24f4cc188e9f7408133e825775be1f872840d1fee6`，SUCCEEDED/UNRESOLVED；63段中50匹配、8差异、5未解决，335份引用工件CAS校验通过。冻结g++/c++17/x64单构建及可信集，不代表其他平台和宏配置已验证。
- 旧固定评测：`stage-0c88144a957f43afb72226de55d7bd034a40f2e0183023ca214e374e4f1f752f`，40/40，但绑定 `stage-fb5de0539cd320c6c3547e69e4af4b1137b7e99027e69141abb6b020af5a3c72`。

另已校验C++与当前C任务冻结配置：角色执行版本、契约和基础提示词一致，但供应商parametersSha256不同，不能直接跨配置继续来源复核。当前已用新配置重建同一组9张卡片，已通过原37个可信用例，已通过原40个固定用例，来源复核已结束，已通过来源修订任务 `stage-83b367fb2ab4c6a9d6c4d24b439ef61a0f922ae807b27ec7a3ac5101227ed918` 处理四张卡片各一个明确差异，SUCCEEDED/UNRESOLVED，索引已刷新；累计10调用1454683tokens。CAS前后正文审计确认仅获准H2改变，前三张在恢复中复用。修订后重建任务 `stage-6281e9051e3291bf624e9cb84a7a5d4e1dc26a14b9097472d56594ff423b0590` 首次因生成头文件缺失 INT_MAX/isspace 声明而编译失败，诊断确认非超时/资源失败；后续同任务 Code 修复已成功，累计95807tokens，失败记录与首轮用量保留。修订前37+40的报告不能证明这些新版本。首次执行在保存三张候选版本后因 `DOC_GEN_SECTION_HEADING_INVALID` 停止；实证为来源尾注前空行隔开的 `---` 被误判为 Setext 标题。校验器现区分该分隔线，18项相关测试及类型/Spec检查通过，原始失败输出保留。随后仍须完成新版本的重建评测、必要补证、关联和发布。排队或脚本已准备不算执行通过。

## 回归证据及限制

| 检查 | 已取得的证据 | 尚不能据此证明 |
| --- | --- | --- |
| 当前src/tests回归 | 125个测试文件501/501通过，无失败、取消或跳过，326473ms；`/tmp/WorkbenchCurrentFullRegression.log`及同名Manifest.json | 不覆盖Playwright浏览器、scripts目录测试和最新main集成 |
| 旧完整Node回归 | `3b83ac6`基线494/494，`/tmp/WorkbenchV17FullRegression.log` | 此后新增补证目标、构建范围及下载检查点的完整回归 |
| 构建范围交接与发布 | 26项领域、准备、发布、架构检查通过，`/tmp/SourceScopeContractTests.log` | 完整当前Node/Console回归 |
| 来源历史与原生应用 | 原队列1/3暴露scope任务提前复用缺陷；0ae56fe修复后6/6，`/tmp/SourceScopeHistoryFixTests.log` | 全套当前回归 |
| 运行中下载与页面 | 5项HTTP/页面检查通过，`/tmp/SourceScopeDownloadTests.log` | 最新完整浏览器及窄屏验收 |
| 浏览器补证流程 | 早期独立重跑1/1通过，`/tmp/WorkbenchTargetBrowserSerial.log` | 后续构建范围展示和下载修改已在真实浏览器检查 |
| TypeScript markdownLite | 属于必须保留的回归范围 | 当前代码全套回归尚待完成，不用旧基线代替 |

早期原生应用测试出现过暂停/缺少结果，后续重跑通过；早期浏览器出现过30秒总时限超时，串行重跑通过。失败日志保留，不将重跑通过描述成已查明并修复所有偶发原因。

## 最终交付仍需补齐

用户再次明确要求前台改造：须结合真实页面审查操作中心五阶段入口、输入/产物、错误及下一步、卡片/评测/关联详情和窄屏布局，不能仅以后台或受控测试代替前台交付。

两个目标都须在明确绑定的当前版本上完成多卡片、增量索引、重建与必要修订、固定及可信评测、来源复核、关联查看与发布，并给出一键和分步的真实证据。当前报告未证明这一完整链路。

src/tests当前501项已通过；仍需补齐scripts目录、Console及浏览器检查和明确的markdownLite验收证据，补齐取消、重启、恢复、质量拒绝、额度与材料不可用等验收证据的清单，并在通过后更新网站。网站已于2026-09-14部署`ec72c43`，首页/health/关键API和变化JS真实HTTP验证通过，保留原数据与备份；0ae56fe历史修复尚未部署，最新浏览器检查待补。

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

本次尝试在原长浏览器场景追加构建范围和三类下载断言：新增断言执行后，在后续source-revision截图处超过30秒总时限。未记录通过，未放宽时限；未提交的新增断言已撤回并保存至 `/tmp/WorkbenchSourceScopeBrowserPending.patch`，后续拆分为独立场景。失败日志 `/tmp/WorkbenchSourceScopeBrowser.log` 保留。

## 前台入口改造（2026-09-14）

操作中心现在先展示五阶段顺序及产物，再填写仓库目录和源码版本；已保存输入位于表单之后。无项目输入时，一键执行禁用并说明前置操作；历史运行和健康信息使用独立的次要区域。沿用现有Console与阶段接口，没有新增前端框架。

入口浏览器场景第一次3.5秒通过；最终禁用样式修改后独立重跑28.5秒通过（总35.2秒），`/tmp/WorkbenchEntryBrowserFinal.log`。桌面和390px窄屏均检查五阶段说明、前置状态、输入焦点、操作可见性及无横向溢出。3项关联页面/版本计数测试、typecheck、Spec检查通过。组合重跑的原长流程在初次治理入口点击超时，入口场景随后在导航超时；同期可用内存约217MiB，尚未证实唯一根因，失败日志`/tmp/WorkbenchEntryFlowBrowser.log`保留，不能称原长流程已回归通过。

截图仅对照布局：之前来自旧部署的已有数据，之后来自当前代码的空库受控浏览器场景，不能用来比较运行数量或证明真实模型验收。后续仍需深入阶段操作、卡片/评测/关联详情及部署检查。

| 视图 | 改造前 | 当前入口 |
| --- | --- | --- |
| 桌面 | [截图](workbenchScreenshots/BeforeDesktop.png) | [截图](workbenchScreenshots/AfterDesktop.png) |
| 窄屏 | [截图](workbenchScreenshots/BeforeNarrow.png) | [截图](workbenchScreenshots/AfterNarrow.png) |

最终PR处理遵循用户最新条件：全部实现、真实验收与部署完成后，审查#50与#38是否为完整包含关系；若包含，关闭#38并合入#50；若不包含，解决冲突并保留双方改动、合入两个PR。目前未执行关闭或合入。

## 初始化开销和HTTP测试清理（2026-09-14）

Composition将同一schema根下的同步无业务状态契约校验器共享给阶段、工作流和评测装配，避免重复编译。相同192MiB堆条件下测量，初始化RSS从247,283,712降至218,546,176字节；这只是一次对照，不证明所有资源不足已解决。日志 `/tmp/WorkbenchMemoryProfile.log` 与 `/tmp/WorkbenchSharedContractsMemory.log`。契约与阶段/修复组合13/14通过，剩余legacy修复场景因本机WORKBENCH_RESOURCE_INSUFFICIENT暂停；未放宽门槛。类型检查通过。

Server集成测试清理现在先await composition.shutdown，再关闭HTTP并删除目录，与服务端信号停机路径一致；复验7/7通过，`/tmp/WorkbenchServerCleanupRetest.log`。没有加入删除重试来掩盖未完成的后台任务。
