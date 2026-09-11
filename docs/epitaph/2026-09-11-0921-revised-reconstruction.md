# 真实修订两卡与新重建

实际/tmp/domain-knowledge-workbench，feat/five-stage-workbench，Node24/384MiB，目标active、旧站原树不动，480自动化/32Console通过状态不变。

source correction stage-08294ed8fd24c91739942eb07e10a368adb172e70fac9d545965324a8b61952c已SUCCEEDED/UNRESOLVED，4calls/234129tokens/131033ms；session14840结束0。两卡修订REVISED/ACCEPTED，新kv_2071c0226e3c837454c048d4替49fb...、kv_6a18e759801a9e3c5f74560b替76d7...，indexed=true，其他5版本保持。真实修订至少包括tokens=NULL计数调用契约，旧正文和依据保留。UNRESOLVED风险仍阻止发布。脚本、完整JSON和log保存real-knowledge-revision/source-correction-after-policy-v1。

/tmp/RunReconstructionAfterSourceCorrection.ts读取完成修订result.summary.snapshotId和versionIds，要求indexed及updatedVersionIds非空，启动重建。初次误用input.parameters.snapshotId导致PROJECT_INPUT_NOT_FOUND，preflight未模型调用，已保留ReconstructionInvalidInput.log并修复脚本。真实新任务stage-15b051f11b581d63e72c0dd8fdfc38ddfc860a2e193cec60942a3cce0d0060de，PID2515476/session6778，/tmp/ReconstructionAfterSourceCorrection.log，输出real-knowledge-revision/reconstruction-after-source-correction/Reconstruction.json。已RUNNING/1call，不能重复启动。下一轮poll同handle；成功后workbenchEvaluation.start(codeTaskId)，再fixed（复用原C固定cases），再来源核验/进一步修订。重资源串行。

注意真实来源报告中4张UNRESOLVED卡仍含明确SOURCE_MISMATCH章节；当前SourceRevision仅筛选整卡outcome=MISMATCH，所以这些章节暂未处理。这是后续需审查的进展障碍，不可把UNRESOLVED改PASS或删除风险。若调整修订选择语义，要Domain选择绑定的明确章节并保留整卡未解决风险，版本化新执行，旧任务不改/不跨版本恢复，测试保留原门禁。当前source-revision-v4。不要先重复全卡核验未修订正文来赌博PASS。

部署只读定位：旧/tmp/domain-knowledge-taste/docs/epitaph/2026-09-10-1433-console-direct-editing.md记载tmux mvp-console-review、/tmp/mvp-frontend-review/start.sh、tmux mvp-console-tunnel、https://contract-strict-warren-theories.trycloudflare.com、数据/root/.local/share/domain-knowledge-mvp/data。这里只读了历史记录，未实时验证URL或改部署；最终部署前重新确认。免登录用户已授权，不新增账户/审批。双目标完整真实一键/分步/评测/关联/发布及最终报告网站仍待完成。
