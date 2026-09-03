# 评测模型

## 证据层

1. **硬门**：完整性/权限、可编译、critical behavior、oracle 真实性、稳定性。
2. **质量信号**：Core Gate pass rate、重复运行均值/方差/最差值、覆盖率与 mutation（可用时）、provenance 完整度、严重 findings。
3. **归因信号**：文本/结构相似度，只能解释，不能使失败转通过。

默认每个门禁测试重复执行至少 5 次；报告所有逐次结果，不取最好一次。任何 critical case 失败或结果不稳定均不能 PASS。Verification Score 是带版本的确定性策略输出；缺失可选 coverage/mutation 时明确记 `not_available`，不得按满分处理。

`evaluation-report.schema.json` 以 `inputRefs` 记录输入摘要，并强制记录插件/工具链指纹、测试集/策略版本、脱敏的 `modelConfigSummary` 与 `promptDigest`、逐次结果、critical 结果、测试汇总、findings、score components 和 reason codes，以保证跨轮比较只使用同一 Core Gate 集。
