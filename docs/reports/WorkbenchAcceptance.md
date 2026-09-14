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

## CI回归与错误投影（2026-09-14）

[CI 34825909370](https://github.com/linlisWorkTeam/domain-knowledge/actions/runs/34825909370)通过完整代码检查，Console 38/39通过；唯一失败是批次工作流状态直接显示私有上游错误。现状态API复用安全原因码投影，前台使用run.executionFailure.code；原始持久化错误不改写。HTTP补充验证状态响应不含私有文本且原记录保留，2/2通过；原浏览器恢复/失败/预算两项2/2通过；类型与Spec检查通过。日志 `/tmp/WorkbenchWorkflowPrivacyHttp.log`、`/tmp/WorkbenchWorkflowPrivacyBrowser.log`。

C++ v11重建e6d45已成功：接口兼容，生成代码3558ef78ac2159520edb30dbcf257d801d0e30030ff1d38ff2b8ed17ae4913a8，累计2调用82,552tokens，9份检查点工件摘要/大小已审计（cpp-v11-reconstruction/ArtifactAudit.json）。新可信评测03dc1c087c74a95bd631009a12b2e6ce16d842d24aab141f93df95959bc807a5已通过参考基础构建并保存部分用例检查点，仍因内存不足暂停；不能记录37/37。指纹复用缓冲区试改内存收益不足，已撤回，无任务指纹变更。临时驱动对年轻代8MiB的测量有改善，但仍不足以证明全部资源暂停已解决；编译内存门槛不变。

## 当前v11行为评测及CI验收（2026-09-14）

[CI 34827215087](https://github.com/linlisWorkTeam/domain-knowledge/actions/runs/34827215087)的verify已通过，包括Console；acceptance为24/25。唯一失败AgentRevisionFlow仍用旧READY探针模拟返回，无法通过现有GENERATION_READY及modelList/generation双检查。已同步受控探针并增加启用状态断言，不改生产验证要求或原流程断言；本地该完整SDK修订流程1/1通过（`/tmp/WorkbenchAgentRevisionProbeRetest.log`）。这是受控模型验收，不能代表真实供应商质量。

C++当前v11可信评测`stage-03dc1c087c74a95bd631009a12b2e6ce16d842d24aab141f93df95959bc807a5`已成功，37/37、复用37、新增0，报告BEHAVIOR_PASSED，publicationVerified仍为false。81份引用工件摘要和大小逐一通过检查，证据`cpp-v11-evaluation/ArtifactAudit.json`。固定评测`stage-79e38c35042c352024afa7b29593269a728deede2ab676b7e384380c3a37d1b5`绑定同一重建和原固定测试集，首次保存14条参考用例检查点后因资源不足暂停，现从原检查点串行继续。来源复核、关联、发布及新网站仍未完成。

## 网站更新（2026-09-14 17:30）

网站已切换到提交`f543c59f922a522a8998506553788619778da1c1`，目录`/root/projects/domain-knowledge-releases/2026-09-14-workbench-f543c59/app`。保留原tunnel；本机及公网`/health`均200。通过进程cwd确认新代码，原8条Run、1张卡片保留，stage-tasks仍为0。完整数据和启动脚本备份在同发行目录的`pre-deploy-backup`，备份保留符号链接，未改v0.2.0或覆盖旧发行。备份初次误跟随运行目录中的依赖链接，已停止该备份进程并删除本次未完成副本，改为保留链接后完成；原始数据未删除。

本次是部署和HTTP健康确认，尚未执行部署后的真实页面浏览器检查。真实C/C++任务仍在独立运行库，尚未导入网站，不宣称网站已有完整真实链路。固定79e38保留14条参考用例后，两次无进展恢复已停止；来源86fde3已开始，日志`/tmp/CppV11Source.log`。最新CI34828092897仍运行，不能称全绿。

## 已部署页面复查（2026-09-14）

f543c59实际部署的只读浏览器检查通过，覆盖1363×936桌面和390×844窄屏：五阶段入口、前置操作禁用、主要操作可见、无横向溢出、窄屏导航及原知识正文可读，无页面脚本错误。首次脚本未打开窄屏导航即点击知识，修正为正常导航操作后通过；没有force点击或修改页面来绕过。日志`/tmp/WorkbenchDeployedBrowserRetest.log`，原始报告发行目录`browser/Result.json`。人工查看桌面与窄屏截图确认主要表单未被遮挡。截图为真实线上旧数据，不是C/C++新任务成果。

[已部署桌面](workbenchScreenshots/DeployedDesktop.png) · [已部署窄屏](workbenchScreenshots/DeployedNarrow.png) · [已部署知识详情](workbenchScreenshots/DeployedKnowledge.png)

C++可信测试集与历史不可变套件逐字节摘要一致，仍为161328520660adbfd51e3021a847c841bb806086d7bf55f501ef97687cbcf5f7，审计`cpp-v11-evaluation/ImmutableSuiteAudit.json`。为串行运行浏览器，来源86fde3协作取消后同任务恢复，累计7calls469229tokens保留，日志`/tmp/CppV11SourceAfterBrowser.log`；没有重建新任务或重置用量。

[CI 34828092897](https://github.com/linlisWorkTeam/domain-knowledge/actions/runs/34828092897)已完成并全部通过，测试提交f543c59：代码601/601、Console39/39、acceptance25/25。完整日志`/tmp/WorkbenchCi34828092897Passed.log`。此结果解决本轮回归失败，不替代TinyXML2/jsmn真实模型来源复核、固定门禁和完整发布验收。

## 完成固定测试与补证容量恢复修复（2026-09-14 18:01）

经用户授权确认空闲后删除tmux的wxc、wxz，会话和其空闲Codex进程均退出；保留work、ljy及仍运行Console/tunnel的会话。可用内存测量由585增至682MiB，后续约720MiB。原知识、工作树、配置和证据未删除。

C++固定任务79e38从14条参考检查点恢复后一次完成80条参考/生成检查点，FIXED_PASSED，40/40、接口兼容、参考通过；累计135722ms、0模型调用。报告24a51dd8afc13f36b3b90d1f68f5ea95a4628570f838acc28a565acf27082fa0，日志`/tmp/CppV11FixedAfterTmuxContinuation.log`。来源86fde3完成9卡63节：24 SOURCE_MATCHED、39 UNRESOLVED，65calls4296142tokens；377工件摘要/大小通过审计，cpp-v11-source/ArtifactAudit.json。途中REVIEW_CORRECTION_RANGE_INVALID保留失败输出，同任务后续有效尝试通过，未放宽范围校验。关联5339101251b19897c3164088d0278a30f4e21fcc9c646348425cb5aac5297465成功执行但0条关系、无外部材料，真实结果保留。不能把这些结果称作最终发布。

补证e6ec12264144435c594030acee7f24767f4071d7e4c7f3ff6ebf006482800200提出40例，与37例可信用例合并需要77例，因64例上限暂停；1call67340tokens。发现容量错误没有走候选拒绝反馈，恢复会复用同一超限候选。现在保留原64上限及历史期望，将新候选造成的超限保存为REJECTED、空参考观察、容量报告，恢复通过递增候选键反馈TestGen重新提案；历史集合自身超限及期望冲突仍按原规则停止。前台展示容量及未执行事实。

底层门禁/补证5/5通过，原完整阶段3个变体通过，新增容量变体修正测试caseId后1/1通过，覆盖服务重启后容量反馈、较小候选晋升及连续用量；页面2/2、typecheck通过。日志`/tmp/WorkbenchCapacityRejectionRetest.log`、`/tmp/WorkbenchCapacityRecoveryIntegration.log`（前三通过、第四测试数据格式失败）、`/tmp/WorkbenchCapacityRecoveryRetest.log`（第四通过）、`/tmp/WorkbenchCapacityTypes.log`。执行器变化改变原生指纹，因此上述真实通过仅证明修复前冻结版本；旧补证不得直接跨指纹恢复，新引擎真实验收仍待完成，网站仍f543c59。

## 模块批次前台与 C++ 关联（2026-09-14）

14a3c8d 将工作流图并入飞轮批次：左上角固定项目，目录模块、可读批次编号、手动/定时批次、按模块租约调度、轮次切换、实时节点状态、开始结束时间及展开日志。Agent 设置折叠、知识发布设置、评测最新记录/历史折叠与键值规则已接入。操作中心保留历史健康和最新飞轮状态。项目目前仍要求 Git 仓库及可识别源码，自定义目录模块首批支持 C/C++；任意非 Git 目录、全部文件作为项目、新批次固定测试/外部材料选项及完整真实发布仍待完成。

本地使用仓库 `Playwright.config.ts`：全量 41 项首轮 38 通过，剩余操作中心截图及两处旧入口测试更新后 3/3 复验通过。截图已人工查看，未改变容差或路径安全断言。先前漏传配置导致的临时截图目录已清理，未作为基线。日志 `/tmp/WorkbenchMergedConfiguredBrowser.log`、`/tmp/WorkbenchMergedFinalRetest.log`。类型和 Spec 通过；批次身份、租约、调度、恢复、流程和关联 15/15 通过，日志 `/tmp/WorkbenchMergedBackend.log`。这是受控浏览器/集成结果，不代表真实模型验收。

5c72fa5 引入关联 v3：完整父作用域相同时解析 C++ `Owner::member` 引用，仍拒绝裸成员名、跨命名空间及前后缀假命中。v1/v2 只读，新任务不跨契约恢复。真实 TinyXML2 九卡运行 `stage-40201f75a9cae4744b7007be1e31a3b52c44729647c8763ba31025156790cf79` 成功，11 条库内关系、无外部材料；关联工件 SHA/大小及引用片段审计通过。证据位于原发行验收目录 `associations-v3/stage-86fde3b43f3d752129f83426ac106b5c899b9fac1b973c66c038eb836d1cda61/`，旧零关系证据保留。关系不证明替代适用性；来源 39 项未知及最终发布尚未解决。

[CI 34834932825](https://github.com/linlisWorkTeam/domain-knowledge/actions/runs/34834932825) 在 5c72fa5 全部通过：代码 612/612、Console 41/41、acceptance 25/25，日志 `/tmp/WorkbenchCi5cPassed.log`。

网站已切换到 5c72fa5，Console PID 22186；本机能力接口和公网 GET 均为 200，三个前台脚本逐字节核对发行目录。原 8 条批次和知识保留；备份位于新发行目录 `pre-deploy-backup`。第一次备份展开了运行目录依赖符号链接，已停止复制并暂时恢复旧服务，删除仅由本次创建的未完成备份后，使用保留链接的备份成功切换；未删除原始数据。

部署后只读浏览器验证通过，桌面及 390px 窄屏的项目入口、导航、主要按钮、旧知识正文可用，无横向溢出和脚本错误。日志 `/tmp/WorkbenchDeployed5cBrowser.log`，发行目录 `browser/Result.json`。人工查看截图确认布局：[改造后桌面](workbenchScreenshots/ModuleWorkbenchDesktop.png)、[改造后窄屏项目入口](workbenchScreenshots/ModuleWorkbenchNarrow.png)；前版截图保留在上文。真实 C/C++ 验收库尚未导入线上，不能将线上旧知识当作新链路通过。

## C 当前重建的可信、固定与关联结果（2026-09-14 19:04）

绑定 a113f9 重建的可信任务 `stage-0187ebe80e13b2637b63bf5d33f9a84662b8a68619029981ec41b409daa2b3d6` 成功，31/31、复用31、新增模型调用0，累计125237ms。控制进程在内存不足时由原检查点继续，未改变512MiB编译隔离/预检；仅临时验收控制进程降低堆上限至128/96MiB，线上默认384MiB不变。参考31、生成31观察保留，69份引用工件SHA及大小审计通过，`c-v11-evaluation/ArtifactAudit.json`。

固定任务 `stage-477154765f51596d9a8d8a60a8993abdba3df430e7831b0a79b2f936583d55eb` 成功，11/11、参考通过、接口兼容，0模型调用、21376ms；复用原固定测试集，29工件审计通过。证据 `c-v11-fixed/`。关联v3任务 `stage-ab5263ef504ddbca838d4e6c53fe9608a5c3b8b83c2535a17e95eccc9d8d169f` 成功，7卡40库内关系、无外部材料，工件审计通过。来源复核和最终发布尚未完成，结果仍未导入线上。
