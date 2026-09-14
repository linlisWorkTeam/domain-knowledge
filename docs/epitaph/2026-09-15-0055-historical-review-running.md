# 显式历史复核已实现并启动真实任务

/root/projects/domain-knowledge-wxc原目录不动；工作区/tmp/domain-knowledge-workbench，代码4c34ead5b7ec91f4efea1cbc7d7cd699a9c25662，PR50 Draft，全goal active。线上956fe26不变。

source-historical-review-v1由显式参数/页面按钮启动独立任务，默认继承原规则。priorFindingsRef保留原检查点；转成必须逐条回应的history线索，反驳需固定源码引用和理由。Domain定义映射，应用校验原Review/命令/正文/源码绑定，发布prepare/resume重验历史。页面中文显示回应。不能将引用存在当语义正确，不自动修改原记录。31定向+4完整原生+5架构/type/spec通过；原生用128MiB、--optimize-for-size、--expose-gc、--test-isolation=none正常门槛51秒通过。报告与Spec已随代码推送。

真实任务stage-7fda8f7f2c60f366dfe396bb9af3146161c902daa5660122b83d7187b9367a67现已FAILED/REVIEW_CONCERN_UNRESOLVED，原PID362780已退出，exec会话14098待收尾。驱动/tmp/RunCppHistoricalReview.ts，日志/tmp/CppHistoricalReview.log；运行时/tmp/workbench-revision-acceptance-20260911；证据根real-knowledge-revision/cpp-historical-review/Source.json。仅一个模型任务，驱动128MiB堆、optimize-for-size和周期GC。冻结43例评测28fc成功结果，9张原卡，历史1条ToInt“接口声明与调用约定”意见。累计2调用140200tokens、26068ms；必须重查状态，只能同ID恢复，不创建重复任务。旧source434571成功但质量UNRESOLVED，不恢复。43例可信补证已成功，不恢复。

4c34ead的CI34871610561目前pending；前一修复ef2c80f CI34870923657已cancelled。不要用上一提交CI冒充本次通过。本墓志铭未推送以免重复触发/排队CI；下次有确定结果再整合文档。当前真实复核未通过、未发布。QuoteAudit.json已逐字核对两次失败：唯一错误是FloatAttribute头文件声明引用的缩进或前置注释，其他引用匹配；首轮空格替代TAB，次轮添加不匹配注释。两轮均确认真实的内联位置错误，不能为修格式改判PASS。下一步反馈具体失败引用及固定单行候选，在不放宽逐字校验的前提下恢复同任务。

后续：等待并审计本真实任务，确认原ToInt伪差异能否被有依据反驳；保留未知风险。显式复核成功不自动让普通历史收集器忘记旧意见，后续自动流程如何沿用已核实反驳仍需核对。C新卡后续门禁、最终发布、删除旧owner和历史目录兼容、线上完整任务验收仍未完成。现网站、隧道、work/ljy保留；不合并、不删数据、不导入临时验收库。
