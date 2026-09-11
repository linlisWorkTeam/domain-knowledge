# 真实修订范围与可信复用审计

实际/tmp/domain-knowledge-workbench，feat/five-stage-workbench，最新功能ef4b3d5/504ac15，目标active，旧站原树保持，Node24/384MiB。

本轮完成实际CAS/SQLite只读审计而非仅等待：/tmp/VerifyLiveRevisionScope.ts重新验证beforeRef/afterRef摘要及size，使用markdownSections比较两张真实修订卡，只有各自获准H2改变（配套接口与调用契约、公共接口与数据结构），其他章节/前言字节不变；index检查点卡ID集合精确等于2张修订卡，disposition均updated。ScopeAudit.json与脚本/log在real-knowledge-revision/source-correction-after-policy-v1。

/tmp/VerifyLiveTrustedReuse.py只读wb_stage_tasks及验证CAS，从旧eval19c898...与新eb581...比较31案完整input（仅剔除引用sections）和expected，全部一致；新版testSetId变化、新知识绑定变化，revalidated=true/proposed0/reused31，31个actual==expected且PASSED。TrustedReuseAudit.json及脚本/log在evaluation-after-source-correction。没有修改任何卡片、测试或原始证据；publicationVerified=false。

真实source stage-826fed86bba18a7aa3b75ead348d503aac5181395798f5f4a1d341194f734bd4仍RUNNING，PID2522760/session32339，/tmp/SourceAfterCorrectionBindings.log，最新17calls/321059tokens/reserved1501118、elapsed约710s。继续同handle，无终止证据不得重启。当前单次model请求还在其600秒限制内，任务累计时间不是单次超时。

下一必要动作仍是模型终止后先运行三场景原生测试：PATH=/root/.nvm/versions/node/v24.13.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=384 node --test tests/integration/WorkbenchEvaluation.test.ts > /tmp/MixedApplicationActual.log 2>&1。该新增混合场景尚未执行，不能用typecheck充当通过。然后Console/完整回归，并用完成的新sourceID按新policy继续真实修订，不修改旧版本或清除风险。具体测试准备见0934，v16逻辑见0932。双目标C/C++最终完整链路/发布/网站尚未完成，480/32是混合修订修改前基线。
