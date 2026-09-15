# 合入与下一 Agent 验收交接

## 用户最新决定与当前边界

用户明确要求：“记录墓志铭，留给下个Agent来做验收，PR#38和PR#50合入”。此前“立即停止”已执行；本轮只交接及合并，不恢复模型、编译验收，不部署、不迁移或删除数据。后续验收由下个Agent接手；验收未完成，合并不等于质量门禁通过。原大goal因停止指令已标记blocked，不能自动续跑旧目标。

工作区/tmp/domain-knowledge-workbench；/root/projects/domain-knowledge-wxc含无关旧修改，禁止覆盖。PR38头55661e054edabcb694f84565da41b3f262481171是PR50的祖先，单独对main合并冲突；PR50包含当前main 22fe34fdf1ee9e37c08d0bd17a03b2c7e4103cf0。计划将本交接推入PR50，经最终头CI成功后以merge commit保留历史合入，再核验两个PR状态及38头在main的祖先关系。当前文档不预先宣称合并成功；接手必须读取GitHub实际状态与最新main。PR50此前540bf5a的verify/acceptance均成功，CI34876155536；代码37fc9d9的CI34871914996通过736代码/44Console/25隔离验收。不要用旧CI冒充最终头。

## 已部署网站和验收数据不是同一套

网站https://contract-strict-warren-theories.trycloudflare.com/，127.0.0.1:4310，现PID321369，发行/root/projects/domain-knowledge-releases/2026-09-15-workbench-956fe26/app，线上代码956fe26，免登录。tmux mvp-console-review及mvp-console-tunnel，另保留work和ljy。启动私有配置/root/.local/state/domain-knowledge-deploy/Launch-956fe26.py与Runtime-956fe26.json，只使用，不输出密钥。保持原隧道；合并不自动更新网站。

生产数据/root/.local/share/domain-knowledge-mvp/data：8条旧runs、10知识版本，工作台阶段任务和模块批次均0。C/C++实际任务使用/tmp/workbench-revision-acceptance-20260911：97个阶段任务、41知识版本，模块批次仍0。CLI阶段任务未挂到生产项目/模块批次，所以网站看不到C/C++记录。严禁直接用临时数据库覆盖生产库。下一Agent必须补齐网站项目→模块→批次→阶段→卡片与证据的实际链路；如迁移需设计可审计映射、备份及共享引用校验，不能只复制表或把阶段冒充批次。

## C实际终态与恢复线索

固定jsmn提交25647e692c7906b96ffd2b05ca54c097948e879c，快照project-input-21e524125df7aa1b6059f449e1d1918fab0019d81af04c5de0af3bddf398c107。来源修订05ccb3成功、3张更新卡已索引，7卡整体仍有未知。当前重建stage-289c05a1cd76d080c3a20707ae7d1cec4652c48c240025059e5fc081250c0d94已按用户要求CANCELLED/STAGE_CANCELLED；累计2调用144721tokens、696916ms，PID544106和恢复PID547947均退出。首次超时保存在FirstTimeoutAudit.json；恢复日志/tmp/CCurrentRevisedReconstructionResume1.log。不能凭旧墓志铭RUNNING重启。

驱动/tmp/RunCCurrentRevisedReconstruction.ts；后续/tmp/RunCCurrentRevisedEvaluation.ts和/tmp/RunCCurrentRevisedFixed.ts仅准备，未启动。固定用例取477154...原任务，不改预期。重建→可信测试保留重验→固定评测→来源修订→发布与关联均需在正确输入版本继续；旧31可信/11固定通过不证明当前新卡通过。

## C++已完成的范围与实质卡点

固定TinyXML2提交8224e427b655b83dae5e2298f1e6919523a78737，限XMLUtil类型转换。重建cf781成功，43可信用例任务28fc与40固定用例任务ab722成功。历史来源复核stage-7fda8f7f2c60f366dfe396bb9af3146161c902daa5660122b83d7187b9367a67已SUCCEEDED但质量UNRESOLVED：9卡63节，38匹配、2矛盾、23未知，71调用4806852tokens、399直接引用校验通过，不恢复。

来源修订stage-b1805f1fd67e1817610a3702a8c51963dcb18db9ffce791e6ab94a95f8620902已SUCCEEDED/UNRESOLVED，4调用581626tokens；两草稿均未获通过，updatedVersionIds=[]、indexed=false。34直接工件核验通过。实际Review误判：一是将正确纠正为cpp定义的FloatAttribute/FloatText又称为头文件内联；已核实交接源码正确，header dc6903...只有声明，cpp07b4e7...有定义。二是把可信hexPrefix2对0xg的true/0观察说成false。不能据此修改正确内容或旧可信预期；需对草稿复核引入有证据的纠错/再裁决，保留原审计，不能反复换任务求PASS或抹掉真实未知。

5项额外边界诊断参考/生成均通过，未成为可信集。正式补证bc8c失败NATIVE_TEST_TOOLCHAIN_CHANGED，0模型调用，未运行候选。cpp-fresh-fingerprint/FingerprintDiff.json显示仅NativeSuiteEvaluation.ts和NativeTestCache.ts变化；不可修改旧指纹跨版本恢复。新重建准备输入未启动；新版本必须重算指纹并验证缓存失效/全部旧可信用例保留。旧来源与重建ID严格绑定，不能把旧来源直接指向新重建。

## 证据、验收清单与资源

主要证据根/root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/real-knowledge-revision。重点目录：cpp-historical-review/FinalAudit.json、BoundaryDiagnostics.json、BoundaryCandidateMergeAudit.json；cpp-historical-source-revision/FinalAudit.json及SourceCorrection.json；cpp-historical-boundary-supplement/Evaluation.json；cpp-fresh-fingerprint/FingerprintDiff.json；c-current-revised-reconstruction/Reconstruction.json；c-source-assessment-v1-revision/SourceCorrection.json。报告docs/reports/WorkbenchAcceptance.md保留历史，以上终态优先；PR旧正文“b180正在运行”必须同步更正。

下一Agent仍需完成原五阶段工作台全部验收：C与C++网站可见的真实链路；step/all输入版本、失败取消重启及累计预算；卡片版本分组、增量索引和按需检索；候选参考先验、缓存失效与旧测试保留；修订后索引刷新及明确质量拒绝；关联/无外部材料/替代卡片的真实结果；markdownLite回归；前台桌面和窄屏；原类型/Spec/架构/单元/集成/Console回归不放宽断言。交付前后截图、测试报告、真实运行编号及可访问网站。不增加登录、主动搜索或全语言安装包，不重写v0.2.0。

历史删除仍未完成：线上旧RUNNING检查点没有owner，预览返回409 DELETION_CHECKPOINT_OWNER_UNKNOWN；历史目录/产物兼容待补，不能造owner或删除检查点绕过。二次确认必保留，生产未发送删除确认。模块批次调度与实际阶段归属仍需验收，已实现UI不等于端到端完成。

Node24 /root/.nvm/versions/node/v24.13.0/bin。现工作区有独立依赖，依赖执行前bootstrap:worktree:check；不共享node_modules。生产Node384MiB；真实验收驱动可128MiB + optimize-for-size + expose-gc周期GC。低内存/无swap主机保持模型与编译串行，单进程构建，不放宽隔离、资源、超时或发布门槛。保留源码、配置、审计与失败证据；用户只允许必要时删除旧生成知识。禁止输出任何模型密钥。
