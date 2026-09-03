# 知识发布门禁

## PASS 的必要且充分条件

- 所有输入和证据摘要完整且权限校验无违规；
- 构建成功，全部 critical case 通过；
- Core Gate 在规定重复次数中全部满足策略且非 `UNSTABLE`；
- oracle 均有参考执行验证；
- provenance 完整，无阻塞级 Check finding；
- 当前版本不劣于 historical best 的关键指标；
- GatePolicy、测试集和工具链指纹均已固化。

门禁按固定顺序产出 `PASS/ITERATE/ROLLBACK/STOPPED` 和 reason codes，不接受 Agent 自评分。发布由 KnowledgeStore 原子完成：候选状态校验、写 publication receipt、状态置 `VERIFIED`、追加事件不可分割。人工修订只创建新候选，必须 fresh CodeAgent → EvalRunner → Gate 后才可发布。
